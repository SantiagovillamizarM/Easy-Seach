"""Búsquedas de prueba sin cuenta: pocas por IP cada 24 horas y un tope diario entre todos los invitados."""
from app.core.config import get_settings
from app.models import SearchHistory
from tests.conftest import _make_user, _token

QUERIES = ["pizza en piedecuesta", "hamburguesas en girón", "gimnasio en floridablanca", "cajero en bucaramanga"]


def _search(client, q=QUERIES[0], headers=None):
    return client.post("/api/search", json={"q": q}, headers=headers or {})


def test_guest_has_three_trial_searches(client, db):
    remaining = [_search(client, q).json()["guest_remaining"] for q in QUERIES[:3]]
    assert remaining == [2, 1, 0]
    blocked = _search(client, QUERIES[3])
    assert blocked.status_code == 429 and blocked.headers["X-Error-Code"] == "guest_limit"
    assert "Crea una cuenta gratis" in blocked.json()["detail"]
    # Las búsquedas de invitados cuentan en las estadísticas, sin usuario
    rows = db.query(SearchHistory).filter(SearchHistory.query_text.in_(QUERIES[:3])).all()
    assert len(rows) == 3 and all(r.user_id is None for r in rows)


def test_repeating_the_same_search_is_free(client):
    """Volver atrás desde un lugar o recargar repite la búsqueda: no se cobra otra vez."""
    assert _search(client, "Pizza en Piedecuesta").json()["guest_remaining"] == 2
    assert _search(client, "pizza en  piedecuesta").json()["guest_remaining"] == 2
    assert _search(client, QUERIES[1]).json()["guest_remaining"] == 1
    assert _search(client, QUERIES[2]).json()["guest_remaining"] == 0
    assert _search(client, QUERIES[0]).status_code == 200      # repetida: sigue sirviendo aunque ya no queden
    assert _search(client, QUERIES[3]).status_code == 429


def test_account_is_not_limited_by_guest_counter(client, db):
    for q in QUERIES[:3]:
        _search(client, q)
    assert _search(client, QUERIES[3]).status_code == 429
    _make_user(db, "con-cuenta@test.com", "user")
    h = {"Authorization": f"Bearer {_token(client, 'con-cuenta@test.com')}"}
    r = _search(client, QUERIES[3], h)
    assert r.status_code == 200 and r.json()["guest_remaining"] is None


def test_unverified_account_must_confirm_instead_of_trial(client, db):
    _make_user(db, "sin-confirmar@test.com", "user", verified=False)
    h = {"Authorization": f"Bearer {_token(client, 'sin-confirmar@test.com')}"}
    r = _search(client, headers=h)
    assert r.status_code == 403 and r.headers["X-Error-Code"] == "email_not_verified"


def test_recommendations_have_their_own_trial_counter(client):
    for q in QUERIES[:3]:
        assert client.post("/api/recommendations", json={"q": q, "establishment_ids": [1]}).status_code == 200
    assert client.post("/api/recommendations", json={"q": QUERIES[3], "establishment_ids": [1]}).status_code == 429
    assert _search(client).status_code == 200          # explicar los resultados no gasta búsquedas


def test_daily_total_for_all_guests(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "guest_searches_daily_total", 2)
    assert _search(client, QUERIES[0]).status_code == 200
    assert _search(client, QUERIES[1]).status_code == 200
    r = _search(client, QUERIES[2])
    assert r.status_code == 429 and "de hoy se agotaron" in r.json()["detail"]
