"""Configuración de la aplicación leída desde variables de entorno (.env).

Nunca se escriben credenciales en el código: todo valor sensible viene del archivo .env.
"""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Carpeta raíz del repositorio (donde está el archivo .env)
ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Easy Search API"
    app_env: str = "development"
    database_url: str
    cors_origins: str = "http://127.0.0.1:5173"

    # --- Autenticación ---
    # Clave para firmar los tokens JWT. Obligatoria, sin valor por defecto.
    secret_key: str
    access_token_expire_minutes: int = 120
    jwt_algorithm: str = "HS256"

    # --- OpenStreetMap (importación de datos) ---
    overpass_urls: str = (
        "https://overpass-api.de/api/interpreter,"
        "https://overpass.private.coffee/api/interpreter,"
        "https://overpass.kumi.systems/api/interpreter"
    )

    # --- Embeddings ---
    embedding_dimensions: int = 384

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def overpass_urls_list(self) -> list[str]:
        return [u.strip() for u in self.overpass_urls.split(",") if u.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
