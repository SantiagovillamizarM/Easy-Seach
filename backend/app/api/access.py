"""Quién puede buscar: cuentas confirmadas sin límite diario, e invitados con unas pocas búsquedas de prueba.

- Con sesión y correo confirmado: búsqueda normal (con su límite por minuto).
- Con sesión SIN confirmar: se le pide confirmar el correo (no cuenta como invitado).
- Sin sesión (invitado): `guest_searches_per_day` búsquedas cada 24 horas por IP, y entre todos los invitados
  máximo `guest_searches_daily_total` al día. Al agotarlas: 429 con X-Error-Code "guest_limit".
- Repetir la MISMA búsqueda en 10 minutos no gasta otra (volver atrás desde un lugar, recargar la página):
  la interpretación de la IA ya está en caché, así que no cuesta cuota.
"""
import hashlib
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status

from app.api.deps import get_optional_user, get_verified_user
from app.core.config import get_settings
from app.core.rate_limit import client_ip, limiter, too_many
from app.core.text import normalize
from app.models import User

GUEST_WINDOW = 24 * 60 * 60
REPEAT_WINDOW = 10 * 60


@dataclass
class SearchAccess:
    user: User | None
    guest_remaining: int | None = None    # None = no es invitado


def _guest_limit(message: str, retry_after: int) -> HTTPException:
    return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=message,
                         headers={"X-Error-Code": "guest_limit", "Retry-After": str(retry_after)})


async def _query_fingerprint(request: Request) -> str | None:
    """Huella del texto buscado (sin guardar el texto en memoria). FastAPI ya leyó el cuerpo: no se lee dos veces."""
    try:
        body = await request.json()
    except ValueError:
        return None
    text = normalize(str(body.get("q", ""))) if isinstance(body, dict) else ""
    return hashlib.sha256(text.encode()).hexdigest()[:16] if text else None


def search_access(name: str, per_minute: int):
    """Dependencia para /search y /recommendations. `name` separa los contadores de cada ruta."""
    async def dependency(request: Request, user: User | None = Depends(get_optional_user)) -> SearchAccess:
        if user is not None:
            get_verified_user(user)                       # 403 si falta confirmar el correo
            retry = limiter.hit(f"{name}:user:{user.id}", per_minute, 60)
            if retry:
                raise too_many(retry)
            return SearchAccess(user=user)

        settings = get_settings()
        limit = settings.guest_searches_per_day
        ip = client_ip(request)
        key = f"guest-{name}:ip:{ip}"
        fingerprint = await _query_fingerprint(request)
        repeat_key = f"guest-{name}:repeat:{ip}:{fingerprint}" if fingerprint else None

        def remaining() -> int:
            return max(0, limit - limiter.count(key, GUEST_WINDOW))

        if repeat_key and limiter.count(repeat_key, REPEAT_WINDOW):
            return SearchAccess(user=None, guest_remaining=remaining())   # la misma búsqueda: no se cobra

        retry = limiter.retry_after(key, limit, GUEST_WINDOW)
        if retry:
            raise _guest_limit(f"Ya usaste tus {limit} búsquedas de prueba. Crea una cuenta gratis para seguir "
                               "buscando sin límites.", retry)
        retry = limiter.hit(f"guest-{name}:all", settings.guest_searches_daily_total, GUEST_WINDOW)
        if retry:
            raise _guest_limit("Las búsquedas de prueba de hoy se agotaron. Crea una cuenta gratis para seguir "
                               "buscando.", retry)
        limiter.record(key)
        if repeat_key:
            limiter.record(repeat_key)
        return SearchAccess(user=None, guest_remaining=remaining())
    return dependency
