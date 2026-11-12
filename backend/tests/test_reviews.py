"""Fase 6: reseñas, moderación, calificación y reportes."""
import pytest

from app.main import app
from app.models import Establishment, Place, Report
from app.services.llm import LLMError, get_llm
from app.services.moderation import check_rules
from tests.conftest import _make_user, _token


class FakeLLM:
    name = "fake"

    def __init__(self, decision="approve", reason="", fail=False):
        self.decision, self.reason, self.fail = decision, reason, fail

    def generate_json(self, prompt, schema, system=None):
        if self.fail:
            raise LLMError("caída")
        return {"decision": self.decision, "reason": self.reason}


@pytest.fixture()
def use_llm():
    """Permite elegir qué responde la 'IA' de moderación en cada prueba."""
    def _set(llm):
        app.dependency_overrides[get_llm] = lambda: llm
    yield _set


@pytest.fixture()
def place(db):
    muni = Place(name="Floridablanca", normalized_name="floridablanca", kind="municipio", latitude=7.06,
                 longitude=-73.08)
    db.add(muni)
    db.flush()
    owner = _make_user(db, "duenio.resenas@test.com", "owner")
    est = Establishment(name="Café Prueba", slug="cafe-prueba", municipality_id=muni.id, latitude=7.06,
                        longitude=-73.08, owner_id=owner.id)
    db.add(est)
    db.flush()
    return est


def _h(client, email):
    return {"Authorization": f"Bearer {_token(client, email)}"}


# ------------------------------- Reglas ---------------------------------------------------

@pytest.mark.parametrize("text,blocked", [
    ("El servicio fue lento pero la comida estaba deliciosa", False),
    ("¡Qué chimba de lugar, volvería!", False),                  # coloquial positivo
    ("La comida estaba asquerosa y fría", False),                  # crítica legítima
    ("El mesero es un hijueputa", True),
    ("El mesero es un h1jueput4", True),                           # variante con números
    ("Visiten www.ofertas-baratas.com para descuentos", True),
    ("Escríbanme al 300 123 4567 y les vendo", True),
    ("PÉSIMO SERVICIO NUNCA VUELVO A ESTE LUGAR HORRIBLE", True),
    ("Buenoooooooooo", True),
])
def test_rules(text, blocked):
    assert (check_rules(text) is not None) == blocked


# ------------------------------- Flujo de reseñas -----------------------------------------

def test_rating_only_is_approved_and_updates_average(client, place, user_headers):
    r = client.post(f"/api/establishments/{place.id}/reviews", json={"rating": 4}, headers=user_headers)
    assert r.status_code == 201 and r.json()["status"] == "approved"
    page = client.get(f"/api/establishments/{place.id}/reviews").json()
    assert page["rating_count"] == 1 and page["rating_avg"] == 4.0
    assert page["distribution"]["4"] == 1


def test_comment_without_ai_goes_to_pending(client, place, user_headers):
    r = client.post(f"/api/establishments/{place.id}/reviews",
                    json={"rating": 5, "comment": "Excelente café y muy buena atención"}, headers=user_headers)
    assert r.json()["status"] == "pending"
    page = client.get(f"/api/establishments/{place.id}/reviews").json()
    assert page["total"] == 0 and page["rating_count"] == 0     # pendiente: no es pública ni cuenta


def test_ai_approves_and_rejects(client, place, user_headers, use_llm):
    use_llm(FakeLLM("approve"))
    ok = client.post(f"/api/establishments/{place.id}/reviews",
                     json={"rating": 5, "comment": "Excelente café y muy buena atención"}, headers=user_headers)
    assert ok.json()["status"] == "approved"
    assert client.get(f"/api/establishments/{place.id}/reviews").json()["items"][0]["author"] == "Prueba U."

    use_llm(FakeLLM("reject", "No tiene relación con el establecimiento"))
    edited = client.patch(f"/api/reviews/{ok.json()['id']}",
                          json={"rating": 1, "comment": "Voten por mi candidato en las elecciones"}, headers=user_headers)
    assert edited.json()["status"] == "rejected"
    assert "relación" in edited.json()["moderation_reason"]
    assert client.get(f"/api/establishments/{place.id}/reviews").json()["rating_count"] == 0


def test_ai_failure_goes_to_pending(client, place, user_headers, use_llm):
    use_llm(FakeLLM(fail=True))
    r = client.post(f"/api/establishments/{place.id}/reviews",
                    json={"rating": 3, "comment": "Normal, nada especial pero cumple"}, headers=user_headers)
    assert r.json()["status"] == "pending"


