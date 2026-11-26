"""Documentación de Swagger en español para la API de FastAPI.

FastAPI arma los títulos de cada ruta a partir del nombre de la función ("Smart Search", "List Reviews"…). Aquí se
reemplazan por títulos en español, se agrupan las rutas en secciones con descripción y se agrega una introducción.
Se aplica al generar la especificación (no hace falta tocar cada ruta).
"""
from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

DESCRIPCION = """
API de **Easy Search**: búsqueda inteligente de negocios, productos y servicios del área metropolitana de
Bucaramanga.

- El navegador **no** llama a esta API directamente: todo pasa por la puerta de entrada **Spring Boot**
  (`http://127.0.0.1:8020/api`), que reenvía estas rutas a FastAPI.
- **Sesión:** `POST /api/auth/login` devuelve un token JWT. Pulsa **Authorize** y pégalo para probar las rutas
  protegidas (las de usuario, dueño y administrador).
- La búsqueda y el asistente usan IA en cadena (Grok → OpenAI → Gemini) con un cupo diario por usuario.
"""

# Secciones: nombre interno → (nombre en Swagger, descripción)
SECCIONES = {
    "health": ("Sistema", "Estado del servicio."),
    "auth": ("Cuenta", "Registro, confirmación del correo, inicio de sesión, perfil y contraseña."),
    "search": ("Búsqueda", "Búsqueda en lenguaje natural y recomendaciones con IA."),
    "catalog": ("Catálogo", "Categorías, lugares, negocios, horarios y carta (lectura pública; escritura del dueño o admin)."),
    "me": ("Favoritos e historial", "Lo que guarda cada usuario."),
    "reviews": ("Reseñas", "Reseñas de los negocios, respuestas del dueño y reportes."),
    "owner": ("Negocios y solicitudes", "Pedir un negocio, registrar uno nuevo y el panel del propietario."),
    "traffic": ("Tráfico", "Aviso de trancón con TomTom y tramos para el mapa."),
    "analytics": ("Analítica", "Contador de visitas propio y anónimo (sin cookies)."),
    "admin": ("Administración", "Panel del administrador: dashboard, moderación, solicitudes, negocios y usuarios."),
}

