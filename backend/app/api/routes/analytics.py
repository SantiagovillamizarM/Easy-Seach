"""Analítica propia: el frontend avisa cada vez que se abre una página (anónimo, sin cookies).

- No se guarda la IP ni el navegador: solo un código del visitante que cambia cada día.
- No se cuentan robots, ni las páginas del panel de administración, ni a quien activó "No rastrear".
"""
import hashlib
import re
from datetime import datetime
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.rate_limit import client_ip, limit_by_ip
from app.db.session import get_db
from app.models import Establishment, PageView

router = APIRouter(tags=["analytics"])

BOGOTA = ZoneInfo("America/Bogota")
_BOTS = re.compile(r"bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|curl|wget|python|"
                   r"httpx|java/|go-http|postman|insomnia", re.IGNORECASE)
_TABLET = re.compile(r"ipad|tablet|(android(?!.*mobile))", re.IGNORECASE)
_MOBILE = re.compile(r"mobi|iphone|ipod|android|windows phone", re.IGNORECASE)
_SECTIONS = {
    "": "inicio", "buscar": "buscar", "lugar": "lugar", "asistente": "asistente", "perfil": "perfil",
    "favoritos": "favoritos", "historial": "historial", "panel": "panel", "registrar-negocio": "registrar-negocio",
    "ingresar": "cuenta", "registro": "cuenta", "verificar": "cuenta", "recuperar": "cuenta",
}


class PageViewIn(BaseModel):
    path: str = Field(min_length=1, max_length=300)
    referrer: str | None = Field(None, max_length=500)
    logged_in: bool = False


def device_of(user_agent: str) -> str:
    if _TABLET.search(user_agent):
        return "tablet"
    if _MOBILE.search(user_agent):
        return "mobile"
    return "desktop"


def referrer_domain(referrer: str | None, own_host: str | None) -> str | None:
    """'https://www.google.com/search?q=…' -> 'google.com'. Las visitas desde la misma web no cuentan."""
    if not referrer:
        return None
    host = (urlparse(referrer).hostname or "").lower().removeprefix("www.")
    if not host or (own_host and host == own_host.lower().removeprefix("www.")) or host in ("127.0.0.1", "localhost"):
        return None
    return host[:100]


def visitor_hash(ip: str, user_agent: str, now: datetime) -> str:
    """Código del visitante para HOY: no se puede revertir y mañana es otro."""
    day = now.astimezone(BOGOTA).date().isoformat()
    raw = f"{day}|{get_settings().secret_key}|{ip}|{user_agent}".encode()
    return hashlib.sha256(raw).hexdigest()[:32]


@router.post("/analytics/pageview", status_code=status.HTTP_204_NO_CONTENT,
             dependencies=[Depends(limit_by_ip("pageview", 120, 60))])
def track_pageview(data: PageViewIn, request: Request, db: Session = Depends(get_db)) -> Response:
    user_agent = request.headers.get("user-agent", "")
    path = urlparse(data.path).path or "/"
    parts = [p for p in path.split("/") if p]
    first = parts[0] if parts else ""
    if not user_agent or _BOTS.search(user_agent) or first == "admin" or request.headers.get("dnt") == "1":
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    establishment_id = None
    if first == "lugar" and len(parts) > 1:
        establishment_id = db.scalar(select(Establishment.id).where(Establishment.slug == parts[1][:220]))
        path = "/lugar/:negocio"
    elif first == "panel" and len(parts) > 1:
        path = "/panel/lugar/:id"
    now = datetime.now(BOGOTA)
    db.add(PageView(
        section=_SECTIONS.get(first, "otras"), path=path[:200], establishment_id=establishment_id,
        visitor_hash=visitor_hash(client_ip(request), user_agent, now), device=device_of(user_agent),
        referrer=referrer_domain(data.referrer, request.headers.get("x-forwarded-host") or request.url.hostname),
        is_logged_in=data.logged_in,
    ))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
