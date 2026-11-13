"""Fase 3: interpretación de consultas y búsqueda híbrida (filtros, ubicación, horario, historial)."""
import pytest
from sqlalchemy import select

from app.models import Category, Establishment, Place, SearchHistory
from app.services.catalog import apply_opening_hours_text
from app.services.embeddings import sync_establishments
from app.services.llm import LLMError
from app.services.query_parser import extract_budget, parse_query, parse_with_rules
from tests.conftest import _make_user, _token


@pytest.fixture(autouse=True)
def _logged_in(request):
    """La búsqueda exige sesión con correo confirmado: toda prueba que use el cliente inicia sesión."""
    if "client" in request.fixturenames:
        request.getfixturevalue("searcher")


# ------------------------------- Intérprete por reglas -----------------------------------


@pytest.mark.parametrize("text,expected_max", [
    ("tengo maximo 25.000 pesos", 25000),
    ("hasta 25 mil", 25000),
    ("menos de $30000", 30000),
    ("presupuesto de 20k", 20000),
    ("una hamburguesa de 18 mil", 18000),
    ("necesito 3 llantas", None),        # "3" no es dinero
    ("para 2 personas", None),
])
def test_budget_extraction(text, expected_max):
    assert extract_budget(text)[1] == expected_max


def test_rules_near_me_vs_near_a_place():
    assert parse_with_rules("algo rico cerca de mi").near_me is True
    assert parse_with_rules("pizza cerca").near_me is True
    assert parse_with_rules("bar cerca de Cabecera").near_me is False


def test_rules_understand_new_business_types():
    """Fase 9: gimnasios, motos, hoteles, bancos, educación, comidas… (y "giro" no confunde a Girón)."""
    cases = {"un gym en floridablanca": "gimnasios", "donde comprar una moto": "motos",
             "hotel barato en bucaramanga": "hoteles", "cajero automatico": "bancos",
             "almuerzo ejecutivo cerca": "restaurantes", "cerrajero urgente": "oficios",
             "clases de ingles": "educacion", "un abogado laboral": "servicios-profesionales",
             "cine en cabecera": "entretenimiento"}
    for query, slug in cases.items():
        assert slug in parse_with_rules(query).category_slugs, query
    assert "bancos" not in parse_with_rules("pizza en girón").category_slugs
    assert "bancos" in parse_with_rules("hacer un giro a bogota").category_slugs


def test_rules_keywords_match_only_at_word_start():
    """Errores encontrados con el benchmark de búsqueda (Fase 8)."""
    vet = parse_with_rules("veterinaria para mi perro en floridablanca").category_slugs
    assert vet == ["mascotas"]                                  # antes: comida-rapida (perro) y llantas ("rin")
    assert "restaurantes" not in parse_with_rules("centro comercial en girón").category_slugs  # "comer"cial
    assert "belleza" not in parse_with_rules("unas hamburguesas baratas").category_slugs       # "unas" artículo
    # Las raíces siguen funcionando al inicio de palabra
    assert parse_with_rules("rines para mi carro").category_slugs == ["llantas"]
    assert parse_with_rules("quiero comer perros calientes").category_slugs[:2] == ["comida-rapida", "restaurantes"]
    assert parse_with_rules("arreglarme las uñas").category_slugs == ["belleza"]


def test_rules_open_cheap_rating_and_categories():
    intent = parse_with_rules("restaurante barato abierto ahora bien calificado")
    assert intent.open_now and intent.price_preference == "low" and intent.min_rating == 4.0
    assert "restaurantes" in intent.category_slugs
    assert "llantas" in parse_with_rules("necesito un montallantas").category_slugs


# ------------------------------- IA: verificación y respaldo -----------------------------


class FakeLLM:
    name = "fake"

    def __init__(self, response=None, fail=False):
        self.response, self.fail, self.calls = response, fail, 0

    def generate_json(self, prompt, schema, system=None):
        self.calls += 1
        if self.fail:
            raise LLMError("caída simulada")
        return self.response


def _llm_answer(**overrides):
    base = {"need": "hamburguesas", "keywords": ["hamburguesa"], "category_slugs": ["comida-rapida"],
            "location_text": None, "near_me": False, "budget_min": None, "budget_max": None,
            "price_preference": None, "open_now": False, "min_rating": None, "preferences": []}
    return {**base, **overrides}


def test_llm_failure_falls_back_to_rules():
    intent = parse_query("hamburguesa barata prueba-falla", FakeLLM(fail=True))
    assert intent.parser == "reglas"
    assert intent.price_preference == "low"


