"""Adaptador para OpenAI (API Chat Completions con salida JSON estructurada y esquema estricto).

Usa "Structured Outputs" (`response_format: json_schema` con `strict: true`): el modelo está obligado a
devolver exactamente el esquema pedido. Los esquemas del proyecto están escritos al estilo de Gemini
(`nullable`), así que aquí se traducen al formato estricto de OpenAI.
"""
import copy
import json
import logging
import time

import httpx

from app.services.llm.base import PROVIDER_KEY, LLMError

logger = logging.getLogger(__name__)

API_URL = "https://api.openai.com/v1/chat/completions"

# Si OpenAI responde 429 (cuota/saldo agotado o límite de ritmo) o 5xx (saturado), se salta durante este
# tiempo y responde el respaldo (Gemini o reglas) sin hacer esperar al usuario.
COOLDOWN_SECONDS = 60


def to_strict_schema(schema: dict) -> dict:
    """Traduce un esquema estilo Gemini al modo estricto de OpenAI.

    - `nullable: true` → el tipo admite también "null" (y `null` entra en el `enum`, si lo hay).
    - Todo objeto lleva `additionalProperties: false` y todas sus propiedades en `required`
      (el modo estricto lo exige; los campos opcionales se expresan con "null").
    """
    node = copy.deepcopy(schema)

    def walk(n):
        if not isinstance(n, dict):
            return n
        if n.pop("nullable", False):
            if isinstance(n.get("type"), str):
                n["type"] = [n["type"], "null"]
            if "enum" in n and None not in n["enum"]:
                n["enum"] = [*n["enum"], None]
        if n.get("type") == "object" or (isinstance(n.get("type"), list) and "object" in n["type"]):
            props = n.get("properties", {})
            for key, value in props.items():
                props[key] = walk(value)
            n["required"] = list(props)
            n["additionalProperties"] = False
        if "items" in n:
            n["items"] = walk(n["items"])
        return n

    return walk(node)


def _supports_temperature(model: str) -> bool:
    """Los modelos de razonamiento (serie "o" y GPT-5) solo aceptan la temperatura por defecto."""
    name = model.lower()
    return not (name.startswith("o") or name.startswith("gpt-5"))


class OpenAIProvider:
    name = "openai"

    def __init__(self, api_key: str, model: str, timeout: float = 12.0):
        self._api_key = api_key
        self.model = model
        self._timeout = timeout
        self._cooldown_until = 0.0

    def generate_json(self, prompt: str, schema: dict, system: str | None = None) -> dict:
        if self._cooldown_until > time.monotonic():
            raise LLMError("OpenAI en pausa por cuota agotada o saturación")

        messages = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": prompt}]
        body: dict = {
            "model": self.model,
            "messages": messages,
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "respuesta", "strict": True, "schema": to_strict_schema(schema)},
            },
        }
        if _supports_temperature(self.model):
            body["temperature"] = 0

        try:
            r = httpx.post(
                API_URL,
                headers={"Authorization": f"Bearer {self._api_key}"},
                json=body,
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise LLMError(f"Error de red con OpenAI: {exc.__class__.__name__}") from exc

        if r.status_code != 200:
            # No se registra el cuerpo completo para no filtrar datos; solo el código y el tipo de error.
            try:
                kind = r.json().get("error", {}).get("code") or ""
            except ValueError:
                kind = ""
            if r.status_code == 429 or r.status_code >= 500:
                self._cooldown_until = time.monotonic() + COOLDOWN_SECONDS
            raise LLMError(f"OpenAI respondió HTTP {r.status_code} {kind}".strip())

        try:
            message = r.json()["choices"][0]["message"]
            if message.get("refusal"):
                raise LLMError("OpenAI se negó a responder la solicitud")
            data = json.loads(message["content"])
        except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
            logger.warning("OpenAI (%s) devolvió una respuesta inválida", self.model)
            raise LLMError(f"Respuesta de OpenAI inválida: {exc.__class__.__name__}") from exc
        if isinstance(data, dict):
            data[PROVIDER_KEY] = self.name
        return data
