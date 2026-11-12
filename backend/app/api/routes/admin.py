"""Endpoints del panel administrativo (solo rol admin).

La interfaz completa del panel se construye en la Fase 7.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.api.routes.owner import claim_out
from app.db.session import get_db
from app.models import Category, Establishment, OwnershipClaim, Place, User
from app.schemas.owner import AdminClaimOut, ClaimDecision
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


# ------------------------------- Solicitudes de propiedad --------------------------------

@router.get("/claims", response_model=list[AdminClaimOut])
def list_claims(status_filter: str = Query("pending", alias="status", pattern="^(pending|approved|rejected|all)$"),
                db: Session = Depends(get_db)):
    stmt = (select(OwnershipClaim, Establishment, User)
            .join(Establishment, Establishment.id == OwnershipClaim.establishment_id)
            .join(User, User.id == OwnershipClaim.user_id)
            .order_by(OwnershipClaim.created_at))
    if status_filter != "all":
        stmt = stmt.where(OwnershipClaim.status == status_filter)
    return [{**claim_out(c, e), "user_id": u.id, "user_name": u.full_name, "user_email": u.email}
            for c, e, u in db.execute(stmt).all()]


def _pending_claim(db: Session, claim_id: int) -> OwnershipClaim:
    claim = db.get(OwnershipClaim, claim_id)
    if claim is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Solicitud no encontrada")
    if claim.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, detail="La solicitud ya fue revisada")
    return claim


@router.post("/claims/{claim_id}/approve", response_model=AdminClaimOut)
def approve_claim(claim_id: int, data: ClaimDecision, admin: User = Depends(require_roles("admin")),
                  db: Session = Depends(get_db)):
    """Asigna el establecimiento al solicitante, lo marca como verificado y le da el rol de propietario."""
    claim = _pending_claim(db, claim_id)
    est = db.get(Establishment, claim.establishment_id)
    applicant = db.get(User, claim.user_id)
    if est.owner_id is not None and est.owner_id != applicant.id:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="El establecimiento ya tiene otro propietario")
    now = datetime.now(timezone.utc)
    est.owner_id = applicant.id
    est.is_verified = True
    if applicant.role == "user":
        applicant.role = "owner"
    claim.status, claim.reviewed_by_id, claim.reviewed_at, claim.review_note = "approved", admin.id, now, data.note
    # Las demás solicitudes pendientes para el mismo lugar se rechazan automáticamente
    for other in db.scalars(select(OwnershipClaim).where(OwnershipClaim.establishment_id == est.id,
                                                         OwnershipClaim.status == "pending",
                                                         OwnershipClaim.id != claim.id)):
        other.status, other.reviewed_by_id, other.reviewed_at = "rejected", admin.id, now
        other.review_note = "Se aprobó la solicitud de otra persona para este establecimiento."
    db.commit()
    return {**claim_out(claim, est), "user_id": applicant.id, "user_name": applicant.full_name,
            "user_email": applicant.email}


@router.post("/claims/{claim_id}/reject", response_model=AdminClaimOut)
def reject_claim(claim_id: int, data: ClaimDecision, admin: User = Depends(require_roles("admin")),
                 db: Session = Depends(get_db)):
    claim = _pending_claim(db, claim_id)
    est = db.get(Establishment, claim.establishment_id)
    applicant = db.get(User, claim.user_id)
    claim.status, claim.reviewed_by_id = "rejected", admin.id
    claim.reviewed_at = datetime.now(timezone.utc)
    claim.review_note = data.note or "No pudimos verificar que administres este establecimiento."
    db.commit()
    return {**claim_out(claim, est), "user_id": applicant.id, "user_name": applicant.full_name,
            "user_email": applicant.email}
