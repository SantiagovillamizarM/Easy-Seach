"""Capa de IA generativa intercambiable.

El resto del sistema solo conoce la interfaz `LLMProvider`. Proveedores disponibles, en este orden:
- Grok (xAI, de pago): el principal si hay clave.
- OpenAI (ChatGPT, de pago): siguiente en la cadena si hay clave.
- Google Gemini (gratis): respaldo automático si fallan los de pago o se agota el cupo diario del usuario.
Con LLM_PROVIDER se puede forzar uno solo ("xai" | "openai" | "gemini"); "auto" los usa en cadena.
"""
from functools import lru_cache

from app.core.config import get_settings
from app.services.llm.base import PAID_PROVIDERS, LLMError, LLMProvider, answered_by
from app.services.llm.chain import FallbackLLM
from app.services.llm.gemini import GeminiProvider
from app.services.llm.openai_provider import OpenAIProvider


@lru_cache
def get_llm() -> LLMProvider | None:
    """Devuelve el proveedor configurado, o None si no hay ninguna clave (se usarán solo reglas)."""
    settings = get_settings()
    choice = (settings.llm_provider or "auto").lower()
    providers: list[LLMProvider] = []
    if settings.xai_api_key and choice in ("auto", "xai"):
        providers.append(OpenAIProvider(
            api_key=settings.xai_api_key,
            model=settings.xai_model,
            # Grok razona antes de responder: necesita algo más de tiempo que los demás
            timeout=max(settings.llm_timeout_seconds, 25.0),
            name="xai",
            base_url=settings.xai_base_url,
        ))
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


def without_paid(llm: LLMProvider | None) -> LLMProvider | None:
    """La misma IA pero sin las de pago (Grok, OpenAI) para quien agotó su cupo diario: queda Gemini o,
    si no hay, reglas."""
    if llm is None:
        return None
    if isinstance(llm, FallbackLLM):
        rest = [p for p in llm.providers if p.name not in PAID_PROVIDERS]
        if not rest:
            return None
        return rest[0] if len(rest) == 1 else FallbackLLM(rest)
    return None if getattr(llm, "name", None) in PAID_PROVIDERS else llm


__all__ = ["LLMError", "LLMProvider", "answered_by", "get_llm", "without_paid"]
