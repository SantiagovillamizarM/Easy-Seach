"""Envío de correos por SMTP (p. ej. Gmail con una "contraseña de aplicación", gratis).

- Puerto 587: conexión STARTTLS (cifrada). Puerto 465: SSL directo.
- Sin SMTP configurado en desarrollo, el correo se escribe en la terminal del backend para poder probar.
"""
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from app.core.config import get_settings
from app.services.email_templates import build_verification_email

logger = logging.getLogger("easysearch.email")


class EmailError(RuntimeError):
    pass


def send_email(to: str, subject: str, text: str, html: str | None = None) -> None:
    settings = get_settings()
    if not settings.smtp_configured:
        if settings.is_production:
            raise EmailError("SMTP no está configurado")
        # Solo en desarrollo/pruebas: así se puede probar el registro sin un correo real
        logger.warning("SMTP no configurado. Correo para %s — %s\n%s", to, subject, text)
        return

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((settings.smtp_from_name, settings.smtp_user))
    msg["To"] = to
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")

    context = ssl.create_default_context()
    try:
        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, 465, context=context,
                                  timeout=settings.smtp_timeout_seconds) as server:
                server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds) as server:
                server.starttls(context=context)
                server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
    except (smtplib.SMTPException, OSError) as exc:
        # Nunca se registra la contraseña; solo el tipo de error
        logger.error("No se pudo enviar el correo a %s: %s", to, exc.__class__.__name__)
        raise EmailError("No se pudo enviar el correo") from exc


def send_verification_code(to: str, name: str, code: str, minutes: int) -> None:
    subject, text, html = build_verification_email(name, code, minutes)
    send_email(to, subject, text, html)
