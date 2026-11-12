"""Fase 5: favoritos e historial (solo datos propios)."""
import pytest
from sqlalchemy import select

from app.models import Establishment, Place, SearchHistory
from tests.conftest import _make_user, _token


@pytest.fixture()
def places(db):
    muni = Place(name="Girón", normalized_name="giron", kind="municipio", latitude=7.07, longitude=-73.17)
    db.add(muni)
    db.flush()
    a = Establishment(name="Lugar A", slug="lugar-a", municipality_id=muni.id, latitude=7.07, longitude=-73.17)
    b = Establishment(name="Lugar B", slug="lugar-b", municipality_id=muni.id, latitude=7.07, longitude=-73.17)
    hidden = Establishment(name="Oculto", slug="oculto", municipality_id=muni.id, latitude=7.07, longitude=-73.17,
                           status="hidden")
    db.add_all([a, b, hidden])
    db.flush()
    return {"a": a, "b": b, "hidden": hidden}


def test_favorites_require_login(client, places):
    assert client.get("/api/me/favorites").status_code == 401
    assert client.put(f"/api/me/favorites/{places['a'].id}").status_code == 401


def test_add_list_remove_favorites(client, places, user_headers):
    a, b = places["a"].id, places["b"].id
    assert client.put(f"/api/me/favorites/{a}", headers=user_headers).status_code == 204
    assert client.put(f"/api/me/favorites/{a}", headers=user_headers).status_code == 204  # idempotente
    assert client.put(f"/api/me/favorites/{b}", headers=user_headers).status_code == 204

    favs = client.get("/api/me/favorites", headers=user_headers).json()
    assert {f["id"] for f in favs} == {a, b}
    assert "saved_at" in favs[0]
    assert set(client.get("/api/me/favorites/ids", headers=user_headers).json()) == {a, b}

    assert client.delete(f"/api/me/favorites/{a}", headers=user_headers).status_code == 204
    assert client.get("/api/me/favorites/ids", headers=user_headers).json() == [b]


def test_cannot_favorite_missing_or_hidden(client, places, user_headers):
    assert client.put("/api/me/favorites/999999", headers=user_headers).status_code == 404
    assert client.put(f"/api/me/favorites/{places['hidden'].id}", headers=user_headers).status_code == 404


def test_favorites_are_private(client, db, places, user_headers):
    client.put(f"/api/me/favorites/{places['a'].id}", headers=user_headers)
    _make_user(db, "otra@test.com", "user")
    other = {"Authorization": f"Bearer {_token(client, 'otra@test.com')}"}
    assert client.get("/api/me/favorites", headers=other).json() == []


def _add_history(db, user_id, text):
    row = SearchHistory(user_id=user_id, query_text=text, parsed_query={"need": text}, results_count=3)
    db.add(row)
    db.flush()
    return row


def test_history_list_and_delete_only_own(client, db, user_headers):
    me_id = client.get("/api/auth/me", headers=user_headers).json()["id"]
    mine = _add_history(db, me_id, "hamburguesas")
    _add_history(db, me_id, "pizza")
    other_user = _make_user(db, "otro2@test.com", "user")
    theirs = _add_history(db, other_user.id, "secreto")

    page = client.get("/api/me/history", headers=user_headers).json()
    assert page["total"] == 2
    assert {i["query_text"] for i in page["items"]} == {"hamburguesas", "pizza"}

    # No puedo borrar la búsqueda de otra persona
    assert client.delete(f"/api/me/history/{theirs.id}", headers=user_headers).status_code == 404

    assert client.delete(f"/api/me/history/{mine.id}", headers=user_headers).status_code == 204
    db.expire_all()
    assert db.get(SearchHistory, mine.id).user_id is None      # desvinculada (anónima), no visible para mí
    assert client.get("/api/me/history", headers=user_headers).json()["total"] == 1


def test_clear_history(client, db, user_headers):
    me_id = client.get("/api/auth/me", headers=user_headers).json()["id"]
    _add_history(db, me_id, "uno")
    _add_history(db, me_id, "dos")
    assert client.delete("/api/me/history", headers=user_headers).status_code == 204
    assert client.get("/api/me/history", headers=user_headers).json() == {"total": 0, "items": []}
    assert db.scalar(select(SearchHistory).where(SearchHistory.user_id == me_id)) is None
