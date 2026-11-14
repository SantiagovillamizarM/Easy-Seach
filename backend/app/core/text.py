"""Utilidades de texto: normalización (sin tildes, minúsculas) y slugs para URLs."""
import re
import unicodedata


def strip_accents(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def normalize(text: str) -> str:
    """'  Girón,  Santander ' -> 'giron, santander'"""
    return " ".join(strip_accents(text).lower().split())


def slugify(text: str, max_length: int = 80) -> str:
    """'Hamburguesas El Corral – Cabecera' -> 'hamburguesas-el-corral-cabecera'"""
    slug = re.sub(r"[^a-z0-9]+", "-", normalize(text)).strip("-")
    return slug[:max_length].rstrip("-") or "sin-nombre"


def short_name(full_name: str) -> str:
    """'Laura Patricia Gómez' -> 'Laura G.' (privacidad: en público no se muestra el nombre completo)."""
    parts = full_name.split()
    if not parts:
        return "Usuario"
    return parts[0] if len(parts) == 1 else f"{parts[0]} {parts[-1][0].upper()}."
