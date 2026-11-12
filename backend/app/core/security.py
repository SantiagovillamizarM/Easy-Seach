"""Seguridad: hash de contraseñas con Argon2 y tokens JWT."""
from datetime import datetime, timedelta, timezone

import jwt
from pwdlib import PasswordHash

from app.core.config import get_settings

# Argon2: algoritmo recomendado actualmente para guardar contraseñas.
_password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _password_hash.verify(password, password_hash)


# Hash de referencia para que el login tarde lo mismo exista o no el usuario
# (evita adivinar qué correos están registrados midiendo el tiempo de respuesta).
DUMMY_HASH = _password_hash.hash("contraseña-ficticia-para-igualar-tiempos")


def create_access_token(user_id: int, role: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    """Devuelve el contenido del token. Lanza jwt.PyJWTError si es inválido o expiró."""
    settings = get_settings()
    return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
