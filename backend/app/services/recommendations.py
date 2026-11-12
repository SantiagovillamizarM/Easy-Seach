"""Recomendaciones personalizadas con IA, basadas ÚNICAMENTE en datos reales de la base de datos.

Flujo:
1. Se arma una "ficha de hechos" de cada establecimiento (solo datos guardados).
2. La IA redacta por qué cada uno encaja con la búsqueda, usando solo esa ficha.
3. Se VALIDA el texto: frases con precios u horas que no existan en la ficha se eliminan.
4. Si la IA no está disponible o falla, se genera una recomendación con plantillas (sin IA).

Las carencias de información (precio, horario, reseñas, descripción) se calculan sin IA y se muestran siempre.
"""
import hashlib
import json
import logging
import re
from dataclasses import dataclass, field
from decimal import Decimal

from app.core.text import normalize
from app.models import Establishment
from app.services.catalog import hours_status
from app.services.llm import LLMError, LLMProvider
from app.services.query_parser import QueryIntent, _LRU

logger = logging.getLogger(__name__)

MAX_ITEMS = 6
_cache = _LRU(256)


@dataclass
class Recommendation:
    establishment_id: int
    text: str
    data_gaps: list[str] = field(default_factory=list)
    source: str = "reglas"  # gemini | reglas


@dataclass
class RecommendationSet:
    summary: str | None
    items: list[Recommendation]
    source: str


# --------------------------------------------------------------------------------------
# Ficha de hechos
# --------------------------------------------------------------------------------------

def _money(value) -> str:
    return "$" + f"{int(Decimal(value)):,}".replace(",", ".")


def facts_for(est: Establishment, reviews: list[str] | None = None) -> dict:
    """Solo datos reales. Lo que no existe NO aparece (la IA no tiene de dónde inventarlo)."""
    status = hours_status(est)
    facts: dict = {
        "id": est.id,
        "nombre": est.name,
        "categorias": [c.name for c in est.categories],
        "ubicacion": ", ".join(p for p in [est.neighborhood, est.municipality.name if est.municipality else None] if p),
    }
    cuisine = (est.osm_tags or {}).get("cuisine")
    if cuisine:
        facts["cocina_osm"] = cuisine
    if est.description:
        facts["descripcion"] = est.description[:600]
    if est.price_min is not None or est.price_max is not None:
        facts["rango_precios"] = " - ".join(_money(v) for v in (est.price_min, est.price_max) if v is not None)
    offerings = [o for o in est.offerings if o.is_available][:15]
    if offerings:
        facts["productos_servicios"] = [
            f"{o.name} ({_money(o.price)})" if o.price is not None else o.name for o in offerings
        ]
    if est.rating_count:
        facts["calificacion"] = f"{float(est.rating_avg):.1f} de 5 ({est.rating_count} reseñas)"
    if reviews:
        facts["resenas"] = [r[:240] for r in reviews[:3]]
    facts["estado_horario"] = status.label if status.state != "unknown" else "sin información de horario"
    if est.is_verified:
        facts["perfil_verificado"] = True
    return facts


def data_gaps(est: Establishment) -> list[str]:
    gaps = []
    has_prices = est.price_min is not None or est.price_max is not None or any(
        o.price is not None for o in est.offerings)
    if not has_prices:
        gaps.append("precios")
    if not est.opening_hours:
        gaps.append("horario")
    if not est.rating_count:
        gaps.append("reseñas")
    if not est.description and not est.offerings:
        gaps.append("descripción")
    return gaps


# --------------------------------------------------------------------------------------
# Validación anti-invención
# --------------------------------------------------------------------------------------

_MONEY = re.compile(r"\$\s?\d[\d.,]*|\b\d{1,3}(?:[.,]\d{3})+\b|\b\d+\s?mil\b", re.IGNORECASE)
_TIME = re.compile(r"\b\d{1,2}(?::\d{2})?\s?(?:a\.?\s?m\.?|p\.?\s?m\.?|am|pm|horas|hrs)\b", re.IGNORECASE)
_RATING = re.compile(r"\b\d(?:[.,]\d)?\s?(?:estrellas|de 5|/5)\b", re.IGNORECASE)


def _amounts(text: str) -> set[int]:
    values = set()
    for m in _MONEY.findall(text):
        raw = m.lower().replace("$", "").replace(" ", "")
        mil = raw.endswith("mil")
        digits = re.sub(r"[^\d]", "", raw)
        if digits:
            values.add(int(digits) * (1000 if mil else 1))
    return values


def _allowed_amounts(facts: dict, intent: QueryIntent) -> set[int]:
    text = json.dumps(facts, ensure_ascii=False)
    allowed = _amounts(text)
    allowed |= {v for v in (intent.budget_min, intent.budget_max) if v}
    return allowed


def validate_text(text: str, facts: dict, intent: QueryIntent) -> str:
    """Elimina frases con datos verificables (precios, horas, calificaciones) que no estén en la ficha."""
    allowed_money = _allowed_amounts(facts, intent)
    facts_text = normalize(json.dumps(facts, ensure_ascii=False))
    kept = []
    for sentence in re.split(r"(?<=[.!?])\s+", text.strip()):
        if not sentence:
            continue
        if any(v not in allowed_money for v in _amounts(sentence)):
            continue  # precio inventado
        if _TIME.search(sentence) and not all(normalize(t) in facts_text for t in _TIME.findall(sentence)):
            continue  # hora inventada
        if _RATING.search(sentence) and "calificacion" not in facts:
            continue  # calificación inventada
        kept.append(sentence)
    return " ".join(kept).strip()


