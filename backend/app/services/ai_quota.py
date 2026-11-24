"""Cupo diario de IA de pago (Grok u OpenAI) por usuario.

Cada búsqueda cuesta del orden de US$ 0,002 a 0,009 con IA de pago (interpretación + recomendaciones). Para
que el costo quede acotado, cada usuario tiene un cupo diario de búsquedas con IA de pago; al agotarlo, sus búsquedas
siguen funcionando igual pero las atiende Gemini (gratis). No hace falta una tabla nueva: el historial ya
guarda qué IA interpretó cada búsqueda (`parsed_query.parser`) y cuándo.

El día se cuenta en hora de Colombia (se reinicia a medianoche de Bucaramanga).
"""
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import SearchHistory, User
from app.services.llm import LLMProvider, without_paid
from app.services.llm.base import PAID_PROVIDERS

TIMEZONE = ZoneInfo("America/Bogota")


def start_of_today() -> datetime:
    now = datetime.now(TIMEZONE)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def paid_searches_today(db: Session, user_id: int) -> int:
    """Búsquedas de hoy de este usuario que interpretó una IA de pago (Grok u OpenAI)."""
    return db.scalar(
        select(func.count()).select_from(SearchHistory).where(
            SearchHistory.user_id == user_id,
            SearchHistory.created_at >= start_of_today(),
            SearchHistory.parsed_query["parser"].astext.in_(PAID_PROVIDERS),
        )
    ) or 0


def llm_for_user(db: Session, user: User | None, llm: LLMProvider | None, *, already_recorded: bool = False) -> LLMProvider | None:
    """La IA que le corresponde a este usuario ahora: con IA de pago mientras tenga cupo, si no, solo Gemini.

    - Invitados: ya tienen su propio límite de búsquedas de prueba al día, así que usan la cadena normal.
    - `already_recorded`: la búsqueda actual ya está en el historial (recomendaciones, que se piden después
      de buscar): la que agotó el cupo todavía tiene derecho a sus recomendaciones con IA de pago.
    """
    if llm is None or user is None:
        return llm
    limit = get_settings().openai_searches_per_day
    used = paid_searches_today(db, user.id)
    has_quota = used <= limit if already_recorded else used < limit
    return llm if has_quota else without_paid(llm)