def test_offensive_comment_rejected_by_rules(client, place, user_headers):
    r = client.post(f"/api/establishments/{place.id}/reviews",
                    json={"rating": 1, "comment": "El dueño es un malparido"}, headers=user_headers)
    assert r.json()["status"] == "rejected" and "ofensivo" in r.json()["moderation_reason"]


def test_one_review_per_user_and_validation(client, place, user_headers):
    url = f"/api/establishments/{place.id}/reviews"
    assert client.post(url, json={"rating": 4}, headers=user_headers).status_code == 201
    assert client.post(url, json={"rating": 2}, headers=user_headers).status_code == 409
    assert client.post(url, json={"rating": 6}, headers=user_headers).status_code == 422
    assert client.post(url, json={"rating": 3, "comment": "corto"}, headers=user_headers).status_code == 422
    assert client.post(url, json={"rating": 4}).status_code == 401


def test_owner_cannot_review_own_place(client, place):
    r = client.post(f"/api/establishments/{place.id}/reviews", json={"rating": 5},
                    headers=_h(client, "duenio.resenas@test.com"))
    assert r.status_code == 403


def test_only_author_edits_author_or_admin_deletes(client, db, place, user_headers, admin_headers):
    review_id = client.post(f"/api/establishments/{place.id}/reviews", json={"rating": 4},
                            headers=user_headers).json()["id"]
    _make_user(db, "intruso@test.com", "user")
    intruder = _h(client, "intruso@test.com")
    assert client.patch(f"/api/reviews/{review_id}", json={"rating": 1}, headers=intruder).status_code == 403
    assert client.delete(f"/api/reviews/{review_id}", headers=intruder).status_code == 403
    assert client.patch(f"/api/reviews/{review_id}", json={"rating": 1}, headers=admin_headers).status_code == 403
    assert client.delete(f"/api/reviews/{review_id}", headers=admin_headers).status_code == 204
    assert client.get(f"/api/establishments/{place.id}/reviews").json()["rating_count"] == 0


def test_rate_limit_and_duplicates(client, db, user_headers, use_llm):
    use_llm(FakeLLM("approve"))
    muni = Place(name="Lebrija", normalized_name="lebrija", kind="municipio", latitude=7.1, longitude=-73.2)
    db.add(muni)
    db.flush()
    ests = [Establishment(name=f"L{i}", slug=f"l-{i}", municipality_id=muni.id, latitude=7.1, longitude=-73.2)
            for i in range(7)]
    db.add_all(ests)
    db.flush()
    text = "Me gustó mucho, buena atención y precios justos"
    first = client.post(f"/api/establishments/{ests[0].id}/reviews", json={"rating": 5, "comment": text},
                        headers=user_headers)
    copy = client.post(f"/api/establishments/{ests[1].id}/reviews", json={"rating": 5, "comment": text},
                       headers=user_headers)
    assert first.json()["status"] == "approved"
    assert copy.json()["status"] == "rejected" and "misma reseña" in copy.json()["moderation_reason"]
    for e in ests[2:5]:
        client.post(f"/api/establishments/{e.id}/reviews", json={"rating": 4}, headers=user_headers)
    sixth = client.post(f"/api/establishments/{ests[5].id}/reviews", json={"rating": 4}, headers=user_headers)
    assert sixth.json()["status"] == "rejected" and "muchas reseñas" in sixth.json()["moderation_reason"]


def test_report_review(client, db, place, user_headers):
    review_id = client.post(f"/api/establishments/{place.id}/reviews", json={"rating": 2},
                            headers=user_headers).json()["id"]
    assert client.post(f"/api/reviews/{review_id}/report", json={}, headers=user_headers).status_code == 400
    _make_user(db, "reporta@test.com", "user")
    h = _h(client, "reporta@test.com")
    assert client.post(f"/api/reviews/{review_id}/report", json={"message": "Es falsa"}, headers=h).status_code == 201
    assert client.post(f"/api/reviews/{review_id}/report", json={}, headers=h).status_code == 201  # no duplica
    assert db.query(Report).filter(Report.review_id == review_id).count() == 1


def test_my_review_shows_status(client, place, user_headers):
    assert client.get(f"/api/establishments/{place.id}/reviews/mine", headers=user_headers).json() is None
    client.post(f"/api/establishments/{place.id}/reviews",
                json={"rating": 5, "comment": "Muy buen lugar para trabajar"}, headers=user_headers)
    mine = client.get(f"/api/establishments/{place.id}/reviews/mine", headers=user_headers).json()
    assert mine["status"] == "pending" and mine["moderation_reason"]
