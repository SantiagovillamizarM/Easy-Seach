"""Avisos por correo: al propietario (reseña nueva) y al cliente (el negocio respondió su reseña).

Se envían en segundo plano (no hacen esperar a quien publicó) y nunca rompen la petición si el correo falla.
"""
import logging

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.core.text import short_name
from app.models import Establishment, Review, User
from app.services import email as email_service
from app.services.email_templates import build_new_review_email, build_owner_reply_email

logger = logging.getLogger("easysearch.notifications")

MAX_REVIEW_MAILS_PER_HOUR = 10   # si llegan muchas seguidas, nadie recibe una avalancha de correos


def _send_safely(to: str, subject: str, text: str, html: str) -> None:
    try:
        email_service.send_email(to, subject, text, html)
    except email_service.EmailError:
        logger.error("Falló un aviso de reseñas por correo")


def notify_owner_new_review(db: Session, review: Review, background: BackgroundTasks) -> bool:
    """Avisa al propietario que se PUBLICÓ una reseña de su negocio. Devuelve True si se programó el correo."""
    if review.status != "approved":
        return False
    est = db.get(Establishment, review.establishment_id)
    owner = db.get(User, est.owner_id) if est and est.owner_id else None
    if owner is None or not owner.is_active or not owner.email_verified or owner.id == review.user_id:
        return False
    if limiter.hit(f"review-mail:{owner.id}", MAX_REVIEW_MAILS_PER_HOUR, 60 * 60):
        return False
    author = db.get(User, review.user_id)
    url = f"{get_settings().app_url.rstrip('/')}/panel/lugar/{est.id}?tab=resenas"
    subject, text, html = build_new_review_email(owner.full_name, est.name, short_name(author.full_name),
                                                 review.rating, review.comment, url)
    background.add_task(_send_safely, owner.email, subject, text, html)
    return True


def notify_reviewer_reply(db: Session, review: Review, background: BackgroundTasks) -> bool:
    """Avisa al autor que el negocio respondió su reseña (solo la primera respuesta, no cada edición)."""
    if review.status != "approved" or not review.owner_reply:
        return False
    author = db.get(User, review.user_id)
    if author is None or not author.is_active or not author.email_verified:
        return False
    if limiter.hit(f"reply-mail:{author.id}", MAX_REVIEW_MAILS_PER_HOUR, 60 * 60):
        return False
    est = db.get(Establishment, review.establishment_id)
    url = f"{get_settings().app_url.rstrip('/')}/lugar/{est.slug}"
    subject, text, html = build_owner_reply_email(author.full_name, est.name, review.rating, review.comment,
                                                  review.owner_reply, url)
    background.add_task(_send_safely, author.email, subject, text, html)
    return True