def test_llm_invented_budget_and_place_are_discarded():
    llm = FakeLLM(_llm_answer(budget_max=50000, location_text="Medellín", category_slugs=["inventada"]))
    intent = parse_query("hamburguesas ricas prueba-invento", llm)
    assert intent.parser == "gemini"
    assert intent.budget_max is None          # el usuario no escribió ninguna cifra
    assert intent.location_text is None       # ni mencionó Medellín
    assert intent.category_slugs == []        # categoría fuera de la lista permitida


def test_llm_results_are_cached():
    llm = FakeLLM(_llm_answer())
    parse_query("consulta repetida para cache", llm)
    parse_query("Consulta   repetida para caché", llm)
    assert llm.calls == 1


# ------------------------------- Búsqueda (API) ------------------------------------------

@pytest.fixture()
def world(db, fake_embedder):
    pie = Place(name="Piedecuesta", normalized_name="piedecuesta", kind="municipio", latitude=6.9879,
                longitude=-73.0503)
    bga = Place(name="Bucaramanga", normalized_name="bucaramanga", kind="municipio", latitude=7.1193,
                longitude=-73.1227)
    burgers = Category(name="Comida rápida", slug="comida-rapida", description="Hamburguesas")
    tyres = Category(name="Llantas y montallantas", slug="llantas", description="Llantas")
    db.add_all([pie, bga, burgers, tyres])
    db.flush()

    def est(name, place, lat, lng, cat, **kw):
        e = Establishment(name=name, slug=name.lower().replace(" ", "-"), municipality_id=place.id,
                          latitude=lat, longitude=lng, description=kw.pop("description", None), **kw)
        e.categories = [cat]
        db.add(e)
        return e

    items = {
        "pie_burger": est("Burger Piedecuesta", pie, 6.9885, -73.0500, burgers,
                          description="Hamburguesas artesanales", price_min=12000, price_max=22000),
        "pie_burger_caro": est("Burger Gourmet Piedecuesta", pie, 6.9890, -73.0510, burgers,
                               description="Hamburguesas gourmet", price_min=45000, price_max=80000),
        "bga_burger": est("Burger Bucaramanga", bga, 7.1190, -73.1220, burgers, description="Hamburguesas"),
        "bga_tyres": est("Montallantas La 33", bga, 7.1100, -73.1200, tyres,
                         description="Reparación de llantas de busetas"),
    }
    db.flush()
    apply_opening_hours_text(items["bga_burger"], "24/7")
    db.flush()
    for e in items.values():
        db.refresh(e)
    sync_establishments(db, list(items.values()), fake_embedder)
    db.flush()
    return items


def _names(response):
    return [r["name"] for r in response.json()["results"]]


def test_nothing_mentions_the_product_gives_honest_notice(client, world):
    """Buscar "pizza" donde ningún lugar la menciona: solo resultados relacionados y un aviso (Fase 9)."""
    body = client.post("/api/search", json={"q": "pizza en Piedecuesta"}).json()
    assert body["results"], "se muestran opciones de comida rápida relacionadas"
    assert all(r["relevance"] == "relacionada" for r in body["results"])
    assert any("Ningún lugar en Piedecuesta menciona «pizza»" in n for n in body["notices"])
    assert all(r["matched_text"] is None for r in body["results"])   # sin "Coincide: …" engañoso
    # Cuando sí se menciona, la relevancia es alta y no hay aviso
    body = client.post("/api/search", json={"q": "hamburguesas en Piedecuesta"}).json()
    assert body["results"][0]["relevance"] == "alta"
    assert not any("Ningún lugar" in n for n in body["notices"])


def test_matched_snippet_requires_the_searched_word():
    from app.services.search import _matched_snippet
    content = "Producto: Picada clásica (2 personas) (Picadas). Ofrecido por Garrotero's Pub."
    assert _matched_snippet("offering", content, ["pizza"]) is None
    assert _matched_snippet("offering", content, ["picadas"]) == "Producto: Picada clásica (2 personas) (Picadas)"


def test_search_filters_by_written_location(client, world):
    r = client.post("/api/search", json={"q": "quiero una hamburguesa en Piedecuesta"})
    assert r.status_code == 200
    body = r.json()
    assert body["location"]["label"] == "Piedecuesta" and body["location"]["source"] == "texto"
    assert set(_names(r)) <= {"Burger Piedecuesta", "Burger Gourmet Piedecuesta"}
    assert "Burger Piedecuesta" in _names(r)


