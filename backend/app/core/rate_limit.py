"""Límite de intentos (rate limiting) en memoria, con ventana deslizante.

Protege contra:
- adivinar contraseñas probando muchas seguidas (login),
- crear cuentas en masa (registro),
- abuso de la búsqueda y de la IA (cada consulta a Gemini cuesta cuota),
- spam de solicitudes, reportes y fotos.

Limitación conocida: los contadores viven en la memoria del proceso. Con un solo proceso de uvicorn
(nuestro despliegue) es suficiente; con varios procesos cada uno contaría por separado y habría que
moverlos a Redis.
"""
import math
import threading
import time
from collections import deque

from fastapi import Depends, HTTPException, Request, status

from app.api.deps import get_current_user
from app.models import User


class RateLimiter:
    def __init__(self, max_keys: int = 50_000):
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        self._max_keys = max_keys

    def hit(self, key: str, limit: int, window: float) -> int | None:
        """Registra un intento. Devuelve None si está permitido, o los segundos que hay que esperar."""
        now = time.monotonic()
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= now - window:
                hits.popleft()
            if len(hits) >= limit:
                return max(1, math.ceil(hits[0] + window - now))
            hits.append(now)
            if len(self._hits) > self._max_keys:
                self._sweep(now)
            return None

    def retry_after(self, key: str, limit: int, window: float) -> int | None:
        """Como hit(), pero solo consulta: no suma un intento."""
        now = time.monotonic()
        with self._lock:
            recent = [t for t in self._hits.get(key, ()) if t > now - window]
            if len(recent) >= limit:
                return max(1, math.ceil(recent[0] + window - now))
            return None

    def count(self, key: str, window: float) -> int:
        """Cuántos intentos hay dentro de la ventana (solo consulta)."""
        now = time.monotonic()
        with self._lock:
            return sum(1 for t in self._hits.get(key, ()) if t > now - window)

    def record(self, key: str) -> None:
        """Suma un intento sin comprobar el límite (p. ej. un login fallido)."""
        with self._lock:
            self._hits.setdefault(key, deque()).append(time.monotonic())

    def clear(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def _sweep(self, now: float, max_window: float = 86_400) -> None:
        """Libera memoria: borra las claves sin intentos recientes."""
        for key in [k for k, v in self._hits.items() if not v or v[-1] <= now - max_window]:
            del self._hits[key]


limiter = RateLimiter()


def client_ip(request: Request) -> str:
    """IP del cliente. Detrás de un proxy (Nginx en Plesk) uvicorn debe arrancar con --proxy-headers
    para que esta sea la IP real; no se lee X-Forwarded-For a mano porque cualquiera puede falsificarlo."""
    return request.client.host if request.client else "desconocida"


def too_many(retry_after: int, message: str | None = None) -> HTTPException:
    minutes = math.ceil(retry_after / 60)
    wait = f"{retry_after} segundos" if retry_after < 90 else f"{minutes} minutos"
    return HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS,
        detail=message or f"Demasiadas solicitudes. Intenta de nuevo en {wait}.",
        headers={"Retry-After": str(retry_after)},
    )


def limit_by_ip(name: str, limit: int, window: float):
    """Dependencia: máximo `limit` peticiones cada `window` segundos por IP."""
    def dependency(request: Request) -> None:
        retry = limiter.hit(f"{name}:ip:{client_ip(request)}", limit, window)
        if retry:
            raise too_many(retry)
    return dependency


def limit_by_user(name: str, limit: int, window: float):
    """Dependencia: máximo `limit` peticiones cada `window` segundos por usuario autenticado."""
    def dependency(user: User = Depends(get_current_user)) -> None:
        retry = limiter.hit(f"{name}:user:{user.id}", limit, window)
        if retry:
            raise too_many(retry)
    return dependency
