"""Plantillas HTML de los correos de Easy Search.

Los correos no son páginas web: Gmail, Outlook y los celulares solo muestran bien tablas con estilos en línea.
Por eso aquí no hay flexbox, ni clases de Tailwind, ni imágenes externas (muchos clientes las bloquean).
El único <style> es para celulares: apila las tarjetas en pantallas angostas.
"""
from html import escape as html_escape

# Colores de la marca (los mismos de la app)
BRAND, BRAND_DARK, BRAND_LIGHT, BRAND_SOFT = "#4a3fe0", "#3b31b8", "#7b84ff", "#eef0ff"
INK, INK_SOFT, LINE, CANVAS = "#0b1224", "#475069", "#e3e7f0", "#f6f7fb"
OPEN, ORANGE, ORANGE_SOFT = "#0f9d74", "#c2410c", "#fff4ec"
FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

_MOBILE_CSS = """
@media only screen and (max-width:540px){
  .card{border-radius:0!important}
  .pad{padding-left:20px!important;padding-right:20px!important}
  .col{display:block!important;width:100%!important;padding:0 0 10px 0!important}
  .hero-title{font-size:26px!important}
}"""


def _digit_boxes(code: str) -> str:
    # 6 recuadros de 40 px + márgenes ≈ 300 px: cabe incluso en celulares de 360 px de ancho
    return "".join(
        f'<td style="padding:0 3px"><div style="width:40px;height:56px;line-height:56px;background:#ffffff;'
        f'border:2px solid {BRAND};border-radius:12px;font-family:{FONT};font-size:28px;font-weight:800;'
        f'color:{INK};text-align:center;box-shadow:0 2px 0 {BRAND_LIGHT}">{d}</div></td>'
        for d in code)


def _step(number: int, title: str, text: str) -> str:
    return f"""<tr><td style="padding:0 0 14px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td valign="top" style="width:32px"><div style="width:28px;height:28px;line-height:28px;border-radius:14px;
        background:{BRAND};color:#ffffff;font-family:{FONT};font-size:13px;font-weight:800;text-align:center">{number}</div></td>
    <td style="padding-left:12px;font-family:{FONT};font-size:14px;line-height:1.5;color:{INK}">
      <strong>{title}</strong><br><span style="color:{INK_SOFT}">{text}</span></td>
  </tr></table>
</td></tr>"""


def _feature(color: str, title: str, text: str) -> str:
    return f"""<td class="col" valign="top" width="33%" style="padding:0 5px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:#ffffff;border:1px solid {LINE};border-radius:14px;border-top:4px solid {color}">
    <tr><td style="padding:14px 14px 16px;font-family:{FONT}">
      <div style="font-size:14px;font-weight:800;color:{INK}">{title}</div>
      <div style="margin-top:4px;font-size:12px;line-height:1.5;color:{INK_SOFT}">{text}</div>
    </td></tr>
  </table>
</td>"""


def build_verification_email(name: str, code: str, minutes: int) -> tuple[str, str, str]:
    """Correo con el código de confirmación. Devuelve (asunto, texto plano, HTML)."""
    first = name.split()[0] if name else ""
    first_html = html_escape(first)  # el nombre lo escribe el usuario: nunca se inserta HTML sin escapar
    subject = f"{code} es tu código de Easy Search"
    text = (f"Hola {first},\n\nTu código para confirmar tu cuenta de Easy Search es: {code}\n\n"
            f"Vence en {minutes} minutos. Nunca te lo pediremos por teléfono ni por mensaje.\n"
            "Si no creaste una cuenta, ignora este correo.\n\n— Easy Search · Área metropolitana de Bucaramanga\n")

    html = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>{subject}</title><style>{_MOBILE_CSS}</style></head>
