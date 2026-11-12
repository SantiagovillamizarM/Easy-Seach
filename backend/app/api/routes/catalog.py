"""Catálogo: categorías, lugares, establecimientos, productos/servicios y horarios.

Lectura: pública.
Escritura: administradores, o el propietario asignado a ESE establecimiento.
Cada cambio regenera automáticamente los embeddings afectados.
"""
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, require_roles
from app.core.text import normalize, slugify
from app.db.session import get_db
from app.models import Category, Embedding, Establishment, Offering, OpeningHour, Place, SpecialHour, User
from app.schemas.catalog import (
    CategoryOut,
    EstablishmentCreate,
    EstablishmentDetail,
    EstablishmentSummary,
    EstablishmentUpdate,
    HoursStatusOut,
    OfferingIn,
    OfferingOut,
    OfferingUpdate,
    PlaceOut,
    SpecialHourIn,
    SpecialHourOut,
    WeeklyHoursIn,
)
from app.services.catalog import hours_status
from app.services.embeddings import Embedder, get_embedder, sync_establishments

router = APIRouter(tags=["catalog"])

# Relaciones que se cargan junto con el establecimiento (evita cientos de consultas pequeñas)
_LOAD = (
    selectinload(Establishment.opening_hours),
    selectinload(Establishment.special_hours),
    selectinload(Establishment.photos),
    selectinload(Establishment.offerings),
)


# ------------------------------- Conversión a respuesta ---------------------------------

def to_summary(est: Establishment) -> dict:
    status_ = hours_status(est)
    return {
        "id": est.id, "slug": est.slug, "name": est.name, "address": est.address,
        "neighborhood": est.neighborhood,
        "municipality": est.municipality.name if est.municipality else None,
        "latitude": est.latitude, "longitude": est.longitude,
        "categories": est.categories,
        "price_min": est.price_min, "price_max": est.price_max, "price_level": est.price_level,
        "rating_avg": est.rating_avg, "rating_count": est.rating_count, "is_verified": est.is_verified,
        "photo_url": est.photos[0].url if est.photos else None,
        "hours_status": HoursStatusOut(**status_.__dict__),
    }


def to_detail(est: Establishment) -> dict:
    today = date.today()
    return {
        **to_summary(est),
        "description": est.description, "phone": est.phone, "whatsapp": est.whatsapp, "email": est.email,
        "website": est.website, "instagram": est.instagram, "facebook": est.facebook,
        "timezone": est.timezone, "hours_verified_at": est.hours_verified_at, "source": est.source,
        "owner_id": est.owner_id,
        "offerings": [o for o in est.offerings if o.is_available],
        "photos": est.photos,
        "opening_hours": sorted(est.opening_hours, key=lambda h: (h.day_of_week, h.opens_at)),
        "special_hours": sorted((s for s in est.special_hours if s.date >= today), key=lambda s: s.date),
    }


# ------------------------------- Permisos -----------------------------------------------

def _load(db: Session, establishment_id: int) -> Establishment:
    est = db.scalar(select(Establishment).options(*_LOAD).where(Establishment.id == establishment_id))
    if est is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Establecimiento no encontrado")
    return est


def get_editable_establishment(
    establishment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Establishment:
    """Admin: cualquiera. Owner: solo el suyo. Los demás: prohibido."""
    est = _load(db, establishment_id)
    is_owner = user.role == "owner" and est.owner_id == user.id
    if user.role != "admin" and not is_owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="No puedes editar este establecimiento")
    return est


def _mark_edited(est: Establishment, user: User) -> None:
    """Un establecimiento editado deja de ser sobrescrito por la importación de OSM."""
    if est.source == "osm":
        est.source = "owner" if user.role == "owner" else "manual"


def _save(db: Session, est: Establishment, embedder: Embedder) -> Establishment:
    db.flush()
    db.refresh(est)
    sync_establishments(db, [est], embedder)
    db.commit()
    return _load(db, est.id)


def _categories(db: Session, ids: list[int]) -> list[Category]:
    cats = list(db.scalars(select(Category).where(Category.id.in_(ids)))) if ids else []
    if len(cats) != len(set(ids)):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Alguna categoría no existe")
    return cats


