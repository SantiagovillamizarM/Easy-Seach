"""Perfiles comerciales: solicitudes (administrar un negocio o registrar uno nuevo), negocios del propietario
y fotos."""
from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_verified_user, require_roles
from app.api.routes.catalog import _categories, _check_municipality, get_editable_establishment, to_detail
from app.api.routes.reviews import review_out
from app.core.rate_limit import limit_by_user
from app.db.session import get_db
from app.models import Establishment, EstablishmentPhoto, OwnershipClaim, Review, User
from app.schemas.catalog import EstablishmentDetail
from app.core.text import normalize
from app.schemas.owner import ClaimIn, ClaimOut, PhotoOut, RegistrationIn
from app.services.catalog import LOAD_OPTIONS, to_summary
from app.services.notifications import claim_place_name, notify_admins_new_claim
from app.services.photos import PhotoError, delete_photo_file, save_establishment_photo

router = APIRouter(tags=["owner"])

MAX_PHOTOS = 10


def claim_out(claim: OwnershipClaim, est: Establishment | None) -> dict:
    return {
        "id": claim.id, "kind": claim.kind, "establishment_id": est.id if est else None,
        "establishment_name": claim_place_name(claim, est), "establishment_slug": est.slug if est else None,
        "status": claim.status, "message": claim.message, "contact_phone": claim.contact_phone,
        "applicant_role": claim.applicant_role, "applicant_position": claim.applicant_position,
        "review_note": claim.review_note, "created_at": claim.created_at, "reviewed_at": claim.reviewed_at,
    }


def _applicant_fields(data: ClaimIn | RegistrationIn) -> dict:
    return {"contact_phone": data.contact_phone, "applicant_role": data.applicant_role,
            "applicant_position": data.applicant_position, "consent_at": datetime.now(timezone.utc)}


# ------------------------------- Solicitudes de propiedad --------------------------------

@router.post("/establishments/{establishment_id}/claims", response_model=ClaimOut,
             status_code=status.HTTP_201_CREATED, dependencies=[Depends(limit_by_user("claims", 5, 24 * 3600))])
def create_claim(establishment_id: int, data: ClaimIn, background: BackgroundTasks,
                 user: User = Depends(get_verified_user), db: Session = Depends(get_db)):
    """Un usuario solicita administrar un establecimiento. Un administrador la aprueba o rechaza."""
    est = db.get(Establishment, establishment_id)
    if est is None or est.status != "active":
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Establecimiento no encontrado")
    if est.owner_id is not None:
        detail = ("Ya administras este establecimiento" if est.owner_id == user.id
                  else "Este establecimiento ya tiene un propietario verificado. Si es un error, repórtalo.")
        raise HTTPException(status.HTTP_409_CONFLICT, detail=detail)
    pending = db.scalar(select(OwnershipClaim.id).where(
        OwnershipClaim.establishment_id == est.id, OwnershipClaim.user_id == user.id,
        OwnershipClaim.status == "pending"))
    if pending:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Ya tienes una solicitud pendiente para este lugar")
    claim = OwnershipClaim(kind="claim", establishment_id=est.id, user_id=user.id, message=data.message,
                           **_applicant_fields(data))
    db.add(claim)
    db.commit()
    db.refresh(claim)
    notify_admins_new_claim(db, claim, background)
    return claim_out(claim, est)


@router.post("/business-registrations", response_model=ClaimOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(limit_by_user("registrations", 5, 24 * 3600))])
def register_business(data: RegistrationIn, background: BackgroundTasks, user: User = Depends(get_verified_user),
                      db: Session = Depends(get_db)):
    """Un usuario pide registrar un negocio que no está en la app. Al aprobarse, se crea a su nombre."""
    business = data.business
    _check_municipality(db, business.municipality_id)
    _categories(db, business.category_ids)
    # ¿Ya está en la app? Entonces debe pedir administrarlo desde su página, no registrarlo otra vez
    existing = db.scalar(select(Establishment).where(
        Establishment.status == "active", Establishment.municipality_id == business.municipality_id,
        func.lower(func.unaccent(Establishment.name)) == normalize(business.name)))
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            detail=f"«{existing.name}» ya está en Easy Search. Búscalo y pide administrarlo desde "
                                   f"su página (/lugar/{existing.slug}).")
    pending = db.scalars(select(OwnershipClaim).where(
        OwnershipClaim.user_id == user.id, OwnershipClaim.kind == "register", OwnershipClaim.status == "pending"))
    if any(normalize((c.proposed_data or {}).get("name", "")) == normalize(business.name) for c in pending):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Ya tienes una solicitud pendiente para este negocio")
    claim = OwnershipClaim(kind="register", user_id=user.id, message=data.message,
                           proposed_data=business.model_dump(mode="json"), **_applicant_fields(data))
    db.add(claim)
    db.commit()
    db.refresh(claim)
    notify_admins_new_claim(db, claim, background)
    return claim_out(claim, None)


