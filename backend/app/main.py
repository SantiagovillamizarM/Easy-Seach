"""Punto de entrada de la API de Easy Search."""
import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import admin, auth, catalog, health, me, reviews, search
from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger("easysearch")


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


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Todas las rutas de la API viven bajo /api
app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(catalog.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(me.router, prefix="/api")
app.include_router(reviews.router, prefix="/api")
