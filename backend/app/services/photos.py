"""Subida segura de fotos.

- Solo se aceptan imágenes reales (Pillow las abre y verifica, no basta con la extensión).
- Se vuelven a codificar en WebP: se eliminan metadatos EXIF (incluida la ubicación GPS del celular)
  y cualquier contenido extraño escondido en el archivo.
- Se redimensionan a un máximo de 1600 px y se guardan con un nombre aleatorio.
"""
import io
import logging
import uuid
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import ROOT_DIR

logger = logging.getLogger(__name__)

UPLOAD_ROOT = ROOT_DIR / "backend" / "uploads"
PUBLIC_PREFIX = "/uploads"
MAX_BYTES = 5 * 1024 * 1024
MAX_SIDE = 1600
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
Image.MAX_IMAGE_PIXELS = 40_000_000  # evita "bombas de descompresión"


class PhotoError(ValueError):
    pass


def save_establishment_photo(establishment_id: int, data: bytes) -> str:
    """Valida, limpia y guarda la imagen. Devuelve la URL pública (ej. /uploads/establishments/3/abc.webp)."""
    if len(data) > MAX_BYTES:
        raise PhotoError("La imagen supera el tamaño máximo de 5 MB")
    try:
        with Image.open(io.BytesIO(data)) as probe:
            fmt = probe.format
            probe.verify()  # detecta archivos corruptos o falsos
        if fmt not in ALLOWED_FORMATS:
            raise PhotoError("Formato no permitido. Usa JPG, PNG o WebP")
        with Image.open(io.BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img)  # respeta la orientación de la foto del celular
            img = img.convert("RGB")
            img.thumbnail((MAX_SIDE, MAX_SIDE))
            folder = UPLOAD_ROOT / "establishments" / str(establishment_id)
            folder.mkdir(parents=True, exist_ok=True)
            name = f"{uuid.uuid4().hex}.webp"
            img.save(folder / name, "WEBP", quality=82)  # sin EXIF: no se copia ningún metadato
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise PhotoError("El archivo no es una imagen válida") from exc
    return f"{PUBLIC_PREFIX}/establishments/{establishment_id}/{name}"


def delete_photo_file(url: str) -> None:
    """Borra el archivo de una foto subida (solo dentro de la carpeta de uploads)."""
    if not url.startswith(f"{PUBLIC_PREFIX}/"):
        return
    path = (UPLOAD_ROOT / url.removeprefix(f"{PUBLIC_PREFIX}/")).resolve()
    if UPLOAD_ROOT.resolve() in path.parents and path.is_file():
        try:
            path.unlink()
        except OSError as exc:  # p. ej. archivo bloqueado en Windows: la foto ya no está en la base de datos
            logger.warning("No se pudo borrar el archivo %s: %s", path.name, exc)


def upload_root() -> Path:
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    return UPLOAD_ROOT
