"""Capa de IA generativa intercambiable.

El resto del sistema solo conoce la interfaz `LLMProvider`. Para cambiar de Gemini a otro proveedor
(por ejemplo Claude) basta con escribir otro adaptador y devolverlo en `get_llm()`.
"""
from functools import lru_cache

from app.core.config import get_settings
from app.services.llm.base import LLMError, LLMProvider
from app.services.llm.gemini import GeminiProvider


@lru_cache
def get_llm() -> LLMProvider | None:
    """Devuelve el proveedor configurado, o None si no hay clave (se usarán solo reglas)."""
    settings = get_settings()
    if not settings.gemini_api_key:
        return None
    return GeminiProvider(
        api_key=settings.gemini_api_key,
        model=settings.gemini_model,
        fallback_model=settings.gemini_fallback_model,
        timeout=settings.llm_timeout_seconds,
    )


__all__ = ["LLMError", "LLMProvider", "get_llm"]
