"""Endpoints del panel administrativo (solo rol admin).

Secciones: resumen, moderación de reseñas, solicitudes de propiedad, establecimientos,
posibles duplicados, usuarios, categorías y estadísticas de búsqueda.
"""
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import Date, cast, func, or_, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.api.routes.owner import claim_out
from app.core.text import normalize
from app.db.session import get_db
from app.models import (
    Category,
    DuplicateDismissal,
    Establishment,
    OwnershipClaim,
    Place,
    Report,
    Review,
    SearchHistory,
    User,
    establishment_categories,
)
from app.schemas.admin import DuplicateDismissIn, EstablishmentAdminUpdate, ReviewDecision, UserAdminUpdate
from app.schemas.owner import AdminClaimOut, ClaimDecision
from app.services.catalog import LOAD_OPTIONS, to_summary
from app.services.moderation import recalculate_rating
from app.services.notifications import notify_owner_new_review

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_roles("admin"))])

BOGOTA = ZoneInfo("America/Bogota")
DEFAULT_REJECT_REASON = "La reseña no cumple las normas de la comunidad."


def _like(q: str) -> str:
    """Patrón LIKE seguro: el texto del usuario no puede usar % ni _ como comodines."""
    escaped = normalize(q).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _norm_col(column):
    """Columna sin tildes y en minúsculas, para comparar con normalize()."""
    return func.lower(func.unaccent(column))


# ------------------------------- Resumen -------------------------------------------------

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


@router.get("/overview")
def overview(db: Session = Depends(get_db)) -> dict:
    """Todo lo que el administrador necesita ver al entrar: tareas pendientes y salud de los datos."""
    def count(model_col, *conds):
        return db.scalar(select(func.count(model_col)).where(*conds))

    active = Establishment.status == "active"
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    return {
        "pending": {
            "reviews": count(Review.id, Review.status == "pending"),
            "reports": count(Report.id, Report.status == "open"),
            "claims": count(OwnershipClaim.id, OwnershipClaim.status == "pending"),
            "duplicates": len(find_duplicates(db, limit=100)),
        },
        "establishments": {
            "active": count(Establishment.id, active),
            "hidden": count(Establishment.id, Establishment.status == "hidden"),
            "duplicate": count(Establishment.id, Establishment.status == "duplicate"),
            "verified": count(Establishment.id, active, Establishment.is_verified.is_(True)),
            "with_owner": count(Establishment.id, active, Establishment.owner_id.is_not(None)),
        },
        "completeness": {
            "with_hours": count(Establishment.id, active, Establishment.opening_hours.any()),
            "with_prices": count(Establishment.id, active, or_(Establishment.price_min.is_not(None),
                                                                Establishment.price_max.is_not(None),
                                                                Establishment.price_level.is_not(None))),
            "with_description": count(Establishment.id, active, Establishment.description.is_not(None)),
            "with_photos": count(Establishment.id, active, Establishment.photos.any()),
            "with_offerings": count(Establishment.id, active, Establishment.offerings.any()),
        },
        "users": {
            "total": count(User.id),
            "owners": count(User.id, User.role == "owner"),
            "admins": count(User.id, User.role == "admin"),
            "inactive": count(User.id, User.is_active.is_(False)),
        },
        "reviews": {
            "approved": count(Review.id, Review.status == "approved"),
            "rejected": count(Review.id, Review.status == "rejected"),
        },
        "searches_7d": {
            "total": count(SearchHistory.id, SearchHistory.created_at >= week_ago),
            "zero_results": count(SearchHistory.id, SearchHistory.created_at >= week_ago,
                                  SearchHistory.results_count == 0),
        },
    }


# ------------------------------- Moderación de reseñas -----------------------------------

def _open_reports_subquery():
    return (select(Report.review_id, func.count(Report.id).label("n"))
            .where(Report.status == "open", Report.review_id.is_not(None))
            .group_by(Report.review_id).subquery())