TITULOS = {
    ("GET", "/api/health"): "Estado del servicio",
    ("GET", "/api/auth/captcha-config"): "Configuración del anti-robots (Turnstile)",
    ("POST", "/api/auth/register"): "Crear una cuenta",
    ("POST", "/api/auth/verify-email"): "Confirmar el correo con el código",
    ("POST", "/api/auth/resend-code"): "Reenviar el código de confirmación",
    ("POST", "/api/auth/login"): "Iniciar sesión (devuelve el token)",
    ("POST", "/api/auth/forgot-password"): "Pedir un código para recuperar la contraseña",
    ("POST", "/api/auth/reset-password"): "Cambiar la contraseña con el código",
    ("GET", "/api/auth/me"): "Mi perfil",
    ("PATCH", "/api/auth/me"): "Actualizar mi perfil",
    ("PATCH", "/api/auth/me/notifications"): "Preferencias de correo",
    ("POST", "/api/auth/unsubscribe"): "Dejar de recibir avisos (enlace del correo)",
    ("POST", "/api/auth/change-password"): "Cambiar mi contraseña",
    ("GET", "/api/admin/stats"): "Conteos básicos de la base",
    ("GET", "/api/admin/dashboard"): "Dashboard: tráfico, uso, IA y costos, negocios",
    ("GET", "/api/admin/overview"): "Tareas pendientes y salud de los datos",
    ("GET", "/api/admin/reviews"): "Reseñas para moderar",
    ("POST", "/api/admin/reviews/{review_id}/approve"): "Publicar una reseña",
    ("POST", "/api/admin/reviews/{review_id}/reject"): "Rechazar una reseña",
    ("GET", "/api/admin/claims"): "Solicitudes de negocios",
    ("POST", "/api/admin/claims/{claim_id}/approve"): "Aprobar una solicitud (asigna o crea el negocio)",
    ("POST", "/api/admin/claims/{claim_id}/reject"): "Rechazar una solicitud",
    ("GET", "/api/admin/establishments"): "Buscar negocios",
    ("PATCH", "/api/admin/establishments/{establishment_id}"): "Ocultar, mostrar o marcar duplicado",
    ("DELETE", "/api/admin/establishments/{establishment_id}/owner"): "Quitar el dueño de un negocio",
    ("GET", "/api/admin/duplicates"): "Posibles duplicados",
    ("POST", "/api/admin/duplicates/dismiss"): "Descartar un par de duplicados",
    ("GET", "/api/admin/users"): "Usuarios",
    ("PATCH", "/api/admin/users/{user_id}"): "Cambiar rol o activar/desactivar un usuario",
    ("GET", "/api/admin/categories"): "Categorías con su número de negocios",
    ("GET", "/api/admin/search-stats"): "Estadísticas de búsqueda",
    ("GET", "/api/categories"): "Categorías",
    ("GET", "/api/places"): "Municipios y barrios",
    ("GET", "/api/establishments"): "Listar negocios",
    ("POST", "/api/establishments"): "Crear un negocio (admin)",
    ("GET", "/api/establishments/{slug}"): "Detalle de un negocio",
    ("PATCH", "/api/establishments/{establishment_id}"): "Editar un negocio",
    ("PUT", "/api/establishments/{establishment_id}/hours"): "Reemplazar el horario semanal",
    ("POST", "/api/establishments/{establishment_id}/special-hours"): "Agregar un horario especial",
    ("DELETE", "/api/establishments/{establishment_id}/special-hours/{special_id}"): "Borrar un horario especial",
    ("POST", "/api/establishments/{establishment_id}/offerings"): "Agregar un producto o servicio",
    ("PATCH", "/api/offerings/{offering_id}"): "Editar un producto o servicio",
    ("DELETE", "/api/offerings/{offering_id}"): "Borrar un producto o servicio",
    ("GET", "/api/semantic-preview"): "Vista previa de la búsqueda semántica",
    ("POST", "/api/search"): "Buscar en lenguaje natural",
    ("POST", "/api/recommendations"): "Recomendaciones con IA de una búsqueda",
    ("GET", "/api/me/favorites"): "Mis favoritos",
    ("GET", "/api/me/favorites/ids"): "IDs de mis favoritos",
    ("PUT", "/api/me/favorites/{establishment_id}"): "Guardar en favoritos",
    ("DELETE", "/api/me/favorites/{establishment_id}"): "Quitar de favoritos",
    ("GET", "/api/me/history"): "Mi historial de búsquedas",
    ("DELETE", "/api/me/history"): "Borrar todo mi historial",
    ("DELETE", "/api/me/history/{history_id}"): "Borrar una búsqueda del historial",
    ("GET", "/api/establishments/{establishment_id}/reviews"): "Reseñas de un negocio",
    ("POST", "/api/establishments/{establishment_id}/reviews"): "Escribir una reseña",
    ("GET", "/api/establishments/{establishment_id}/reviews/mine"): "Mi reseña de un negocio",
    ("PATCH", "/api/reviews/{review_id}"): "Editar mi reseña",
    ("DELETE", "/api/reviews/{review_id}"): "Borrar mi reseña",
    ("PUT", "/api/reviews/{review_id}/reply"): "Responder una reseña (dueño)",
    ("DELETE", "/api/reviews/{review_id}/reply"): "Borrar la respuesta (dueño)",
    ("POST", "/api/reviews/{review_id}/report"): "Reportar una reseña",
    ("POST", "/api/establishments/{establishment_id}/claims"): "Pedir administrar un negocio",
    ("POST", "/api/business-registrations"): "Registrar un negocio nuevo",
    ("GET", "/api/me/claims"): "Mis solicitudes",
    ("GET", "/api/owner/establishments"): "Mis negocios (dueño)",
    ("GET", "/api/owner/establishments/{establishment_id}"): "Negocio para editar (dueño)",
    ("GET", "/api/owner/establishments/{establishment_id}/reviews"): "Reseñas de mi negocio (dueño)",
    ("POST", "/api/establishments/{establishment_id}/photos"): "Subir una foto",
    ("DELETE", "/api/establishments/{establishment_id}/photos/{photo_id}"): "Borrar una foto",
    ("POST", "/api/establishments/{establishment_id}/traffic"): "Aviso de trancón hasta el negocio",
    ("POST", "/api/analytics/pageview"): "Registrar una visita (anónima)",
}


def install(app: FastAPI) -> None:
    """Reemplaza la generación de la especificación por una con títulos y secciones en español."""

    def openapi() -> dict:
        if app.openapi_schema:
            return app.openapi_schema
        schema = get_openapi(title="Easy Search · API (FastAPI)", version=app.version, description=DESCRIPCION,
                             routes=app.routes)
        for path, ops in schema.get("paths", {}).items():
            for method, op in ops.items():
                titulo = TITULOS.get((method.upper(), path))
                if titulo:
                    op["summary"] = titulo
                op["tags"] = [SECCIONES.get(t, (t, ""))[0] for t in op.get("tags", [])]
        schema["tags"] = [{"name": nombre, "description": desc} for nombre, desc in SECCIONES.values()]
        app.openapi_schema = schema
        return schema

    app.openapi = openapi