def test_search_budget_excludes_known_expensive(client, world):
    r = client.post("/api/search", json={"q": "hamburguesa en Piedecuesta por maximo 25 mil"})
    body = r.json()
    assert body["interpretation"]["budget_max"] == 25000
    assert "Burger Gourmet Piedecuesta" not in _names(r)   # su precio mínimo es 45.000
    assert body["results"][0]["budget_fit"] == "dentro"


def test_near_me_without_gps_asks_for_location(client, world):
    r = client.post("/api/search", json={"q": "hamburguesas cerca"})
    body = r.json()
    assert body["needs_location"] is True
    assert any("ubicación" in n for n in body["notices"])


def test_near_me_with_gps_uses_radius(client, world):
    gps = {"latitude": 6.9879, "longitude": -73.0503}   # Piedecuesta
    r = client.post("/api/search", json={"q": "hamburguesas cerca", **gps})
    body = r.json()
    assert body["location"]["source"] == "gps"
    assert "Burger Bucaramanga" not in _names(r)         # a ~16 km, fuera del radio
    assert all(x["distance_km"] is not None and x["distance_km"] < 8 for x in body["results"])


def test_open_now_hides_unknown_hours(client, world):
    r = client.post("/api/search", json={"q": "hamburguesas", "open_now": True})
    assert _names(r) == ["Burger Bucaramanga"]           # el único con horario (24/7)
    assert any("sin horario" in n for n in r.json()["notices"])


def test_unknown_place_gives_notice(client, world):
    r = client.post("/api/search", json={"q": "hamburguesas en Medellín"})
    # Medellín no está en la tabla de lugares: no se inventa ubicación
    assert r.json()["location"] is None


def test_history_saved_without_coordinates(client, db, world):
    _make_user(db, "buscador@test.com", "user")
    headers = {"Authorization": f"Bearer {_token(client, 'buscador@test.com')}"}
    client.post("/api/search", json={"q": "hamburguesas cerca", "latitude": 6.98, "longitude": -73.05},
                headers=headers)
    row = db.scalar(select(SearchHistory).order_by(SearchHistory.id.desc()))
    assert row.user_id is not None
    assert row.query_text == "hamburguesas cerca"
    assert "6.98" not in str(row.parsed_query) and "-73.05" not in str(row.parsed_query)


def test_search_validation(client):
    assert client.post("/api/search", json={"q": "a"}).status_code == 422
    assert client.post("/api/search", json={"q": "pizza", "latitude": 7.1}).status_code == 422
    assert client.post("/api/search", json={"q": "pizza", "budget_min": 50000, "budget_max": 10}).status_code == 422


def test_semantic_preview_is_admin_only(client, admin_headers):
    # El cliente tiene la sesión de un usuario normal (fixture automática): no es admin → 403
    assert client.get("/api/semantic-preview", params={"q": "pizza"}).status_code == 403
    assert client.get("/api/semantic-preview", params={"q": "pizza"}, headers=admin_headers).status_code == 200


def test_specific_keywords_and_business_types():
    """Fase 9: "pizza" es un producto concreto; "bar" o "montallantas" son tipos de negocio; "grandes" no cuenta."""
    from app.services.search import _is_business_type, _specific_keywords
    assert _is_business_type("bar") and _is_business_type("montallantas") and _is_business_type("droguería")
    assert not _is_business_type("pizza") and not _is_business_type("frenos")
    assert _specific_keywords(["pizzerias", "pizzas", "grandes"]) == ["pizzerias", "pizzas"]
    assert _specific_keywords(["bar", "tomar", "cerveza"]) == ["cerveza"]


def test_relevance_rules():
    from app.services.search import _mentions, _relevance
    assert _mentions("Lis Burger", ["hamburguesas"])               # sinónimo en inglés
    assert _mentions("Unifrenos", ["frenos"]) and not _mentions("Picada clásica", ["pizza"])
    # Producto sin tipo de negocio ("pizza"): solo lo que lo menciona es "alta"
    assert _relevance(False, True, False, True, False, False) == "relacionada"
    assert _relevance(False, True, True, True, False, False) == "alta"
    # Con tipo de negocio ("bar para tomar cerveza"): manda la categoría
    assert _relevance(False, True, False, True, True, False) == "alta"
    # Nadie lo menciona: todo es aproximado
    assert _relevance(True, True, False, True, False, True) == "relacionada"
