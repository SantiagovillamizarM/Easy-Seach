"""Punto de entrada de la API de Easy Search."""
import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import admin, auth, catalog, health, me, owner, reviews, search, traffic
from app.core.config import get_settings
from app.services.photos import PUBLIC_PREFIX, upload_root

settings = get_settings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("easysearch")

# La foto más grande permitida es de 5 MB; nada legítimo necesita enviar más que esto
MAX_BODY_BYTES = 6 * 1024 * 1024
DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")


def _warm_up_embeddings() -> None:
    """Carga el modelo de embeddings en segundo plano para que la primera búsqueda no tarde."""
    try:
        from app.services.embeddings import get_embedder
        get_embedder().encode_query("calentamiento")
        logger.info("Modelo de embeddings listo")
    except Exception as exc:  # el servidor funciona igual; el modelo se cargará en la primera búsqueda
        logger.warning("No se pudo precargar el modelo de embeddings: %s", exc)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.app_env != "test":
        threading.Thread(target=_warm_up_embeddings, daemon=True).start()
    yield


# En producción no se publica la documentación interactiva (/docs): no hace falta mostrar el mapa de la API
_docs = {} if not settings.is_production else {"docs_url": None, "redoc_url": None, "openapi_url": None}
app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan, **_docs)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    # 1) Rechazar peticiones demasiado grandes antes de leerlas
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > MAX_BODY_BYTES:
        return JSONResponse({"detail": "La solicitud es demasiado grande."}, status_code=413)

    response = await call_next(request)

    # 2) Cabeceras de seguridad
    h = response.headers
    h.setdefault("X-Content-Type-Options", "nosniff")       # el navegador no "adivina" el tipo de archivo
    h.setdefault("X-Frame-Options", "DENY")                  # nadie puede incrustar la API en un iframe
    h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    h.setdefault("Permissions-Policy", "geolocation=(self), camera=(), microphone=()")
    h.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    if not request.url.path.startswith(DOCS_PATHS):
        # La API solo devuelve JSON e imágenes: no necesita ejecutar nada
        h.setdefault("Content-Security-Policy", "default-src 'none'; img-src 'self'; frame-ancestors 'none'")
    if settings.is_production:
        h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception):
    """Errores no previstos: se registran completos en el log, pero al usuario no se le muestran detalles
    internos (rutas, consultas SQL, versiones) que podrían ayudar a un atacante."""
    logger.exception("Error no controlado en %s %s", request.method, request.url.path)
    return JSONResponse({"detail": "Tuvimos un problema en el servidor. Intenta de nuevo en un momento."},
                        status_code=500)


# CORS se agrega al final para que envuelva todo (también las respuestas 413 y 500)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=False,  # la sesión viaja en la cabecera Authorization, no en cookies
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
    expose_headers=["X-Error-Code", "Retry-After"],   # el frontend distingue p. ej. "guest_limit"
)

# Todas las rutas de la API viven bajo /api
app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(catalog.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(me.router, prefix="/api")
app.include_router(reviews.router, prefix="/api")
app.include_router(owner.router, prefix="/api")
app.include_router(traffic.router, prefix="/api")

# Fotos subidas por propietarios (archivos ya validados y re-codificados como WebP)
app.mount(PUBLIC_PREFIX, StaticFiles(directory=upload_root()), name="uploads")
