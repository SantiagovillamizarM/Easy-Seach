"""Reseñas y calificaciones con moderación.

Reglas:
- Una reseña por usuario y establecimiento.
- Solo el autor puede editar su reseña; el autor o un administrador pueden eliminarla.
- Un propietario no puede reseñar su propio establecimiento.
- Solo las reseñas aprobadas son públicas y cuentan para la calificación.
- El propietario del establecimiento (o un administrador) puede responder públicamente cada reseña aprobada.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_verified_user
from app.core.rate_limit import limit_by_user
from app.core.text import short_name
from app.db.session import get_db
from app.models import Establishment, Report, Review, User
from app.schemas.review import MyReviewOut, ReplyIn, ReportIn, ReviewIn, ReviewOut, ReviewsPage
from app.services.llm import LLMProvider, get_llm
from app.services.moderation import check_rules, moderate, recalculate_rating
from app.services.notifications import notify_owner_new_review, notify_reviewer_reply

router = APIRouter(tags=["reviews"])


def review_out(review: Review, author: User) -> dict:
    return {
        "id": review.id,
        "rating": review.rating,
        "comment": review.comment,
        "author": short_name(author.full_name),
        "created_at": review.created_at,
        "edited": (review.updated_at - review.created_at).total_seconds() > 60,
        "status": review.status,
        "moderation_reason": review.moderation_reason,
        "owner_reply": review.owner_reply,
        "owner_reply_at": review.owner_reply_at,
    }


def _active_establishment(db: Session, establishment_id: int) -> Establishment:
    est = db.get(Establishment, establishment_id)
    if est is None or est.status != "active":
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Establecimiento no encontrado")
    return est


@router.get("/establishments/{establishment_id}/reviews", response_model=ReviewsPage)
def list_reviews(
    establishment_id: int,
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    est = _active_establishment(db, establishment_id)
    approved = (Review.establishment_id == est.id) & (Review.status == "approved")
    distribution = {stars: 0 for stars in range(1, 6)}
    for stars, count in db.execute(select(Review.rating, func.count()).where(approved).group_by(Review.rating)):
        distribution[stars] = count
    rows = db.execute(
        select(Review, User).join(User, User.id == Review.user_id).where(approved)
        .order_by(Review.created_at.desc()).limit(limit).offset(offset)
    ).all()
    return {
        "rating_avg": float(est.rating_avg) if est.rating_avg is not None else None,
        "rating_count": est.rating_count,
        "distribution": distribution,
        "total": sum(distribution.values()),
        "items": [review_out(r, u) for r, u in rows],
    }


@router.get("/establishments/{establishment_id}/reviews/mine", response_model=MyReviewOut | None)
def my_review(establishment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    review = db.scalar(select(Review).where(Review.establishment_id == establishment_id, Review.user_id == user.id))
    return review_out(review, user) if review else None


@router.post("/establishments/{establishment_id}/reviews", response_model=MyReviewOut,
             status_code=status.HTTP_201_CREATED)
def create_review(
    establishment_id: int,
    data: ReviewIn,
    background: BackgroundTasks,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
    llm: LLMProvider | None = Depends(get_llm),
):
    est = _active_establishment(db, establishment_id)
    if est.owner_id == user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="No puedes reseñar tu propio establecimiento")
    if db.scalar(select(Review.id).where(Review.establishment_id == est.id, Review.user_id == user.id)):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Ya escribiste una reseña de este lugar; puedes editarla")

    result = moderate(db, user_id=user.id, rating=data.rating, comment=data.comment,
                      establishment_name=est.name, llm=llm)
    review = Review(establishment_id=est.id, user_id=user.id, rating=data.rating, comment=data.comment,
                    status=result.status, moderation_reason=result.reason)
    db.add(review)
    db.flush()
    recalculate_rating(db, est)
    db.commit()
    db.refresh(review)
    notify_owner_new_review(db, review, background)   # solo si quedó publicada
    return review_out(review, user)


def _own_review(db: Session, review_id: int, user: User, allow_admin: bool = False) -> Review:
    review = db.get(Review, review_id)
    if review is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Reseña no encontrada")
    if review.user_id != user.id and not (allow_admin and user.role == "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Solo puedes modificar tus propias reseñas")
    return review


@router.patch("/reviews/{review_id}", response_model=MyReviewOut)
def update_review(
    review_id: int,
    data: ReviewIn,
    background: BackgroundTasks,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
    llm: LLMProvider | None = Depends(get_llm),
):
    review = _own_review(db, review_id, user)
    was_published = review.status == "approved"
    est = db.get(Establishment, review.establishment_id)
    # Toda edición se vuelve a moderar
    result = moderate(db, user_id=user.id, rating=data.rating, comment=data.comment,
                      establishment_name=est.name, llm=llm, exclude_review_id=review.id)
    review.rating, review.comment = data.rating, data.comment
    review.status, review.moderation_reason = result.status, result.reason
    db.flush()
    recalculate_rating(db, est)
    db.commit()
    db.refresh(review)
    if not was_published:   # editar una reseña que ya estaba publicada no genera otro correo
        notify_owner_new_review(db, review, background)
    return review_out(review, user)


@router.delete("/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_review(review_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    review = _own_review(db, review_id, user, allow_admin=True)
    est = db.get(Establishment, review.establishment_id)
    db.delete(review)
    db.flush()
    recalculate_rating(db, est)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ------------------------------- Respuesta del propietario --------------------------------

def _replyable_review(db: Session, review_id: int, user: User) -> Review:
    """Solo el propietario de ESE establecimiento (o un admin) responde, y solo reseñas publicadas."""
    review = db.get(Review, review_id)
    if review is None or review.status != "approved":
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Reseña no encontrada")
    est = db.get(Establishment, review.establishment_id)
    is_owner = user.role == "owner" and est is not None and est.owner_id == user.id
    if user.role != "admin" and not is_owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Solo el propietario del negocio puede responder")
    return review


def _set_reply(db: Session, review: Review, text: str | None) -> None:
    # updated_at se conserva: responder no es "editar" la reseña del cliente
    db.execute(update(Review).where(Review.id == review.id).values(
        owner_reply=text, owner_reply_at=datetime.now(timezone.utc) if text else None, updated_at=Review.updated_at))
    db.commit()
    db.refresh(review)


@router.put("/reviews/{review_id}/reply", response_model=ReviewOut,
            dependencies=[Depends(limit_by_user("review-replies", 30, 3600))])
def reply_to_review(review_id: int, data: ReplyIn, background: BackgroundTasks,
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Crea o edita la respuesta pública. Se publica de inmediato si pasa las reglas básicas (sin groserías,
    enlaces, teléfonos ni mayúsculas sostenidas): el propietario ya fue verificado al aprobar su perfil.
    La primera respuesta le llega por correo al autor de la reseña."""
    review = _replyable_review(db, review_id, user)
    problem = check_rules(data.text)
    if problem:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=problem.replace("La reseña", "La respuesta")
                            .replace("Las reseñas", "Las respuestas").replace("toda la reseña", "toda la respuesta"))
    first_reply = review.owner_reply is None
    _set_reply(db, review, data.text)
    if first_reply:   # editar la respuesta no vuelve a escribirle al cliente
        notify_reviewer_reply(db, review, background)
    return review_out(review, db.get(User, review.user_id))


@router.delete("/reviews/{review_id}/reply", status_code=status.HTTP_204_NO_CONTENT)
def delete_reply(review_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    review = _replyable_review(db, review_id, user)
    _set_reply(db, review, None)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/reviews/{review_id}/report", status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(limit_by_user("reports", 20, 3600))])
def report_review(review_id: int, data: ReportIn, user: User = Depends(get_verified_user),
                  db: Session = Depends(get_db)) -> dict:
    """Cualquier usuario puede reportar una reseña inapropiada. Un reporte por usuario y reseña."""
    review = db.get(Review, review_id)
    if review is None or review.status != "approved":
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Reseña no encontrada")
    if review.user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="No puedes reportar tu propia reseña")
    already = db.scalar(select(Report.id).where(Report.review_id == review.id, Report.reporter_id == user.id))
    if already is None:
        db.add(Report(reporter_id=user.id, review_id=review.id, establishment_id=review.establishment_id,
                      report_type="inappropriate_review", message=data.message))
        db.commit()
    return {"detail": "Gracias. Un moderador revisará la reseña."}
