"""Adaptador para Google Gemini (API REST generateContent con salida JSON estructurada)."""
import json
import logging

import httpx

from app.services.llm.base import LLMError

logger = logging.getLogger(__name__)

API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class GeminiProvider:
    name = "gemini"

    def __init__(self, api_key: str, model: str, fallback_model: str | None = None, timeout: float = 12.0):
        self._api_key = api_key
        self.model = model
        self.fallback_model = fallback_model
        self._timeout = timeout

    def _call(self, model: str, body: dict) -> dict:
        try:
            r = httpx.post(
                API_URL.format(model=model),
                headers={"x-goog-api-key": self._api_key},  # la clave va en un encabezado, no en la URL
                json=body,
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise LLMError(f"Error de red con Gemini: {exc.__class__.__name__}") from exc
        if r.status_code != 200:
            # No se registra el cuerpo completo para no filtrar datos; solo el código y el estado.
            try:
                status = r.json().get("error", {}).get("status", "")
            except ValueError:
                status = ""
            raise LLMError(f"Gemini respondió HTTP {r.status_code} {status}".strip())
        return r.json()

    def generate_json(self, prompt: str, schema: dict, system: str | None = None) -> dict:
        body: dict = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": schema,
                "temperature": 0,
            },
        }
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}

        models = [self.model] + ([self.fallback_model] if self.fallback_model else [])
        last_error: LLMError | None = None
        for model in models:
            try:
                data = self._call(model, body)
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                return json.loads(text)
            except LLMError as exc:
                last_error = exc
                logger.warning("Gemini (%s) falló: %s", model, exc)
            except (KeyError, IndexError, json.JSONDecodeError) as exc:
                last_error = LLMError(f"Respuesta de Gemini inválida: {exc.__class__.__name__}")
                logger.warning("Gemini (%s) devolvió una respuesta inválida", model)
        raise last_error or LLMError("Gemini no disponible")
