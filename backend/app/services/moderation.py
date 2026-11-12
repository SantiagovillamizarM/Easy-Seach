"""Moderación de reseñas: reglas automáticas + clasificación con IA + revisión humana.

Resultado posible:
- approved: se publica y cuenta para la calificación.
- rejected: no se publica; el autor ve el motivo y puede editarla.
- pending:  queda en la cola del administrador (casos dudosos o IA no disponible).
"""
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.text import normalize
from app.models import Review
from app.services.llm import LLMError, LLMProvider

logger = logging.getLogger(__name__)

MAX_REVIEWS_PER_HOUR = 5

# Lista básica de groserías e insultos (sin tildes, minúsculas). Se compara por palabra completa.
# No se incluyen palabras que en Colombia pueden ser elogio o crítica legítima ("¡qué chimba!",
# "la comida estaba asquerosa"): esos casos los evalúa la IA con contexto.
OFFENSIVE_WORDS = {
    "hijueputa", "hpta", "hp", "gonorrea", "malparido", "malparida", "maricon", "puta", "puto",
    "carechimba", "pirobo", "piroba", "careverga", "perra", "zorra", "idiota", "imbecil", "estupido",
    "estupida", "pendejo", "pendeja", "cabron", "malnacido", "malnacida",
}
_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "@": "a", "$": "s"})

_URL = re.compile(r"(https?://|www\.|\b[\w-]+\.(com|co|net|org|info|xyz|ly)\b)", re.IGNORECASE)
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.\w+")
_PHONE = re.compile(r"(?:\+?57)?\s*3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}|\b\d{7,}\b")
_REPEATED = re.compile(r"(.)\1{5,}")


@dataclass
class ModerationResult:
    status: str          # approved | rejected | pending
    reason: str | None   # se muestra al autor si fue rechazada


def _words(text: str) -> list[str]:
    return re.findall(r"[a-zñ]+", normalize(text).translate(_LEET))


def check_rules(comment: str) -> str | None:
    """Devuelve el motivo de rechazo, o None si pasa las reglas."""
    if any(w in OFFENSIVE_WORDS for w in _words(comment)):
        return "La reseña contiene lenguaje ofensivo."
    if _URL.search(comment) or _EMAIL.search(comment):
        return "Las reseñas no pueden incluir enlaces ni correos (posible publicidad)."
    if _PHONE.search(comment):
        return "Las reseñas no pueden incluir números de teléfono."
    letters = [c for c in comment if c.isalpha()]
    if len(letters) >= 20 and sum(c.isupper() for c in letters) / len(letters) > 0.7:
        return "Evita escribir toda la reseña en mayúsculas."
    if _REPEATED.search(comment):
        return "La reseña tiene caracteres repetidos en exceso."
    return None


def check_rate_and_duplicates(db: Session, user_id: int, comment: str | None, exclude_review_id: int | None) -> str | None:
    """Límite de frecuencia y textos copiados en varios negocios (señal de spam o reseñas falsas)."""
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    recent = db.scalar(select(func.count(Review.id)).where(Review.user_id == user_id, Review.created_at >= since))
    if exclude_review_id is None and recent >= MAX_REVIEWS_PER_HOUR:
        return "Escribiste muchas reseñas en poco tiempo. Intenta de nuevo más tarde."
    if comment and len(comment) >= 30:
        stmt = select(Review.comment).where(Review.user_id == user_id, Review.comment.is_not(None))
        if exclude_review_id is not None:
            stmt = stmt.where(Review.id != exclude_review_id)
        target = normalize(comment)
        if any(normalize(c) == target for c in db.scalars(stmt)):
            return "Ya publicaste esta misma reseña en otro lugar."
    return None


_SYSTEM = """Eres moderador de reseñas de Easy Search (Colombia). Clasifica la reseña de un cliente sobre un
establecimiento:
- "approve": opinión legítima sobre la experiencia, aunque sea negativa o use lenguaje coloquial.
- "reject": insultos o ataques personales, discriminación, contenido sexual, amenazas, spam o publicidad,
  datos personales de terceros, o texto que no tiene relación con el establecimiento.
- "review": casos dudosos (posible reseña falsa, acusaciones graves como fraude o intoxicación, etc.).
reason: explicación breve en español dirigida al autor (solo si no es "approve")."""

_SCHEMA = {
    "type": "object",
    "properties": {
        "decision": {"type": "string", "enum": ["approve", "reject", "review"]},
        "reason": {"type": "string"},
    },
    "required": ["decision", "reason"],
}


def moderate(db: Session, *, user_id: int, rating: int, comment: str | None, establishment_name: str,
             llm: LLMProvider | None, exclude_review_id: int | None = None) -> ModerationResult:
    limit_reason = check_rate_and_duplicates(db, user_id, comment, exclude_review_id)
    if limit_reason:
        return ModerationResult("rejected", limit_reason)
    if not comment:
        return ModerationResult("approved", None)  # solo estrellas: no hay texto que moderar

    rule_reason = check_rules(comment)
    if rule_reason:
        return ModerationResult("rejected", rule_reason)

    if llm is None:
        return ModerationResult("pending", "Tu reseña será revisada por un moderador antes de publicarse.")
    try:
        prompt = f"Establecimiento: {establishment_name}\nCalificación: {rating}/5\nReseña: {comment}"
        raw = llm.generate_json(prompt, _SCHEMA, system=_SYSTEM)
        decision = raw.get("decision")
    except (LLMError, AttributeError) as exc:
        logger.warning("Moderación con IA no disponible: %s", exc)
        return ModerationResult("pending", "Tu reseña será revisada por un moderador antes de publicarse.")

    if decision == "approve":
        return ModerationResult("approved", None)
    if decision == "reject":
        return ModerationResult("rejected", (raw.get("reason") or "La reseña no cumple las normas de la comunidad.")[:300])
    return ModerationResult("pending", "Tu reseña será revisada por un moderador antes de publicarse.")


def recalculate_rating(db: Session, establishment) -> None:
    """La calificación del establecimiento se calcula SOLO con reseñas aprobadas."""
    avg, count = db.execute(
        select(func.avg(Review.rating), func.count(Review.id))
        .where(Review.establishment_id == establishment.id, Review.status == "approved")
    ).one()
    establishment.rating_count = count
    establishment.rating_avg = round(avg, 2) if count else None
