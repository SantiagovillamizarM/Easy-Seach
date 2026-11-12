"""Interfaz común para proveedores de IA generativa."""
from typing import Protocol


class LLMError(Exception):
    """Cualquier fallo del proveedor (red, cuota, respuesta inválida). Siempre hay un plan B."""


class LLMProvider(Protocol):
    name: str

    def generate_json(self, prompt: str, schema: dict, system: str | None = None) -> dict:
        """Devuelve un objeto JSON que cumple el esquema dado. Lanza LLMError si falla."""
        ...
