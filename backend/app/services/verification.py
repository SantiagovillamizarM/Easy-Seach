"""Códigos de confirmación de correo (6 dígitos).

- El código se genera con `secrets` (aleatorio criptográfico) y vence en 15 minutos.
- En la base de datos solo se guarda un HMAC del código: aunque alguien leyera la tabla, no vería los códigos.
- Máximo 5 intentos por código: adivinar uno de 1.000.000 en 5 intentos es prácticamente imposible.
"""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from app.core.config import get_settings
from app.models import User

CODE_TTL_MINUTES = 15
MAX_ATTEMPTS = 5


def _digest(user_id: int, code: str) -> str:
    key = get_settings().secret_key.encode()
    return hmac.new(key, f"{user_id}:{code}".encode(), hashlib.sha256).hexdigest()


def issue_code(user: User) -> str:
    """Genera un código nuevo (invalida el anterior) y lo deja listo para guardar."""
    code = f"{secrets.randbelow(1_000_000):06d}"
    user.verification_code_hash = _digest(user.id, code)
    user.verification_code_expires_at = datetime.now(timezone.utc) + timedelta(minutes=CODE_TTL_MINUTES)
    user.verification_attempts = 0
    return code


def check_code(user: User, code: str) -> str | None:
    """Devuelve None si el código es correcto (y confirma el correo) o un mensaje de error."""
    if user.email_verified_at:
        return None
    if not user.verification_code_hash or not user.verification_code_expires_at:
        return "Pide un código nuevo."
    if user.verification_attempts >= MAX_ATTEMPTS:
        return "Demasiados intentos con este código. Pide uno nuevo."
    if datetime.now(timezone.utc) > user.verification_code_expires_at:
        return "El código venció. Pide uno nuevo."
    user.verification_attempts += 1
    if not hmac.compare_digest(user.verification_code_hash, _digest(user.id, code.strip())):
        left = MAX_ATTEMPTS - user.verification_attempts
        return f"Código incorrecto. Te quedan {left} intentos." if left else "Código incorrecto. Pide uno nuevo."
    user.email_verified_at = datetime.now(timezone.utc)
    user.verification_code_hash = user.verification_code_expires_at = None
    user.verification_attempts = 0
    return None


# ------------------------------- Recuperar la contraseña ---------------------------------
# Mismas reglas (6 dígitos, 15 minutos, 5 intentos), en campos aparte y con otra "sal": un código de
# confirmación de correo nunca sirve para cambiar la contraseña, ni al revés.

def _reset_digest(user_id: int, code: str) -> str:
    key = get_settings().secret_key.encode()
    return hmac.new(key, f"reset:{user_id}:{code}".encode(), hashlib.sha256).hexdigest()


def issue_reset_code(user: User) -> str:
    code = f"{secrets.randbelow(1_000_000):06d}"
    user.reset_code_hash = _reset_digest(user.id, code)
    user.reset_code_expires_at = datetime.now(timezone.utc) + timedelta(minutes=CODE_TTL_MINUTES)
    user.reset_attempts = 0
    return code


def check_reset_code(user: User, code: str) -> bool:
    """True si el código es correcto (y lo gasta: sirve una sola vez). Cuenta los intentos fallidos."""
    if not user.reset_code_hash or not user.reset_code_expires_at or user.reset_attempts >= MAX_ATTEMPTS:
        return False
    if datetime.now(timezone.utc) > user.reset_code_expires_at:
        return False
    user.reset_attempts += 1
    if not hmac.compare_digest(user.reset_code_hash, _reset_digest(user.id, code.strip())):
        return False
    user.reset_code_hash = user.reset_code_expires_at = None
    user.reset_attempts = 0
    # Quien recibió el código en su correo demostró que el correo es suyo
    if not user.email_verified_at:
        user.email_verified_at = datetime.now(timezone.utc)
    return True
