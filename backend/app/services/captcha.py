"""Verificación anti-robots con Cloudflare Turnstile (gratis).

El navegador resuelve el reto y entrega un token de un solo uso; el servidor lo confirma con Cloudflare
usando la clave secreta. Sin TURNSTILE_SECRET_KEY (desarrollo o pruebas) la verificación se omite.
"""
import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger("easysearch.captcha")
VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def captcha_enabled() -> bool:
    return bool(get_settings().turnstile_secret_key)


def verify_captcha(token: str | None, ip: str | None) -> bool:
    settings = get_settings()
    if not settings.turnstile_secret_key:
        return True  # desactivado (en producción la configuración exige la clave)
    if not token or len(token) > 2048:
        return False
    try:
        r = httpx.post(VERIFY_URL, timeout=8, data={
            "secret": settings.turnstile_secret_key, "response": token, **({"remoteip": ip} if ip else {})})
        return bool(r.json().get("success"))
    except (httpx.HTTPError, ValueError) as exc:
        # Si Cloudflare no responde se rechaza (más seguro que dejar pasar a un posible robot)
        logger.warning("No se pudo verificar el captcha: %s", exc.__class__.__name__)
        return False
