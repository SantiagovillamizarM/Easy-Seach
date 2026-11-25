"""Avisos por correo: al propietario (reseña nueva), al cliente (el negocio respondió su reseña), a los
administradores (llegó una solicitud de negocio) y al solicitante (su solicitud se aprobó o se rechazó).

Se envían en segundo plano (no hacen esperar a quien publicó) y nunca rompen la petición si el correo falla.
"""
import logging

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.core.text import short_name
from sqlalchemy import select

from app.models import Establishment, OwnershipClaim, Place, Review, User
from app.services import email as email_service
from app.services.email_templates import (
    build_claim_decision_email,
    build_new_claim_email,
    build_new_review_email,
    build_owner_reply_email,
)
from app.services.unsubscribe import unsubscribe_url

logger = logging.getLogger("easysearch.notifications")

MAX_REVIEW_MAILS_PER_HOUR = 10   # si llegan muchas seguidas, nadie recibe una avalancha de correos
MAX_CLAIM_MAILS_PER_HOUR = 20    # avisos de solicitudes nuevas para cada administrador
APPLICANT_ROLE_LABEL = {"dueno": "dueño", "encargado": "encargado autorizado"}


def _send_safely(to: str, subject: str, text: str, html: str, unsubscribe: str) -> None:
    try:
        # List-Unsubscribe: Gmail y Outlook muestran su propio botón "Anular suscripción"
        email_service.send_email(to, subject, text, html, headers={"List-Unsubscribe": f"<{unsubscribe}>"})
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
    if not owner.notify_new_reviews:   # lo apagó en Mi perfil o con el enlace del correo
        return False
    if limiter.hit(f"review-mail:{owner.id}", MAX_REVIEW_MAILS_PER_HOUR, 60 * 60):
        return False
    author = db.get(User, review.user_id)
    url = f"{get_settings().app_url.rstrip('/')}/panel/lugar/{est.id}?tab=resenas"
    unsubscribe = unsubscribe_url(owner.id, "resenas")
    subject, text, html = build_new_review_email(owner.full_name, est.name, short_name(author.full_name),
                                                 review.rating, review.comment, url, unsubscribe)
    background.add_task(_send_safely, owner.email, subject, text, html, unsubscribe)
    return True


def notify_reviewer_reply(db: Session, review: Review, background: BackgroundTasks) -> bool:
    """Avisa al autor que el negocio respondió su reseña (solo la primera respuesta, no cada edición)."""
    if review.status != "approved" or not review.owner_reply:
        return False
    author = db.get(User, review.user_id)
    if author is None or not author.is_active or not author.email_verified or not author.notify_review_replies:
        return False
    if limiter.hit(f"reply-mail:{author.id}", MAX_REVIEW_MAILS_PER_HOUR, 60 * 60):
        return False
    est = db.get(Establishment, review.establishment_id)
    url = f"{get_settings().app_url.rstrip('/')}/lugar/{est.slug}"
    unsubscribe = unsubscribe_url(author.id, "respuestas")
    subject, text, html = build_owner_reply_email(author.full_name, est.name, review.rating, review.comment,
                                                  review.owner_reply, url, unsubscribe)
    background.add_task(_send_safely, author.email, subject, text, html, unsubscribe)
    return True


def _send_plain(to: str, subject: str, text: str, html: str) -> None:
    try:
        email_service.send_email(to, subject, text, html)
    except email_service.EmailError:
        logger.error("Falló un aviso de solicitudes por correo")


def claim_place_name(claim: OwnershipClaim, est: Establishment | None) -> str:
    """Nombre del negocio: el registrado o, en un registro nuevo sin aprobar, el que propuso el solicitante."""
    if est is not None:
        return est.name
    return (claim.proposed_data or {}).get("name") or "Negocio sin nombre"


def notify_admins_new_claim(db: Session, claim: OwnershipClaim, background: BackgroundTasks) -> int:
    """Avisa a cada administrador que llegó una solicitud. Devuelve a cuántos se les programó el correo."""
    applicant = db.get(User, claim.user_id)
    est = db.get(Establishment, claim.establishment_id) if claim.establishment_id else None
    if est is not None:
        municipality = est.municipality.name if est.municipality else None
    else:
        place = db.get(Place, (claim.proposed_data or {}).get("municipality_id") or 0)
        municipality = place.name if place else None
    url = f"{get_settings().app_url.rstrip('/')}/admin/solicitudes"
    admins = db.scalars(select(User).where(User.role == "admin", User.is_active.is_(True),
                                           User.email_verified_at.is_not(None)))
    sent = 0
    for admin in admins:
        if admin.id == applicant.id or limiter.hit(f"claim-mail:{admin.id}", MAX_CLAIM_MAILS_PER_HOUR, 60 * 60):
            continue
        subject, text, html = build_new_claim_email(
            admin.full_name, claim.kind, claim_place_name(claim, est), municipality, applicant.full_name,
            APPLICANT_ROLE_LABEL.get(claim.applicant_role or "", "sin indicar"), claim.contact_phone or "", url)
        background.add_task(_send_plain, admin.email, subject, text, html)
        sent += 1
    return sent


def notify_claim_decision(db: Session, claim: OwnershipClaim, background: BackgroundTasks) -> bool:
    """Avisa al solicitante que su solicitud se aprobó (con el enlace a su panel) o se rechazó (con el motivo)."""
    applicant = db.get(User, claim.user_id)
    if applicant is None or not applicant.is_active or not applicant.email_verified:
        return False
    est = db.get(Establishment, claim.establishment_id) if claim.establishment_id else None
    base = get_settings().app_url.rstrip("/")
    approved = claim.status == "approved"
    if approved and est is not None:
        url = f"{base}/panel/lugar/{est.id}"
    elif est is not None:
        url = f"{base}/lugar/{est.slug}"
    else:
        url = f"{base}/registrar-negocio"
    subject, text, html = build_claim_decision_email(applicant.full_name, claim_place_name(claim, est), approved,
                                                     claim.review_note, url)
    background.add_task(_send_plain, applicant.email, subject, text, html)
    return True
