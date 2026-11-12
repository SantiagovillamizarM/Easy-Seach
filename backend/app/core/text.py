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
