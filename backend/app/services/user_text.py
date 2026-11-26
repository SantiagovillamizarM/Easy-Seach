"""Texto para el usuario: quita términos internos que la IA a veces deja escapar.

Los prompts le pasan a la IA "fichas" de los negocios y le piden no nombrarlas, pero los modelos no siempre
lo cumplen ("Las fichas no traen precios…"). El usuario no sabe qué es una ficha, así que se reemplaza por
una expresión natural que conserva la concordancia del artículo y del verbo:

- plural  → "datos registrados" (masculino): "las fichas no traen" → "los datos registrados no traen"
- singular → "información registrada" (femenino, como "ficha"): "su ficha dice" → "su información registrada dice"
"""
import re

# Determinantes femeninos plurales → su forma masculina (para "datos registrados")
_PLURAL = {"las": "los", "estas": "estos", "esas": "esos", "unas": "unos", "otras": "otros", "todas": "todos",
           "sus": "sus", "nuestras": "nuestros", "algunas": "algunos", "ningunas": "ningunos"}

_CON_DETERMINANTE = re.compile(
    r"\b(" + "|".join(_PLURAL) + r"|la|esta|esa|una|su|otra|nuestra|alguna|ninguna|cada)\s+(fichas?)\b",
    re.IGNORECASE,
)
_SUELTA = re.compile(r"\b(fichas?)\b", re.IGNORECASE)


def _con_mayuscula(original: str, nuevo: str) -> str:
    return nuevo[0].upper() + nuevo[1:] if original[:1].isupper() else nuevo


def _reemplazar_con_determinante(m: re.Match) -> str:
    det, palabra = m.group(1), m.group(2)
    if palabra.lower() == "fichas":
        nuevo = f"{_PLURAL.get(det.lower(), det.lower())} datos registrados"
    else:
        nuevo = f"{det.lower()} información registrada"
    return _con_mayuscula(det, nuevo)


def _reemplazar_suelta(m: re.Match) -> str:
    palabra = m.group(1)
    nuevo = "datos registrados" if palabra.lower() == "fichas" else "información registrada"
    return _con_mayuscula(palabra, nuevo)


def sin_terminos_internos(texto: str) -> str:
    """Reemplaza "ficha(s)" por una expresión que el usuario entiende."""
    if not texto or "ficha" not in texto.lower():
        return texto
    texto = _CON_DETERMINANTE.sub(_reemplazar_con_determinante, texto)
    return _SUELTA.sub(_reemplazar_suelta, texto)