@router.get("/me/claims", response_model=list[ClaimOut])
def my_claims(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(OwnershipClaim, Establishment)
                      .outerjoin(Establishment, Establishment.id == OwnershipClaim.establishment_id)
                      .where(OwnershipClaim.user_id == user.id)
                      .order_by(OwnershipClaim.created_at.desc())).all()
    return [claim_out(c, e) for c, e in rows]


# ------------------------------- Panel del propietario -----------------------------------

# Reseñas publicadas que el propietario todavía no ha respondido
_UNANSWERED = (Review.status == "approved") & Review.owner_reply.is_(None)


@router.get("/owner/establishments")
def my_establishments(user: User = Depends(require_roles("owner", "admin")), db: Session = Depends(get_db)):
    """Establecimientos que administra el usuario actual (aunque sea admin, solo los asignados a él)."""
    ests = list(db.scalars(select(Establishment).options(*LOAD_OPTIONS)
                           .where(Establishment.owner_id == user.id).order_by(Establishment.name)))
    unanswered = dict(db.execute(
        select(Review.establishment_id, func.count()).where(
            Review.establishment_id.in_([e.id for e in ests]), _UNANSWERED).group_by(Review.establishment_id)).all())
    return [
        {**to_summary(est), "status": est.status, "photos_count": len(est.photos),
         "offerings_count": len(est.offerings), "has_hours": bool(est.opening_hours),
         "has_description": bool(est.description), "unanswered_reviews": unanswered.get(est.id, 0)}
        for est in ests
    ]


@router.get("/owner/establishments/{establishment_id}", response_model=EstablishmentDetail)
def editable_establishment(est: Establishment = Depends(get_editable_establishment)):
    """Datos para el editor del panel: a diferencia del detalle público, incluye los productos
    marcados como no disponibles (para poder reactivarlos)."""
    return {**to_detail(est), "offerings": sorted(est.offerings, key=lambda o: o.id)}  # orden de la carta


@router.get("/owner/establishments/{establishment_id}/reviews")
def establishment_reviews(
    pending: bool = Query(False, description="Solo las que faltan por responder"),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    est: Establishment = Depends(get_editable_establishment),
    db: Session = Depends(get_db),
) -> dict:
    """Reseñas publicadas del negocio, para responderlas desde el panel (las más recientes primero)."""
    base = (Review.establishment_id == est.id) & (Review.status == "approved")
    where = base & Review.owner_reply.is_(None) if pending else base
    rows = db.execute(select(Review, User).join(User, User.id == Review.user_id).where(where)
                      .order_by(Review.created_at.desc()).limit(limit).offset(offset)).all()
    return {
        "total": db.scalar(select(func.count()).select_from(Review).where(where)),
        "unanswered": db.scalar(select(func.count()).select_from(Review).where(base & Review.owner_reply.is_(None))),
        "items": [review_out(r, u) for r, u in rows],
    }


# ------------------------------- Fotos ---------------------------------------------------

@router.post("/establishments/{establishment_id}/photos", response_model=PhotoOut,
             status_code=status.HTTP_201_CREATED, dependencies=[Depends(limit_by_user("photos", 30, 3600))])
async def upload_photo(
    file: UploadFile = File(...),
    caption: str | None = Form(None, max_length=200),
    est: Establishment = Depends(get_editable_establishment),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    count = db.scalar(select(func.count(EstablishmentPhoto.id)).where(EstablishmentPhoto.establishment_id == est.id))
    if count >= MAX_PHOTOS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Máximo {MAX_PHOTOS} fotos por establecimiento")
    data = await file.read(5 * 1024 * 1024 + 1)  # nunca se lee más del límite
    try:
        url = save_establishment_photo(est.id, data)
    except PhotoError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    photo = EstablishmentPhoto(url=url, caption=(caption or "").strip() or None, sort_order=count,
                               uploaded_by_id=user.id)
    est.photos.append(photo)  # a través de la relación: la lista de fotos queda actualizada
    if est.source == "osm":
        est.source = "owner" if user.role == "owner" else "manual"
    db.commit()
    db.refresh(photo)
    return photo


@router.delete("/establishments/{establishment_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(photo_id: int, est: Establishment = Depends(get_editable_establishment),
                 db: Session = Depends(get_db)):
    photo = next((p for p in est.photos if p.id == photo_id), None)
    if photo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Foto no encontrada")
    url = photo.url
    est.photos.remove(photo)
    db.commit()
    delete_photo_file(url)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
