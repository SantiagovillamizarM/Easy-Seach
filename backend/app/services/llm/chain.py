"""Cadena de proveedores: si el primero falla (sin saldo, saturado, caído), responde el siguiente.

Con OpenAI y Gemini configurados, la consulta va primero a OpenAI y, si falla, a Gemini. Si fallan
todos, se lanza LLMError y cada función usa su plan B por reglas (como siempre).
"""
import logging

from app.services.llm.base import LLMError, LLMProvider

logger = logging.getLogger(__name__)


class FallbackLLM:
    def __init__(self, providers: list[LLMProvider]):
        self.providers = providers
        self.name = providers[0].name  # proveedor principal

    def generate_json(self, prompt: str, schema: dict, system: str | None = None,
                      max_tokens: int | None = None) -> dict:
        errors = []
        for provider in self.providers:
            try:
                return provider.generate_json(prompt, schema, system=system, max_tokens=max_tokens)
            except LLMError as exc:
                logger.warning("IA %s no disponible, se intenta la siguiente: %s", provider.name, exc)
                errors.append(f"{provider.name}: {exc}")
        raise LLMError("; ".join(errors) or "Sin proveedores de IA")
