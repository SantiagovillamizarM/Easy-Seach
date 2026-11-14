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

    # --- Correo (códigos de confirmación). Gmail gratis con "contraseña de aplicación" ---
    # Sin SMTP en desarrollo, el código se muestra en la terminal del backend en lugar de enviarse.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from_name: str = "Easy Search"
    smtp_timeout_seconds: float = 15.0

    # --- Anti-robots: Cloudflare Turnstile (gratis). Sin clave secreta en desarrollo, no se exige ---
    turnstile_site_key: str | None = None      # pública: la usa el navegador para mostrar el widget
    turnstile_secret_key: str | None = None    # privada: solo el servidor la usa para verificar

    # --- Búsquedas de prueba sin cuenta (por IP, cada 24 horas) y tope diario entre todos los invitados ---
    # El tope protege la cuota de la IA aunque alguien cambie de IP muchas veces.
    guest_searches_per_day: int = 3
    guest_searches_daily_total: int = 300

    # --- Tráfico en vivo: TomTom (gratis ~2.500 consultas/día). Sin clave, no se muestran avisos de trancón ---
    tomtom_api_key: str | None = None
    tomtom_daily_limit: int = 2300             # margen por debajo de la capa gratuita

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_user and self.smtp_password)

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
        if not self.smtp_configured:
            problems.append("Configura SMTP_HOST, SMTP_USER y SMTP_PASSWORD: sin correo nadie puede confirmar su cuenta")
        if not (self.turnstile_site_key and self.turnstile_secret_key):
            problems.append("Configura TURNSTILE_SITE_KEY y TURNSTILE_SECRET_KEY (protección contra robots)")
        elif self.turnstile_secret_key.startswith(("1x000", "2x000", "3x000")):
            problems.append("TURNSTILE_SECRET_KEY es una clave de PRUEBA de Cloudflare: usa la clave real")
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
