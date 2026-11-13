"""Interpretación de la consulta en lenguaje natural.

1. Se intenta con la IA (Gemini) → JSON estructurado.
2. Si la IA no está configurada o falla, se usa un intérprete por reglas (siempre disponible).
3. Lo que diga la IA se VERIFICA contra el texto: no se acepta un presupuesto o lugar que el usuario no escribió.

Privacidad: a la IA solo se envía el texto de la búsqueda (nunca coordenadas ni datos del usuario).
"""
import logging
import re
from collections import OrderedDict
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.core.text import normalize
from app.data.categories import CATEGORIES
from app.services.llm import LLMError, LLMProvider

logger = logging.getLogger(__name__)

CATEGORY_SLUGS = list(CATEGORIES)


class QueryIntent(BaseModel):
    need: str = Field(description="Qué busca, en pocas palabras (texto para la búsqueda semántica)")
    keywords: list[str] = Field(default_factory=list)
    category_slugs: list[str] = Field(default_factory=list)
    location_text: str | None = None
    near_me: bool = False
    budget_min: int | None = None
    budget_max: int | None = None
    price_preference: Literal["low", "medium", "high"] | None = None
    open_now: bool = False
    min_rating: float | None = None
    preferences: list[str] = Field(default_factory=list)
    parser: Literal["gemini", "reglas"] = "reglas"


# ======================================================================================
# Intérprete por reglas
# ======================================================================================

_STOPWORDS = set("""
a al algo alguien alguna alguno algun ante bajo busco buscando con contra cual cuales de del desde donde
el ella ellos en entre era es esa ese eso esta este esto estoy hay la las le lo los me mi mis muy necesito
necesitamos ni no nos o para pero por que quiero queremos se sea ser si sin sobre su sus tambien te tengo
tiene un una uno unos unas y ya yo sitio lugar lugares favor pesos mil maximo minimo hasta menos mas cerca
cercano cercana aqui ahora mismo abierto abiertos abierta barato barata economico economica caro cara tan
rico rica bueno buena buen mejor mejores quisiera gustaria podria puede puedo comprar empresa mi
bien calificado calificada calificados recomendado recomendada quede queda quedan arregle arreglen haga
hagan venda vendan ofrezca ofrezcan atienda atiendan tenga tengan sean favor dame
""".split())

# palabra (sin tildes, raíz) -> categoría
_CATEGORY_WORDS = {
    # "perro" solo no: puede ser la mascota ("veterinaria para mi perro")
    "hamburgues": "comida-rapida", "burger": "comida-rapida", "pizza": "comida-rapida",
    "perro caliente": "comida-rapida", "perros caliente": "comida-rapida", "hot dog": "comida-rapida",
    "comida rapida": "comida-rapida", "salchipapa": "comida-rapida", "pollo": "restaurantes",
    "restaurante": "restaurantes", "almorzar": "restaurantes", "almuerzo": "restaurantes", "cenar": "restaurantes",
    "comer ": "restaurantes", "comida": "restaurantes", "corrientazo": "restaurantes",  # "comer " ≠ "comercial"
    "cafe": "cafeterias", "desayun": "cafeterias", "tinto": "cafeterias",
    "llanta": "llantas", "montallanta": "llantas", "despinch": "llantas", "rin": "llantas",
    "mecanic": "talleres-mecanicos", "taller": "talleres-mecanicos",
    "repuesto": "repuestos-vehiculos", "drogueria": "farmacias", "farmacia": "farmacias", "medicament": "farmacias",
    "ferreteria": "ferreterias", "herramienta": "ferreterias", "peluquer": "belleza", "barber": "belleza",
    # "unas" (uñas) solo no: también es el artículo ("unas hamburguesas")
    "las unas": "belleza", "manicur": "belleza", "pedicur": "belleza",
    "veterinari": "mascotas", "mascota": "mascotas", "perro y gato": "mascotas", "mi perro": "mascotas",
    "mi gato": "mascotas", "concentrado para": "mascotas",
    "gasolina": "estaciones-servicio", "tanquear": "estaciones-servicio", "lavadero": "lavaderos",
    "cerveza": "bares", "trago": "bares", "rumba": "bares", "bar ": "bares", "helado": "heladerias",
    "panaderia": "panaderias", "pan ": "panaderias", "torta": "panaderias", "celular": "tecnologia",
    "computador": "tecnologia", "ropa": "ropa-calzado", "zapato": "ropa-calzado", "tenis": "ropa-calzado",
    "supermercado": "mercados-tiendas", "mercado": "mercados-tiendas", "tienda": "mercados-tiendas",
    "papeleria": "papelerias", "libro": "papelerias", "bicicleta": "deportes", "mueble": "hogar",
    "medico": "salud", "odontolog": "salud", "dentista": "salud", "optica": "salud",
}

