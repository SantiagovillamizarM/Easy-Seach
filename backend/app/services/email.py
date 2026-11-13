"""Envío de correos por SMTP (p. ej. Gmail con una "contraseña de aplicación", gratis).

- Puerto 587: conexión STARTTLS (cifrada). Puerto 465: SSL directo.
- Sin SMTP configurado en desarrollo, el correo se escribe en la terminal del backend para poder probar.
"""
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from html import escape as html_escape

from app.core.config import get_settings

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
    first = name.split()[0] if name else ""
    first_html = html_escape(first)  # el nombre lo escribe el usuario: nunca se inserta HTML sin escapar
    text = (f"Hola {first},\n\nTu código para confirmar tu cuenta de Easy Search es: {code}\n\n"
            f"Vence en {minutes} minutos. Si no creaste una cuenta, ignora este correo.\n")
    html = f"""<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0b1224">
  <h2 style="color:#4a3fe0;margin-bottom:4px">Easy Search</h2>
  <p>Hola {first_html},</p>
  <p>Tu código para confirmar tu cuenta es:</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#eef0ff;padding:16px;text-align:center;
            border-radius:12px">{code}</p>
  <p style="color:#475069;font-size:13px">Vence en {minutes} minutos. Si no creaste una cuenta, ignora este correo.</p>
</div>"""
    send_email(to, f"Tu código de Easy Search: {code}", text, html)
