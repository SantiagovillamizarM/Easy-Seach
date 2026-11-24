"""Interfaz común para proveedores de IA generativa."""
from typing import Protocol

# Cada proveedor marca su respuesta con este campo para saber qué IA respondió de verdad
# (con la cadena OpenAI → Gemini puede ser cualquiera de las dos).
PROVIDER_KEY = "_provider"
KNOWN_PROVIDERS = ("openai", "gemini")


class LLMError(Exception):
    """Cualquier fallo del proveedor (red, cuota, respuesta inválida). Siempre hay un plan B."""


class LLMProvider(Protocol):
    name: str

    def generate_json(self, prompt: str, schema: dict, system: str | None = None) -> dict:
        """Devuelve un objeto JSON que cumple el esquema dado. Lanza LLMError si falla."""
        ...


def answered_by(raw: object, llm: object) -> str:
    """Saca la marca de proveedor de la respuesta y devuelve qué IA respondió ("openai" | "gemini").

    Si no hay marca (proveedores de prueba), se usa el nombre del proveedor; uno desconocido cuenta
    como "gemini" para mantener las etiquetas conocidas por la API.
    """
    name = raw.pop(PROVIDER_KEY, None) if isinstance(raw, dict) else None
    name = name or getattr(llm, "name", None)
    return name if name in KNOWN_PROVIDERS else "gemini"