# Cada palabra clave debe coincidir al INICIO de una palabra (es una raíz: "llanta" → "llantas"),
# nunca en medio de otra: "rin" no debe activarse con "veterinaria".
_CATEGORY_PATTERNS = [(re.compile(r"(?<![a-z0-9])" + re.escape(word)), slug)
                      for word, slug in _CATEGORY_WORDS.items()]

_NUMBER = r"(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(mil|k|lucas|barras|millon(?:es)?)?"
_MAX_WORDS = r"(?:maximo|max|hasta|menos de|no mas de|tengo|presupuesto(?: de)?|por debajo de|alcanza(?: para)?|cuenta con)"
_MIN_WORDS = r"(?:minimo|desde|mas de|por encima de)"

_NEAR = re.compile(r"\b(cerca|cercano|cercana|cerquita|por aqui|aca cerca|a la vuelta|alrededor|mi ubicacion|"
                   r"donde estoy|por mi casa|cerca de mi)\b")
_NEAR_PLACE = re.compile(r"\bcerca (?:a|de|del) (?!mi\b|aqui\b)")
_OPEN = re.compile(r"\b(abierto|abiertos|abierta|abiertas|ahora mismo|ya mismo|en este momento|a esta hora)\b")
_CHEAP = re.compile(r"\b(barato|barata|baratos|economico|economica|economicos|no (?:sea |sean )?(?:tan |muy )?caros?|"
                    r"precio bajo|accesible|bueno bonito y barato)\b")
_EXPENSIVE = re.compile(r"\b(elegante|lujo|lujoso|exclusivo|gourmet|fino)\b")
_RATING = re.compile(r"\b(bien calificad[oa]s?|buenas resenas|mejor calificad[oa]s?|recomendad[oa]s?)\b")


def _to_pesos(number: str, unit: str | None) -> int | None:
    digits = number.replace(".", "").replace(",", "") if re.search(r"[.,]\d{3}\b", number) else number.replace(",", ".")
    try:
        value = float(digits)
    except ValueError:
        return None
    if unit in {"mil", "k", "lucas", "barras"}:
        value *= 1000
    elif unit and unit.startswith("millon"):
        value *= 1_000_000
    value = int(value)
    return value if 1000 <= value <= 100_000_000 else None  # descarta "2 personas", "3 llantas"


def extract_budget(norm: str) -> tuple[int | None, int | None]:
    budget_max = budget_min = None
    m = re.search(rf"{_MAX_WORDS}\s*(?:de\s*)?\$?\s*{_NUMBER}", norm)
    if m:
        budget_max = _to_pesos(m.group(1), m.group(2))
    m = re.search(rf"{_MIN_WORDS}\s*\$?\s*{_NUMBER}", norm)
    if m:
        budget_min = _to_pesos(m.group(1), m.group(2))
    if budget_max is None and budget_min is None:
        # "una hamburguesa de 20 mil", "$25.000"
        m = re.search(rf"\$\s*{_NUMBER}|{_NUMBER}\s*(?=pesos)|\b(\d+)\s*(mil|lucas)\b", norm)
        if m:
            groups = [g for g in m.groups() if g is not None]
            budget_max = _to_pesos(groups[0], groups[1] if len(groups) > 1 else None)
    return budget_min, budget_max


def parse_with_rules(query: str, place_text: str | None = None) -> QueryIntent:
    norm = normalize(query)
    budget_min, budget_max = extract_budget(norm)

    categories = []
    padded = f" {norm} "
    for pattern, slug in _CATEGORY_PATTERNS:
        if slug not in categories and pattern.search(padded):
            categories.append(slug)

    # Texto de la necesidad: quitar el lugar y las cifras de dinero
    need = norm
    if place_text:
        need = re.sub(rf"\b(?:en|por|cerca (?:a|de|del)|barrio)?\s*{re.escape(normalize(place_text))}\b", " ", need)
    need = re.sub(rf"{_MAX_WORDS}?\s*\$?\s*{_NUMBER}\s*(?:pesos)?", " ", need)
    keywords = [w for w in re.findall(r"[a-zñ]+", need) if w not in _STOPWORDS and len(w) > 2]

    return QueryIntent(
        need=" ".join(need.split()) or norm,
        keywords=keywords[:8],
        category_slugs=categories[:3],
        location_text=place_text,
        near_me=bool(_NEAR.search(norm)) and not _NEAR_PLACE.search(norm),
        budget_min=budget_min,
        budget_max=budget_max,
        price_preference="low" if _CHEAP.search(norm) else ("high" if _EXPENSIVE.search(norm) else None),
        open_now=bool(_OPEN.search(norm)),
        min_rating=4.0 if _RATING.search(norm) else None,
        preferences=[],
        parser="reglas",
    )


# ======================================================================================
# Intérprete con IA
# ======================================================================================