<body style="margin:0;padding:0;background:{CANVAS}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Escribe este código en la app para activar tu
cuenta. Vence en {minutes} minutos.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{CANVAS};padding:28px 0">
<tr><td align="center">
<table class="card" role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid {LINE}">

  <!-- ENCABEZADO: logo + título grande sobre degradado -->
  <tr><td class="pad" style="background:{BRAND};background-image:linear-gradient(135deg,{BRAND_DARK} 0%,{BRAND} 45%,{BRAND_LIGHT} 100%);
                 padding:26px 36px 34px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:40px;height:40px;background:#ffffff;border-radius:11px;text-align:center;
                     font-family:{FONT};font-size:17px;font-weight:900;line-height:40px;color:{BRAND}">ES</td>
          <td style="padding-left:10px;font-family:{FONT};font-size:20px;font-weight:800;color:#ffffff">
            Easy<span style="color:#c3caff">Search</span></td>
        </tr></table>
      </td>
      <td align="right"><span style="display:inline-block;padding:6px 12px;border-radius:999px;
          background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);font-family:{FONT};
          font-size:11px;font-weight:700;letter-spacing:0.5px;color:#ffffff;text-transform:uppercase">Verificación</span></td>
    </tr></table>
    <h1 class="hero-title" style="margin:30px 0 6px;font-family:{FONT};font-size:30px;line-height:1.15;
        font-weight:800;color:#ffffff">Confirma tu correo</h1>
    <p style="margin:0;font-family:{FONT};font-size:15px;line-height:1.5;color:#dfe3ff">
      Un paso más y empiezas a encontrar negocios, productos y servicios cerca de ti.</p>
  </td></tr>

  <!-- SALUDO -->
  <tr><td class="pad" style="padding:30px 36px 6px;font-family:{FONT};color:{INK}">
    <p style="margin:0 0 6px;font-size:20px;font-weight:800">¡Hola, {first_html}! &#128075;</p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:{INK_SOFT}">
      Gracias por registrarte en Easy Search. Este es tu código de verificación:</p>
  </td></tr>

  <!-- CÓDIGO -->
  <tr><td class="pad" align="center" style="padding:22px 36px 10px">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background:{BRAND_SOFT};border-radius:18px;border:1px dashed {BRAND_LIGHT}">
      <tr><td align="center" style="padding:16px 10px 4px;font-family:{FONT};font-size:11px;font-weight:800;
                 letter-spacing:2px;color:{BRAND}">TU CÓDIGO</td></tr>
      <tr><td align="center" style="padding:8px 10px 14px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>{_digit_boxes(code)}</tr></table>
      </td></tr>
      <tr><td align="center" style="padding:0 10px 18px">
        <span style="display:inline-block;padding:6px 14px;border-radius:999px;background:#ffffff;
              border:1px solid {LINE};font-family:{FONT};font-size:12px;color:{INK_SOFT}">
          Vence en <strong style="color:{INK}">{minutes} minutos</strong></span></td></tr>
    </table>
  </td></tr>

  <!-- PASOS -->
  <tr><td class="pad" style="padding:22px 36px 8px">
    <p style="margin:0 0 14px;font-family:{FONT};font-size:12px;font-weight:800;letter-spacing:1.5px;
              color:{INK_SOFT}">CÓMO USARLO</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      {_step(1, "Vuelve a Easy Search", "Abre la pantalla “Confirma tu correo” (si la cerraste, inicia sesión).")}
      {_step(2, "Escribe los 6 números", "Tal como aparecen arriba, sin espacios.")}
      {_step(3, "¡Listo!", "Tu cuenta queda activa y ya puedes buscar.")}
    </table>
  </td></tr>

  <!-- QUÉ PUEDES HACER -->
  <tr><td class="pad" style="padding:14px 31px 6px;background:#ffffff">
    <p style="margin:0 5px 12px;font-family:{FONT};font-size:12px;font-weight:800;letter-spacing:1.5px;
              color:{INK_SOFT}">CON TU CUENTA PUEDES</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      {_feature(BRAND, "Buscar con IA", "Escribe como hablas: “hamburguesas baratas cerca”.")}
      {_feature(OPEN, "Guardar favoritos", "Ten a mano los lugares que más te gustan.")}
      {_feature("#f59e0b", "Calificar", "Comparte tu experiencia con reseñas.")}
    </tr></table>
  </td></tr>

  <!-- SEGURIDAD -->
  <tr><td class="pad" style="padding:20px 36px 32px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:{ORANGE_SOFT};border-radius:12px;border-left:4px solid {ORANGE}"><tr>
      <td style="padding:14px 16px;font-family:{FONT};font-size:13px;line-height:1.55;color:#7c2d12">
        <strong style="color:{ORANGE};letter-spacing:1px">IMPORTANTE</strong><br>
        Nunca compartas este código. Easy Search jamás te lo pedirá por teléfono, WhatsApp ni correo.
        Si no creaste una cuenta, ignora este mensaje: sin el código nadie puede activarla.</td>
    </tr></table>
  </td></tr>

  <!-- PIE -->
  <tr><td class="pad" align="center" style="background:{INK};padding:26px 36px">
    <p style="margin:0;font-family:{FONT};font-size:16px;font-weight:800;color:#ffffff">
      Easy<span style="color:{BRAND_LIGHT}">Search</span></p>
    <p style="margin:6px 0 0;font-family:{FONT};font-size:12px;line-height:1.6;color:#a5adc2">
      Bucaramanga &middot; Floridablanca &middot; Girón &middot; Piedecuesta</p>
    <p style="margin:12px 0 0;font-family:{FONT};font-size:11px;line-height:1.6;color:#6b7390">
      Recibiste este correo porque se creó una cuenta con esta dirección.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>"""
    return subject, text, html
