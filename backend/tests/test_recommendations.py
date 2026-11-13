"""Fase 5: recomendaciones con IA basadas solo en datos reales (validación anti-invención y respaldo)."""
import pytest

from app.models import Category, Establishment, Offering, Place
from app.services.llm import LLMError
from app.services.query_parser import QueryIntent
from app.services.recommendations import data_gaps, facts_for, recommend, validate_text

INTENT = QueryIntent(need="hamburguesas", budget_max=25000)


@pytest.fixture(autouse=True)
def _logged_in(request):
    """Las recomendaciones exigen sesión con correo confirmado."""
    if "client" in request.fixturenames:
        request.getfixturevalue("searcher")


@pytest.fixture()
def burger(db):
    place = Place(name="Piedecuesta", normalized_name="piedecuesta", kind="municipio", latitude=6.98, longitude=-73.05)
    cat = Category(name="Comida rápida", slug="comida-rapida", description="Hamburguesas")
    db.add_all([place, cat])
    db.flush()
    est = Establishment(name="Burger Real", slug="burger-real", municipality_id=place.id, latitude=6.98,
                        longitude=-73.05, description="Hamburguesas artesanales de porción grande",
                        price_min=15000, price_max=30000)
    est.categories = [cat]
    est.offerings = [Offering(kind="product", name="Hamburguesa doble", price=22000)]
    db.add(est)
    db.flush()
    db.refresh(est)
    return est


class FakeLLM:
    name = "fake"

    def __init__(self, response=None, fail=False):
        self.response, self.fail = response, fail

    def generate_json(self, prompt, schema, system=None):
        if self.fail:
            raise LLMError("caída simulada")
        return self.response


# ------------------------------- Validación -----------------------------------------------

def test_validate_keeps_real_prices_and_removes_invented(burger):
    facts = facts_for(burger)
    text = ("Tiene hamburguesa doble por $22.000, ideal para tu presupuesto de 25 mil. "
            "Además el combo cuesta $18.500. Es un buen lugar.")
    result = validate_text(text, facts, INTENT)
    assert "$22.000" in result and "25 mil" in result      # precios reales / presupuesto del usuario
    assert "18.500" not in result                           # precio inventado -> frase eliminada
    assert "Es un buen lugar." in result


def test_validate_removes_invented_hours_and_ratings(burger):
    facts = facts_for(burger)
    text = "Abre a las 8 am todos los días. Tiene 4.8 estrellas. Ofrece hamburguesas artesanales."
    result = validate_text(text, facts, INTENT)
    assert result == "Ofrece hamburguesas artesanales."


def test_data_gaps(burger):
    assert data_gaps(burger) == ["horario", "reseñas"]   # tiene precios y descripción


# ------------------------------- Generación ----------------------------------------------

def test_recommend_uses_llm_text_when_valid(burger):
    llm = FakeLLM({"summary": "Buena opción para hamburguesas.",
                   "items": [{"id": burger.id, "recommendation": "Te puede gustar por su hamburguesa doble de $22.000."}]})
    result = recommend("hamburguesas baratas valida", INTENT, [burger], llm)
    assert result.source == "gemini"
    assert result.items[0].source == "gemini"
    assert "$22.000" in result.items[0].text


def test_recommend_falls_back_to_template_when_everything_is_invented(burger):
    llm = FakeLLM({"summary": "", "items": [{"id": burger.id, "recommendation": "Cuesta $9.900 y abre a las 6 am."}]})
    result = recommend("hamburguesas inventadas", INTENT, [burger], llm)
    item = result.items[0]
    assert item.source == "reglas"
    assert "9.900" not in item.text
    assert "Burger Real" in item.text


def test_recommend_ignores_unknown_ids_and_llm_failure(burger):
    llm = FakeLLM({"summary": "x", "items": [{"id": 999999, "recommendation": "Otro lugar inventado muy bueno."}]})
    result = recommend("hamburguesas ids", INTENT, [burger], llm)
    assert [i.establishment_id for i in result.items] == [burger.id]
    assert result.items[0].source == "reglas"

    failed = recommend("hamburguesas falla", INTENT, [burger], FakeLLM(fail=True))
    assert failed.source == "reglas" and failed.items[0].text


def test_recommendations_endpoint(client, burger):
    r = client.post("/api/recommendations", json={"q": "hamburguesa barata", "establishment_ids": [burger.id, 999999]})
    assert r.status_code == 200
    body = r.json()
    assert [i["establishment_id"] for i in body["items"]] == [burger.id]   # el id inexistente se ignora
    assert body["source"] == "reglas"                                      # en pruebas no hay IA
    assert client.post("/api/recommendations", json={"q": "x", "establishment_ids": []}).status_code == 422
    too_many = client.post("/api/recommendations", json={"q": "hamburguesa", "establishment_ids": list(range(1, 9))})
    assert too_many.status_code == 422


def test_varied_sample_rotates_between_sections():
    from types import SimpleNamespace
    from app.services.recommendations import _varied_sample
    items = [SimpleNamespace(id=i, section=s) for i, s in enumerate(
        ["Hamburguesas"] * 10 + ["Bebidas"] * 5 + ["Postres"] * 2, start=1)]
    sample = _varied_sample(items, 6)
    assert [o.section for o in sample] == ["Hamburguesas", "Bebidas", "Postres"] * 2
