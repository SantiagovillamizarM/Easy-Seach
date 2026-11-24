"""Capa de IA generativa intercambiable.

El resto del sistema solo conoce la interfaz `LLMProvider`. Proveedores disponibles:
- OpenAI (ChatGPT, de pago): el más preciso; se usa primero si hay clave.
- Google Gemini: respaldo automático si OpenAI falla (o principal si no hay clave de OpenAI).
Con LLM_PROVIDER se puede forzar uno solo ("openai" | "gemini"); "auto" usa los dos en cadena.
"""
from functools import lru_cache

from app.core.config import get_settings
from app.services.llm.base import LLMError, LLMProvider, answered_by
from app.services.llm.chain import FallbackLLM
from app.services.llm.gemini import GeminiProvider
from app.services.llm.openai_provider import OpenAIProvider


@lru_cache
def get_llm() -> LLMProvider | None:
    """Devuelve el proveedor configurado, o None si no hay ninguna clave (se usarán solo reglas)."""
    settings = get_settings()
    choice = (settings.llm_provider or "auto").lower()
    providers: list[LLMProvider] = []
    if settings.openai_api_key and choice in ("auto", "openai"):
        providers.append(OpenAIProvider(
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            timeout=settings.llm_timeout_seconds,
        ))
    if settings.gemini_api_key and choice in ("auto", "gemini"):
        providers.append(GeminiProvider(
            api_key=settings.gemini_api_key,
            model=settings.gemini_model,
            fallback_model=settings.gemini_fallback_model,
            timeout=settings.llm_timeout_seconds,
        ))
    if not providers:
        return None
    return providers[0] if len(providers) == 1 else FallbackLLM(providers)


__all__ = ["LLMError", "LLMProvider", "answered_by", "get_llm"]
