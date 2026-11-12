"""Endpoints del panel administrativo (solo rol admin).

En la Fase 1 solo se incluye el listado de usuarios y el resumen de datos; el resto del panel
se construye en la Fase 7.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.session import get_db
from app.models import Category, Establishment, Place, User
from app.schemas.user import UserOut

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_roles("admin"))])


@router.get("/users", response_model=list[UserOut])
def list_users(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> list[User]:
    return list(db.scalars(select(User).order_by(User.id).limit(limit).offset(offset)))


@router.get("/stats")
def stats(db: Session = Depends(get_db)) -> dict:
    """Conteos básicos para verificar la carga de datos."""
    return {
        "users": db.scalar(select(func.count(User.id))),
        "establishments": db.scalar(select(func.count(Establishment.id))),
        "categories": db.scalar(select(func.count(Category.id))),
        "municipalities": db.scalar(select(func.count(Place.id)).where(Place.kind == "municipio")),
        "neighborhoods": db.scalar(select(func.count(Place.id)).where(Place.kind == "barrio")),
    }
