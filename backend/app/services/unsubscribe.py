"""Enlaces para dejar de recibir avisos por correo, sin iniciar sesión.

El enlace lleva el usuario y el tipo de aviso FIRMADOS con la clave secreta del servidor (HMAC): nadie puede
fabricar uno para dar de baja a otra persona. No vence, como es costumbre en estos enlaces.
"""
import hashlib
import hmac

from app.core.config import get_settings

# tipo de aviso (como va en el enlace) -> campo del usuario
KINDS = {"resenas": "notify_new_reviews", "respuestas": "notify_review_replies"}


def _sign(user_id: int, kind: str) -> str:
    key = get_settings().secret_key.encode()
    return hmac.new(key, f"unsubscribe:{user_id}:{kind}".encode(), hashlib.sha256).hexdigest()[:32]


def make_token(user_id: int, kind: str) -> str:
    assert kind in KINDS
    return f"{user_id}.{kind}.{_sign(user_id, kind)}"


def read_token(token: str) -> tuple[int, str] | None:
    """(id del usuario, tipo de aviso) si el enlace es auténtico; None si fue alterado."""
    try:
        raw_id, kind, signature = token.split(".")
        user_id = int(raw_id)
    except ValueError:
        return None
    if kind not in KINDS or not hmac.compare_digest(signature, _sign(user_id, kind)):
        return None
    return user_id, kind


def unsubscribe_url(user_id: int, kind: str) -> str:
    return f"{get_settings().app_url.rstrip('/')}/correos/baja?t={make_token(user_id, kind)}"
