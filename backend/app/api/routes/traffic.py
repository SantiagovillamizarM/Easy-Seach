"""Aviso de trancón en la ruta del local hacia el usuario (para quien piensa pedir a domicilio)."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_verified_user
from app.core.rate_limit import limit_by_ip, limit_by_user
from app.db.session import get_db
from app.models import Establishment, User
from app.services.traffic import TrafficProvider, get_traffic_provider, traffic_report

router = APIRouter(tags=["traffic"])


class TrafficRequest(BaseModel):
    # Las coordenadas viajan en el cuerpo (no en la URL) para que no queden en los registros del servidor
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class TrafficOut(BaseModel):
    delay_min: int
    delay_max: int
    streets: list[str]


class TrafficResponse(BaseModel):
    available: bool                 # False = el servicio de tráfico no está configurado
    report: TrafficOut | None       # None = no hay trancón importante (o no se pudo saber)


@router.post("/establishments/{establishment_id}/traffic", response_model=TrafficResponse,
             dependencies=[Depends(limit_by_ip("traffic", 60, 60)), Depends(limit_by_user("traffic", 20, 60))])
def establishment_traffic(
    establishment_id: int,
    data: TrafficRequest,
    db: Session = Depends(get_db),
    provider: TrafficProvider | None = Depends(get_traffic_provider),
    _user: User = Depends(get_verified_user),   # gasta cuota de un servicio externo: solo cuentas confirmadas
):
    est = db.scalar(select(Establishment).where(Establishment.id == establishment_id,
                                                Establishment.status == "active"))
    if est is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Establecimiento no encontrado")
    report = traffic_report(est.id, (est.latitude, est.longitude), (data.latitude, data.longitude), provider)
    return {"available": provider is not None, "report": report.__dict__ if report else None}