SYSTEM_PROMPT = """Eres el intérprete de búsquedas de Easy Search, un buscador de establecimientos, productos y
servicios en el área metropolitana de Bucaramanga (Colombia). Convierte la consulta del usuario en JSON.

Reglas estrictas:
- need: frase corta en español que describa QUÉ busca (tipo de negocio, producto o servicio y para qué),
  sin el lugar ni el presupuesto. Ej: "restaurante de hamburguesas con porciones grandes".
- keywords: 2 a 6 palabras clave en español útiles para buscar por texto, incluyendo sinónimos comunes
  (ej. "hamburguesa", "burger"). Sin lugares ni cifras.
- category_slugs: 0 a 3 categorías de la lista permitida que mejor correspondan.
- location_text: el nombre EXACTO del lugar (municipio, barrio, sector) tal como lo escribió el usuario.
  null si no menciona ninguno. NUNCA inventes un lugar.
- near_me: true solo si pide algo cerca de él mismo ("cerca", "cerca de mí", "por aquí").
  Si dice "cerca de <un lugar>", near_me es false y location_text es ese lugar.
- budget_min / budget_max: en pesos colombianos (entero). "25 mil" = 25000, "una luca" = 1000.
  null si no menciona dinero. NUNCA inventes cifras.
- price_preference: "low" si pide algo barato/económico/"no tan caro"; "high" si pide algo elegante/de lujo;
  null en otro caso.
- open_now: true solo si pide que esté abierto ahora.
- min_rating: 4.0 si pide algo bien calificado o recomendado; null en otro caso.
- preferences: características deseadas que mencione (ej. "porciones grandes", "para niños", "domicilio").
  Lista vacía si no menciona ninguna."""


def _schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "need": {"type": "string"},
            "keywords": {"type": "array", "items": {"type": "string"}},
            "category_slugs": {"type": "array", "items": {"type": "string", "enum": CATEGORY_SLUGS}},
            "location_text": {"type": "string", "nullable": True},
            "near_me": {"type": "boolean"},
            "budget_min": {"type": "integer", "nullable": True},
            "budget_max": {"type": "integer", "nullable": True},
            "price_preference": {"type": "string", "enum": ["low", "medium", "high"], "nullable": True},
            "open_now": {"type": "boolean"},
            "min_rating": {"type": "number", "nullable": True},
            "preferences": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["need", "keywords", "category_slugs", "location_text", "near_me", "budget_min",
                     "budget_max", "price_preference", "open_now", "min_rating", "preferences"],
    }


def _verify_against_text(intent: QueryIntent, query: str, rules: QueryIntent) -> QueryIntent:
    """Descarta lo que la IA haya agregado sin respaldo en el texto del usuario."""
    norm = normalize(query)
    if intent.budget_max is not None or intent.budget_min is not None:
        if not re.search(r"\d|\b(mil|luca|lucas|millon)", norm):
            intent.budget_min = intent.budget_max = None  # no había ninguna cifra en la consulta
    if intent.location_text:
        loc = normalize(intent.location_text)
        if not any(w in norm for w in loc.split() if len(w) >= 3):
            intent.location_text = rules.location_text  # la IA mencionó un lugar que no está en el texto
    intent.category_slugs = [c for c in intent.category_slugs if c in CATEGORIES][:3]
    intent.keywords = [k.strip() for k in intent.keywords if k.strip()][:8]
    for field in ("budget_min", "budget_max"):
        value = getattr(intent, field)
        if value is not None and not (0 < value <= 100_000_000):
            setattr(intent, field, None)
    if intent.min_rating is not None:
        intent.min_rating = min(max(intent.min_rating, 1.0), 5.0)
    return intent


class _LRU(OrderedDict):
    """Caché pequeña en memoria: la misma consulta no gasta cuota de la IA dos veces."""

    def __init__(self, size: int = 512):
        super().__init__()
        self.size = size

    def get_item(self, key):
        if key in self:
            self.move_to_end(key)
            return self[key]
        return None

    def put(self, key, value):
        self[key] = value
        self.move_to_end(key)
        if len(self) > self.size:
            self.popitem(last=False)


_cache = _LRU()


def parse_query(query: str, llm: LLMProvider | None, place_text: str | None = None) -> QueryIntent:
    """Interpreta la consulta. `place_text` es el lugar detectado por reglas en la base de datos (si hay)."""
    rules = parse_with_rules(query, place_text)
    if llm is None:
        return rules

    key = normalize(query)
    cached = _cache.get_item(key)
    if cached is not None:
        return cached.model_copy(deep=True)

    try:
        raw = llm.generate_json(f"Consulta del usuario: {query}", _schema(), system=SYSTEM_PROMPT)
        intent = QueryIntent(**raw, parser="gemini")
    except (LLMError, ValidationError, TypeError) as exc:
        logger.warning("IA no disponible para interpretar, se usan reglas: %s", exc)
        return rules

    intent = _verify_against_text(intent, query, rules)
    if not intent.need.strip():
        intent.need = rules.need
    if not intent.keywords:
        intent.keywords = rules.keywords
    _cache.put(key, intent)
    return intent.model_copy(deep=True)