# --------------------------------------------------------------------------------------
# Plantillas (sin IA)
# --------------------------------------------------------------------------------------

def template_recommendation(est: Establishment, intent: QueryIntent) -> str:
    parts = []
    cats = ", ".join(c.name.lower() for c in est.categories) or "establecimiento"
    place = est.municipality.name if est.municipality else None
    parts.append(f"{est.name} es un lugar de {cats}{f' en {place}' if place else ''} relacionado con tu búsqueda.")
    prices = [p for p in (est.price_min, est.price_max) if p is not None]
    if prices:
        rango = " a ".join(_money(p) for p in prices)
        if intent.budget_max and min(prices) <= intent.budget_max:
            parts.append(f"Sus precios registrados ({rango}) encajan con tu presupuesto.")
        else:
            parts.append(f"Precios registrados: {rango}.")
    if est.rating_count:
        parts.append(f"Tiene una calificación de {float(est.rating_avg):.1f} de 5.")
    return " ".join(parts)


# --------------------------------------------------------------------------------------
# IA
# --------------------------------------------------------------------------------------

SYSTEM_PROMPT = """Eres el asistente de recomendaciones de Easy Search (Bucaramanga, Colombia).
Recibirás la búsqueda de un usuario, lo que se interpretó de ella y fichas de establecimientos.

Reglas OBLIGATORIAS:
- Usa EXCLUSIVAMENTE la información de las fichas. No inventes características, precios, platos, horarios,
  reseñas, calificaciones ni servicios. Si algo no está en la ficha, no lo afirmes.
- Para cada establecimiento escribe 1 o 2 frases en español, en segunda persona ("te"), explicando por qué
  puede encajar con lo que el usuario pidió (tipo de lugar, productos, presupuesto, preferencias, ubicación).
- NO deduzcas servicios, especialidades ni características a partir del NOMBRE del negocio
  (ej. si se llama "Unifrenos" no digas que se especializa en frenos). Usa solo los campos de la ficha.
- No uses calificativos que la ficha no respalde ("general", "el mejor", "económico", "amplio", etc.).
- Si la ficha tiene poca información, dilo con honestidad (ej. "No tenemos detalles de su menú; está registrado
  como comida rápida en Piedecuesta").
- No repitas el horario: la aplicación ya lo muestra.
- summary: una frase general orientando al usuario entre las opciones (sin inventar datos)."""


def _schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"id": {"type": "integer"}, "recommendation": {"type": "string"}},
                    "required": ["id", "recommendation"],
                },
            },
        },
        "required": ["summary", "items"],
    }


def recommend(query: str, intent: QueryIntent, establishments: list[Establishment],
              llm: LLMProvider | None, reviews: dict[int, list[str]] | None = None) -> RecommendationSet:
    establishments = establishments[:MAX_ITEMS]
    reviews = reviews or {}
    facts = {e.id: facts_for(e, reviews.get(e.id)) for e in establishments}
    gaps = {e.id: data_gaps(e) for e in establishments}
    templates = {e.id: template_recommendation(e, intent) for e in establishments}

    def fallback() -> RecommendationSet:
        return RecommendationSet(None, [Recommendation(e.id, templates[e.id], gaps[e.id], "reglas")
                                        for e in establishments], "reglas")

    if llm is None or not establishments:
        return fallback()

    payload = {
        "busqueda": query,
        "interpretacion": {k: v for k, v in intent.model_dump().items()
                           if v not in (None, [], False) and k != "parser"},
        "fichas": list(facts.values()),
    }
    cache_key = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
                               .encode()).hexdigest()
    cached = _cache.get_item(cache_key)
    if cached is not None:
        return cached

    try:
        raw = llm.generate_json(json.dumps(payload, ensure_ascii=False, default=str), _schema(), system=SYSTEM_PROMPT)
    except LLMError as exc:
        logger.warning("Recomendaciones con IA no disponibles: %s", exc)
        return fallback()

    by_id = {}
    for item in raw.get("items", []) if isinstance(raw, dict) else []:
        try:
            eid = int(item.get("id"))
        except (TypeError, ValueError):
            continue
        if eid in facts and isinstance(item.get("recommendation"), str):
            by_id[eid] = item["recommendation"]

    items = []
    for e in establishments:
        text = validate_text(by_id.get(e.id, ""), facts[e.id], intent)
        if len(text) < 15:  # vacío o todo eliminado por la validación -> plantilla
            items.append(Recommendation(e.id, templates[e.id], gaps[e.id], "reglas"))
        else:
            items.append(Recommendation(e.id, text, gaps[e.id], "gemini"))

    summary = raw.get("summary") if isinstance(raw, dict) else None
    if summary:
        summary = validate_text(summary, {"todas": list(facts.values())}, intent) or None
    result = RecommendationSet(summary, items, "gemini")
    _cache.put(cache_key, result)
    return result
