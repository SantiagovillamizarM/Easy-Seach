"""Configuración de la aplicación leída desde variables de entorno (.env).

Nunca se escriben credenciales en el código: todo valor sensible viene del archivo .env.
"""
from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Carpeta raíz del repositorio (donde está el archivo .env)
ROOT_DIR = Path(__file__).resolve().parents[3]

# Valores de ejemplo que nunca deben usarse en producción
_PLACEHOLDER_SECRETS = {"cambia_esta_clave_secreta", "changeme", "secret", "secret_key"}


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

    # --- IA generativa (Gemini) ---
    # Sin clave, la búsqueda sigue funcionando con el intérprete por reglas.
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash-lite"
    gemini_fallback_model: str = "gemini-2.5-flash"
    llm_timeout_seconds: float = 12.0

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @model_validator(mode="after")
    def safe_for_production(self):
        """En producción la app se niega a arrancar con una configuración insegura."""
        if not self.is_production:
            return self
        problems = []
        if len(self.secret_key) < 32 or self.secret_key in _PLACEHOLDER_SECRETS:
            problems.append("SECRET_KEY debe ser aleatoria y tener al menos 32 caracteres "
                            "(genera una con: python -c \"import secrets; print(secrets.token_urlsafe(48))\")")
        if "*" in self.cors_origins_list:
            problems.append("CORS_ORIGINS no puede ser '*': indica el dominio real (https://...)")
        if any(o.startswith("http://") and "127.0.0.1" not in o and "localhost" not in o
               for o in self.cors_origins_list):
            problems.append("CORS_ORIGINS debe usar https:// en producción")
        if problems:
            raise ValueError("Configuración insegura para producción:\n- " + "\n- ".join(problems))
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def overpass_urls_list(self) -> list[str]:
        return [u.strip() for u in self.overpass_urls.split(",") if u.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