@router.get("/reviews")
def list_reviews(
    status_filter: str = Query("pending", alias="status", pattern="^(pending|approved|rejected|reported)$"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    """Cola de moderación. "reported" = reseñas con reportes abiertos de otros usuarios."""
    reports = _open_reports_subquery()
    stmt = (select(Review, User, Establishment, reports.c.n)
            .join(User, User.id == Review.user_id)
            .join(Establishment, Establishment.id == Review.establishment_id)
            .outerjoin(reports, reports.c.review_id == Review.id))
    if status_filter == "reported":
        stmt = stmt.where(reports.c.n > 0).order_by(reports.c.n.desc(), Review.created_at)
    elif status_filter == "pending":
        stmt = stmt.where(Review.status == "pending").order_by(Review.created_at)  # la más antigua primero
    else:
        stmt = stmt.where(Review.status == status_filter).order_by(Review.updated_at.desc())

    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    rows = db.execute(stmt.limit(limit).offset(offset)).all()

    ids = [r.id for r, *_ in rows]
    messages: dict[int, list[dict]] = {}
    if ids:
        for rep in db.scalars(select(Report).where(Report.review_id.in_(ids), Report.status == "open")
                              .order_by(Report.created_at)):
            messages.setdefault(rep.review_id, []).append(
                {"id": rep.id, "message": rep.message, "created_at": rep.created_at})

    return {
        "total": total,
        "counts": {
            "pending": db.scalar(select(func.count(Review.id)).where(Review.status == "pending")),
            "reported": db.scalar(select(func.count()).select_from(reports)),
        },
        "items": [
            {
                "id": r.id, "rating": r.rating, "comment": r.comment, "status": r.status,
                "moderation_reason": r.moderation_reason, "created_at": r.created_at, "updated_at": r.updated_at,
                "establishment": {"id": e.id, "name": e.name, "slug": e.slug},
                "author": {"id": u.id, "name": u.full_name, "email": u.email},
                "open_reports": n or 0,
                "reports": messages.get(r.id, []),
            }
            for r, u, e, n in rows
        ],
    }


def _decide_review(db: Session, review_id: int, admin: User, new_status: str, reason: str | None,
                   report_outcome: str) -> dict:
    review = db.get(Review, review_id)
    if review is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Reseña no encontrada")
    # updated_at se conserva: moderar no es "editar" (si no, la reseña aparecería como editada)
    db.execute(update(Review).where(Review.id == review.id)
               .values(status=new_status, moderation_reason=reason, updated_at=Review.updated_at))
    db.execute(update(Report).where(Report.review_id == review.id, Report.status == "open")
               .values(status=report_outcome, resolved_by_id=admin.id))
    db.flush()
    db.refresh(review)
    est = db.get(Establishment, review.establishment_id)
    recalculate_rating(db, est)
    db.commit()
    return {"id": review.id, "status": review.status, "moderation_reason": review.moderation_reason,
            "rating_avg": float(est.rating_avg) if est.rating_avg is not None else None,
            "rating_count": est.rating_count}


@router.post("/reviews/{review_id}/approve")
def approve_review(review_id: int, background: BackgroundTasks, admin: User = Depends(require_roles("admin")),
                   db: Session = Depends(get_db)):
    """Publica la reseña. Si tenía reportes, se descartan (el moderador decidió que es aceptable).
    Si estaba en revisión, el propietario recibe el aviso de reseña nueva."""
    review = db.get(Review, review_id)
    was_published = review is not None and review.status == "approved"
    result = _decide_review(db, review_id, admin, "approved", None, "dismissed")
    if not was_published:
        notify_owner_new_review(db, db.get(Review, review_id), background)
    return result


@router.post("/reviews/{review_id}/reject")
def reject_review(review_id: int, data: ReviewDecision, admin: User = Depends(require_roles("admin")),
                  db: Session = Depends(get_db)):
    """Oculta la reseña y muestra el motivo a su autor. Los reportes quedan resueltos."""
    reason = (data.reason or "").strip() or DEFAULT_REJECT_REASON
    return _decide_review(db, review_id, admin, "rejected", reason, "resolved")


# ------------------------------- Solicitudes de propiedad --------------------------------

@router.get("/claims", response_model=list[AdminClaimOut])
def list_claims(status_filter: str = Query("pending", alias="status", pattern="^(pending|approved|rejected|all)$"),
                db: Session = Depends(get_db)):
    stmt = (select(OwnershipClaim, Establishment, User)
            .join(Establishment, Establishment.id == OwnershipClaim.establishment_id)
            .join(User, User.id == OwnershipClaim.user_id))
    if status_filter == "pending":
        stmt = stmt.where(OwnershipClaim.status == "pending").order_by(OwnershipClaim.created_at)
    else:
        if status_filter != "all":
            stmt = stmt.where(OwnershipClaim.status == status_filter)
        stmt = stmt.order_by(OwnershipClaim.created_at.desc()).limit(200)
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


# ------------------------------- Establecimientos ----------------------------------------

def _admin_items(db: Session, ests: list[Establishment]) -> list[dict]:
    owner_ids = {e.owner_id for e in ests if e.owner_id}
    owners = {u.id: u for u in db.scalars(select(User).where(User.id.in_(owner_ids)))} if owner_ids else {}
    items = []
    for est in ests:
        owner = owners.get(est.owner_id)
        items.append({
            **to_summary(est),
            # Los objetos Category se convierten a dict (estos endpoints no usan response_model)
            "categories": [{"id": c.id, "name": c.name, "slug": c.slug} for c in est.categories],
            "status": est.status, "source": est.source, "duplicate_of_id": est.duplicate_of_id,
            "phone": est.phone, "updated_at": est.updated_at,
            "owner": {"id": owner.id, "name": owner.full_name, "email": owner.email} if owner else None,
            "photos_count": len(est.photos), "offerings_count": len(est.offerings),
            "has_hours": bool(est.opening_hours), "has_description": bool(est.description),
        })
    return items


def _load_establishment(db: Session, establishment_id: int) -> Establishment:
    est = db.scalar(select(Establishment).options(*LOAD_OPTIONS).where(Establishment.id == establishment_id))
    if est is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Establecimiento no encontrado")
    return est


@router.get("/establishments")
def list_establishments(
    q: str | None = Query(None, max_length=100),
    status_filter: str = Query("all", alias="status", pattern="^(all|active|hidden|duplicate)$"),
    owner: str | None = Query(None, pattern="^(with|without)$"),
    municipality_id: int | None = None,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    conds = []
    if q and q.strip():
        term = q.strip()
        name_match = _norm_col(Establishment.name).like(_like(term), escape="\\")
        conds.append(or_(name_match, Establishment.id == int(term)) if term.isdigit() else name_match)
    if status_filter != "all":
        conds.append(Establishment.status == status_filter)
    if owner == "with":
        conds.append(Establishment.owner_id.is_not(None))
    elif owner == "without":
        conds.append(Establishment.owner_id.is_(None))
    if municipality_id:
        conds.append(Establishment.municipality_id == municipality_id)

    total = db.scalar(select(func.count(Establishment.id)).where(*conds))
    ests = list(db.scalars(select(Establishment).options(*LOAD_OPTIONS).where(*conds)
                           .order_by(Establishment.name, Establishment.id).limit(limit).offset(offset)))
    return {"total": total, "items": _admin_items(db, ests)}


@router.patch("/establishments/{establishment_id}")
def update_establishment_status(establishment_id: int, data: EstablishmentAdminUpdate,
                                db: Session = Depends(get_db)) -> dict:
    """Ocultar / reactivar / marcar como duplicado, y quitar o poner el sello de verificado.

    Un establecimiento oculto o duplicado desaparece de la búsqueda, de los favoritos y del detalle público.
    """
    est = _load_establishment(db, establishment_id)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("status") == "duplicate":
        original = db.get(Establishment, data.duplicate_of_id)
        if original is None or original.id == est.id or original.status != "active":
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                                detail="El establecimiento original debe existir, estar activo y ser distinto")
        est.status, est.duplicate_of_id = "duplicate", original.id
    elif changes.get("status") in ("active", "hidden"):
        est.status, est.duplicate_of_id = changes["status"], None
    if changes.get("is_verified") is not None:
        est.is_verified = changes["is_verified"]
    db.commit()
    return _admin_items(db, [_load_establishment(db, est.id)])[0]


@router.delete("/establishments/{establishment_id}/owner")
def remove_owner(establishment_id: int, db: Session = Depends(get_db)) -> dict:
    """Desvincula al propietario (p. ej. vendió el negocio). Pierde el sello de verificado."""
    est = _load_establishment(db, establishment_id)
    if est.owner_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Este establecimiento no tiene propietario")
    est.owner_id, est.is_verified = None, False
    db.commit()
    return _admin_items(db, [_load_establishment(db, est.id)])[0]


# ------------------------------- Posibles duplicados -------------------------------------

_DUPLICATES_SQL = text("""
    SELECT * FROM (
        SELECT a.id AS a_id, b.id AS b_id,
               similarity(lower(unaccent(a.name)), lower(unaccent(b.name))) AS sim,
               111320 * sqrt(power(a.latitude - b.latitude, 2)
                             + power((a.longitude - b.longitude) * cos(radians(a.latitude)), 2)) AS meters
        FROM establishments a
        JOIN establishments b
          ON b.id > a.id
         AND b.latitude BETWEEN a.latitude - :box AND a.latitude + :box
         AND b.longitude BETWEEN a.longitude - :box AND a.longitude + :box
        WHERE a.status = 'active' AND b.status = 'active'
          AND NOT EXISTS (SELECT 1 FROM duplicate_dismissals d
                          WHERE d.establishment_a_id = a.id AND d.establishment_b_id = b.id)
    ) pairs
    WHERE meters <= :max_meters AND sim >= :min_sim
    ORDER BY sim DESC, meters ASC
    LIMIT :limit
""")


_ROMAN = {"i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"}


def _only_numbering_differs(name_a: str, name_b: str) -> bool:
    """'C.C. Cabecera II Etapa' vs 'III Etapa', 'Bloque A' vs 'Bloque B', 'Taller 2' vs 'Taller 4':
    nombres casi iguales que solo cambian en un número o una letra suelen ser lugares DISTINTOS."""
    a = set(re.findall(r"[a-z0-9]+", normalize(name_a)))
    b = set(re.findall(r"[a-z0-9]+", normalize(name_b)))
    diff = a ^ b
    return bool(diff) and all(t.isdigit() or t in _ROMAN or len(t) == 1 for t in diff)


def find_duplicates(db: Session, limit: int = 50, max_meters: int = 200, min_sim: float = 0.45) -> list:
    """Pares de establecimientos activos con nombre parecido (trigramas) a menos de max_meters metros."""
    rows = db.execute(_DUPLICATES_SQL, {"box": max_meters / 111_000 * 1.5, "max_meters": max_meters,
                                        "min_sim": min_sim, "limit": limit * 3}).all()
    ids = {i for r in rows for i in (r.a_id, r.b_id)}
    names = dict(db.execute(select(Establishment.id, Establishment.name).where(Establishment.id.in_(ids))).all())
    return [r for r in rows if not _only_numbering_differs(names[r.a_id], names[r.b_id])][:limit]


@router.get("/duplicates")
def list_duplicates(limit: int = Query(50, ge=1, le=100), db: Session = Depends(get_db)) -> list[dict]:
    pairs = find_duplicates(db, limit=limit)
    ids = {i for p in pairs for i in (p.a_id, p.b_id)}
    ests = list(db.scalars(select(Establishment).options(*LOAD_OPTIONS).where(Establishment.id.in_(ids)))) if ids else []
    by_id = {item["id"]: item for item in _admin_items(db, ests)}
    return [{"a": by_id[p.a_id], "b": by_id[p.b_id], "similarity": round(float(p.sim), 2),
             "distance_m": round(float(p.meters))} for p in pairs]


@router.post("/duplicates/dismiss", status_code=status.HTTP_201_CREATED)
def dismiss_duplicate(data: DuplicateDismissIn, admin: User = Depends(require_roles("admin")),
                      db: Session = Depends(get_db)) -> dict:
    """"No son duplicados": el par deja de aparecer en la lista."""
    a, b = sorted((data.a_id, data.b_id))
    if db.get(Establishment, a) is None or db.get(Establishment, b) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Establecimiento no encontrado")
    try:
        with db.begin_nested():
            db.add(DuplicateDismissal(establishment_a_id=a, establishment_b_id=b, dismissed_by_id=admin.id))
    except IntegrityError:
        pass  # ya estaba descartado: no es un error
    db.commit()
    return {"detail": "Par descartado"}


# ------------------------------- Usuarios ------------------------------------------------

def _user_items(db: Session, users: list[User]) -> list[dict]:
    ids = [u.id for u in users]
    owned = dict(db.execute(select(Establishment.owner_id, func.count(Establishment.id))
                            .where(Establishment.owner_id.in_(ids)).group_by(Establishment.owner_id)).all()) if ids else {}
    return [{"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role, "is_active": u.is_active,
             "created_at": u.created_at, "establishments_count": owned.get(u.id, 0)} for u in users]


@router.get("/users")
def list_users(
    q: str | None = Query(None, max_length=100),
    role: str | None = Query(None, pattern="^(user|owner|admin)$"),
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    conds = []
    if q and q.strip():
        pattern = _like(q)
        conds.append(or_(func.lower(User.email).like(pattern, escape="\\"),
                         _norm_col(User.full_name).like(pattern, escape="\\")))
    if role:
        conds.append(User.role == role)
    total = db.scalar(select(func.count(User.id)).where(*conds))
    users = list(db.scalars(select(User).where(*conds).order_by(User.created_at.desc(), User.id.desc())
                            .limit(limit).offset(offset)))
    return {"total": total, "items": _user_items(db, users)}


@router.patch("/users/{user_id}")
def update_user(user_id: int, data: UserAdminUpdate, admin: User = Depends(require_roles("admin")),
                db: Session = Depends(get_db)) -> dict:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    if target.id == admin.id and ((data.role and data.role != "admin") or data.is_active is False):
        # Evita que el último administrador se bloquee a sí mismo por accidente
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            detail="No puedes quitarte el rol de administrador ni desactivar tu propia cuenta")
    if data.role and data.role != target.role:
        if data.role == "user":
            # Deja de ser propietario: sus negocios quedan sin dueño y sin sello de verificado
            db.execute(update(Establishment).where(Establishment.owner_id == target.id)
                       .values(owner_id=None, is_verified=False))
        target.role = data.role
    if data.is_active is not None:
        target.is_active = data.is_active  # una cuenta desactivada no puede iniciar sesión ni usar su token
    db.commit()
    return _user_items(db, [target])[0]


# ------------------------------- Categorías ----------------------------------------------

@router.get("/categories")
def list_categories(db: Session = Depends(get_db)) -> list[dict]:
    """Categorías con su número de establecimientos activos.

    Son de solo lectura: están definidas en app/data/categories.py porque el motor de búsqueda
    usa sus palabras clave y grupos (una categoría creada solo en la base de datos no se encontraría).
    """
    counts = (select(establishment_categories.c.category_id, func.count().label("n"))
              .join(Establishment, Establishment.id == establishment_categories.c.establishment_id)
              .where(Establishment.status == "active")
              .group_by(establishment_categories.c.category_id).subquery())
    rows = db.execute(select(Category, counts.c.n).outerjoin(counts, counts.c.category_id == Category.id)
                      .order_by(counts.c.n.desc().nulls_last(), Category.name)).all()
    return [{"id": c.id, "name": c.name, "slug": c.slug, "description": c.description,
             "establishments": n or 0} for c, n in rows]


# ------------------------------- Estadísticas de búsqueda --------------------------------

@router.get("/search-stats")
def search_stats(days: int = Query(30, ge=1, le=365), db: Session = Depends(get_db)) -> dict:
    """Qué busca la gente. Sin datos personales: solo el texto de la búsqueda y su resultado."""
    today = datetime.now(BOGOTA).date()
    start_day = today - timedelta(days=days - 1)
    since = datetime.combine(start_day, datetime.min.time(), tzinfo=BOGOTA)
    in_range = SearchHistory.created_at >= since
    zero = SearchHistory.results_count == 0

    day_col = cast(func.timezone("America/Bogota", SearchHistory.created_at), Date)
    per_day = dict(db.execute(select(day_col, func.count(SearchHistory.id)).where(in_range)
                              .group_by(day_col)).all())
    daily = [{"date": (start_day + timedelta(days=i)).isoformat(),
              "count": per_day.get(start_day + timedelta(days=i), 0)} for i in range(days)]

    query_col = func.lower(func.trim(SearchHistory.query_text))

    def top(*conds, n=15):
        rows = db.execute(select(query_col.label("q"), func.count(SearchHistory.id).label("c"),
                                 func.avg(SearchHistory.results_count).label("avg"))
                          .where(in_range, *conds).group_by(query_col)
                          .order_by(func.count(SearchHistory.id).desc(), query_col).limit(n)).all()
        return [{"query": r.q, "count": r.c, "avg_results": round(float(r.avg or 0), 1)} for r in rows]

    slugs = (select(func.jsonb_array_elements_text(SearchHistory.parsed_query["category_slugs"]).label("slug"))
             .where(in_range).subquery())
    names = dict(db.execute(select(Category.slug, Category.name)).all())
    categories = [{"slug": s, "name": names.get(s, s), "count": c} for s, c in db.execute(
        select(slugs.c.slug, func.count()).group_by(slugs.c.slug).order_by(func.count().desc()).limit(10)).all()]

    total = db.scalar(select(func.count(SearchHistory.id)).where(in_range))
    return {
        "days": days,
        "total": total,
        "zero_results": db.scalar(select(func.count(SearchHistory.id)).where(in_range, zero)),
        "logged_in": db.scalar(select(func.count(SearchHistory.id)).where(in_range, SearchHistory.user_id.is_not(None))),
        "daily": daily,
        "top_queries": top(),
        "top_zero_results": top(zero, n=10),
        "top_categories": categories,
    }