def _check_municipality(db: Session, municipality_id: int) -> None:
    place = db.get(Place, municipality_id)
    if place is None or place.kind != "municipio":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Municipio inválido")


# ------------------------------- Lectura pública ----------------------------------------

@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return list(db.scalars(select(Category).order_by(Category.name)))


@router.get("/places", response_model=list[PlaceOut])
def list_places(
    q: str | None = Query(None, max_length=100, description="Texto para autocompletar"),
    kind: str | None = Query(None, pattern="^(municipio|barrio)$"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    stmt = select(Place)
    if kind:
        stmt = stmt.where(Place.kind == kind)
    if q:
        stmt = stmt.where(Place.normalized_name.contains(normalize(q), autoescape=True))
    return list(db.scalars(stmt.order_by(Place.kind.desc(), Place.name).limit(limit)))


@router.get("/establishments", response_model=list[EstablishmentSummary])
def list_establishments(
    municipality_id: int | None = None,
    category: str | None = Query(None, max_length=100, description="slug de la categoría"),
    name: str | None = Query(None, max_length=100, description="Filtrar por nombre (no es la búsqueda IA)"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = select(Establishment).options(*_LOAD).where(Establishment.status == "active")
    if municipality_id:
        stmt = stmt.where(Establishment.municipality_id == municipality_id)
    if category:
        stmt = stmt.where(Establishment.categories.any(Category.slug == category))
    if name:
        stmt = stmt.where(func.unaccent(Establishment.name).ilike(
            func.unaccent("%" + name.replace("%", r"\%").replace("_", r"\_") + "%")))
    stmt = stmt.order_by(Establishment.name).limit(limit).offset(offset)
    return [to_summary(e) for e in db.scalars(stmt)]


@router.get("/establishments/{slug}", response_model=EstablishmentDetail)
def get_establishment(slug: str, db: Session = Depends(get_db)):
    est = db.scalar(select(Establishment).options(*_LOAD)
                    .where(Establishment.slug == slug, Establishment.status == "active"))
    if est is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Establecimiento no encontrado")
    return to_detail(est)


# ------------------------------- Escritura ----------------------------------------------

@router.post("/establishments", response_model=EstablishmentDetail, status_code=status.HTTP_201_CREATED)
def create_establishment(
    data: EstablishmentCreate,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
    embedder: Embedder = Depends(get_embedder),
):
    _check_municipality(db, data.municipality_id)
    fields = data.model_dump(exclude={"category_ids"})
    est = Establishment(**fields, source="manual")
    est.categories = _categories(db, data.category_ids)
    base_slug = slugify(f"{data.name} {db.get(Place, data.municipality_id).name}")
    slug, n = base_slug, 2
    while db.scalar(select(Establishment.id).where(Establishment.slug == slug)):
        slug, n = f"{base_slug}-{n}", n + 1
    est.slug = slug
    db.add(est)
    return to_detail(_save(db, est, embedder))


@router.patch("/establishments/{establishment_id}", response_model=EstablishmentDetail)
def update_establishment(
    data: EstablishmentUpdate,
    est: Establishment = Depends(get_editable_establishment),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    embedder: Embedder = Depends(get_embedder),
):
    changes = data.model_dump(exclude_unset=True)
    if "municipality_id" in changes:
        if changes["municipality_id"] is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="El municipio es obligatorio")
        _check_municipality(db, changes["municipality_id"])
    for required in ("name", "latitude", "longitude"):
        if required in changes and changes[required] is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{required} es obligatorio")
    # Validar el rango de precios combinando lo nuevo con lo que ya estaba guardado
    new_min = changes.get("price_min", est.price_min)
    new_max = changes.get("price_max", est.price_max)
    if new_min is not None and new_max is not None and new_min > new_max:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="price_min no puede ser mayor que price_max")
    if "category_ids" in changes:
        est.categories = _categories(db, changes.pop("category_ids") or [])
    for field, value in changes.items():
        setattr(est, field, value)
    _mark_edited(est, user)
    return to_detail(_save(db, est, embedder))


@router.put("/establishments/{establishment_id}/hours", response_model=EstablishmentDetail)
def replace_weekly_hours(
    data: WeeklyHoursIn,
    est: Establishment = Depends(get_editable_establishment),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    embedder: Embedder = Depends(get_embedder),
):
    """Reemplaza el horario semanal completo. Lista vacía = sin horario registrado."""
    est.opening_hours = [OpeningHour(**s.model_dump()) for s in data.slots]
    est.hours_verified_at = datetime.now(timezone.utc)  # confirmado por una persona responsable
    _mark_edited(est, user)
    return to_detail(_save(db, est, embedder))


@router.post("/establishments/{establishment_id}/special-hours", response_model=SpecialHourOut,
             status_code=status.HTTP_201_CREATED)
def add_special_hours(
    data: SpecialHourIn,
    est: Establishment = Depends(get_editable_establishment),
    db: Session = Depends(get_db),
):
    special = SpecialHour(**data.model_dump())
    est.special_hours.append(special)
    db.commit()
    return special


@router.delete("/establishments/{establishment_id}/special-hours/{special_id}",
               status_code=status.HTTP_204_NO_CONTENT)
def delete_special_hours(
    special_id: int,
    est: Establishment = Depends(get_editable_establishment),
    db: Session = Depends(get_db),
):
    special = next((s for s in est.special_hours if s.id == special_id), None)
    if special is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Horario especial no encontrado")
    est.special_hours.remove(special)
    db.commit()


@router.post("/establishments/{establishment_id}/offerings", response_model=OfferingOut,
             status_code=status.HTTP_201_CREATED)
def add_offering(
    data: OfferingIn,
    est: Establishment = Depends(get_editable_establishment),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    embedder: Embedder = Depends(get_embedder),
):
    offering = Offering(**data.model_dump())
    est.offerings.append(offering)
    _mark_edited(est, user)
    _save(db, est, embedder)
    return offering


def _editable_offering(offering_id: int, user: User, db: Session) -> tuple[Offering, Establishment]:
    offering = db.get(Offering, offering_id)
    if offering is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Producto o servicio no encontrado")
    est = get_editable_establishment(offering.establishment_id, user, db)
    return next(o for o in est.offerings if o.id == offering_id), est


@router.patch("/offerings/{offering_id}", response_model=OfferingOut)
def update_offering(
    offering_id: int,
    data: OfferingUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    embedder: Embedder = Depends(get_embedder),
):
    offering, est = _editable_offering(offering_id, user, db)
    for field, value in data.model_dump(exclude_unset=True).items():
        if field in {"kind", "name", "is_available"} and value is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{field} no puede estar vacío")
        setattr(offering, field, value)
    _mark_edited(est, user)
    _save(db, est, embedder)
    return db.get(Offering, offering_id)


@router.delete("/offerings/{offering_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_offering(
    offering_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    embedder: Embedder = Depends(get_embedder),
):
    offering, est = _editable_offering(offering_id, user, db)
    est.offerings.remove(offering)
    _mark_edited(est, user)
    _save(db, est, embedder)


# ------------------------------- Vista previa semántica ---------------------------------

@router.get("/semantic-preview")
def semantic_preview(
    q: str = Query(min_length=2, max_length=300),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    embedder: Embedder = Depends(get_embedder),
):
    """Búsqueda vectorial pura (pgvector), sin filtros ni IA generativa.

    Sirve para comprobar que los embeddings funcionan. La búsqueda completa llega en la Fase 3.
    """
    query_vector = embedder.encode_query(q)
    distance = Embedding.embedding.cosine_distance(query_vector)
    # 1) Vecinos más cercanos usando el índice HNSW
    nearest = (
        select(Embedding.establishment_id, Embedding.content, distance.label("distance"))
        .order_by(distance)
        .limit(limit * 5)
        .subquery()
    )
    # 2) Mejor coincidencia por establecimiento
    best = (
        select(nearest.c.establishment_id, func.min(nearest.c.distance).label("distance"))
        .group_by(nearest.c.establishment_id)
        .order_by(func.min(nearest.c.distance))
        .limit(limit)
    )
    rows = db.execute(best).all()
    ests = {e.id: e for e in db.scalars(select(Establishment).options(*_LOAD)
                                        .where(Establishment.id.in_([r.establishment_id for r in rows]),
                                               Establishment.status == "active"))}
    return [
        {"similarity": round(1 - r.distance, 4), **to_summary(ests[r.establishment_id])}
        for r in rows if r.establishment_id in ests
    ]
