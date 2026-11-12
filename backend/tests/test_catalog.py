"""Fase 2: API del catálogo, permisos de edición y regeneración de embeddings."""
import pytest
from sqlalchemy import select

from app.models import Category, Embedding, Establishment, Place
from tests.conftest import _make_user, _token


@pytest.fixture()
def setup(db):
    muni = Place(name="Piedecuesta", normalized_name="piedecuesta", kind="municipio",
                 latitude=6.98, longitude=-73.05)
    cat = Category(name="Comida rápida", slug="comida-rapida-test", description="Hamburguesas")
    db.add_all([muni, cat])
    db.flush()
    est = Establishment(name="Hamburguesas Prueba", slug="hamburguesas-prueba", municipality_id=muni.id,
                        latitude=6.98, longitude=-73.05, source="osm")
    est.categories = [cat]
    db.add(est)
    db.flush()
    owner = _make_user(db, "duenio@test.com", "owner")
    other_owner = _make_user(db, "otro@test.com", "owner")
    est.owner_id = owner.id
    db.flush()
    return {"muni": muni, "cat": cat, "est": est, "owner": owner, "other_owner": other_owner}


def _headers(client, email):
    return {"Authorization": f"Bearer {_token(client, email)}"}


def test_public_detail_without_hours_is_unknown(client, setup):
    r = client.get("/api/establishments/hamburguesas-prueba")
    assert r.status_code == 200
    body = r.json()
    assert body["hours_status"]["state"] == "unknown"
    assert body["municipality"] == "Piedecuesta"
    assert client.get("/api/establishments/no-existe").status_code == 404


def test_anonymous_and_normal_user_cannot_edit(client, setup, user_headers):
    url = f"/api/establishments/{setup['est'].id}"
    assert client.patch(url, json={"description": "x"}).status_code == 401
    assert client.patch(url, json={"description": "x"}, headers=user_headers).status_code == 403


def test_owner_can_edit_only_own_establishment(client, setup):
    url = f"/api/establishments/{setup['est'].id}"
    other = client.patch(url, json={"description": "hackeado"}, headers=_headers(client, "otro@test.com"))
    assert other.status_code == 403

    own = client.patch(url, json={"description": "Hamburguesas artesanales con porciones grandes"},
                       headers=_headers(client, "duenio@test.com"))
    assert own.status_code == 200
    assert own.json()["description"].startswith("Hamburguesas artesanales")
    assert own.json()["source"] == "owner"  # la importación OSM ya no lo sobrescribe


def test_admin_can_edit_and_validation_errors(client, setup, admin_headers):
    url = f"/api/establishments/{setup['est'].id}"
    ok = client.patch(url, json={"price_min": 15000, "price_max": 30000, "website": "https://ejemplo.co"},
                      headers=admin_headers)
    assert ok.status_code == 200
    assert client.patch(url, json={"price_min": 50000}, headers=admin_headers).status_code == 422  # > price_max
    assert client.patch(url, json={"website": "ejemplo.co"}, headers=admin_headers).status_code == 422
    assert client.patch(url, json={"phone": "abc"}, headers=admin_headers).status_code == 422
    assert client.patch(url, json={"name": ""}, headers=admin_headers).status_code == 422


def test_edit_regenerates_embedding_only_when_text_changes(client, db, setup, admin_headers, fake_embedder):
    url = f"/api/establishments/{setup['est'].id}"
    client.patch(url, json={"description": "Hamburguesas al carbón"}, headers=admin_headers)
    first = db.scalar(select(Embedding).where(Embedding.entity_type == "establishment",
                                              Embedding.entity_id == setup["est"].id))
    assert first is not None and "Hamburguesas al carbón" in first.content
    calls_before = len(fake_embedder.calls)

    # Cambiar un dato que NO está en el texto semántico (teléfono): no se recalcula
    client.patch(url, json={"phone": "300 123 4567"}, headers=admin_headers)
    assert len(fake_embedder.calls) == calls_before

    # Cambiar la descripción: sí se recalcula
    client.patch(url, json={"description": "Perros calientes"}, headers=admin_headers)
    assert len(fake_embedder.calls) == calls_before + 1


def test_offerings_create_update_delete_with_embeddings(client, db, setup):
    h = _headers(client, "duenio@test.com")
    est_id = setup["est"].id
    r = client.post(f"/api/establishments/{est_id}/offerings",
                    json={"kind": "product", "name": "Hamburguesa doble", "price": 22000}, headers=h)
    assert r.status_code == 201
    offering_id = r.json()["id"]
    emb = db.scalar(select(Embedding).where(Embedding.entity_type == "offering", Embedding.entity_id == offering_id))
    assert emb is not None and "Hamburguesa doble" in emb.content

    assert client.patch(f"/api/offerings/{offering_id}", json={"price": 24000}, headers=h).json()["price"] == "24000.00"
    assert client.patch(f"/api/offerings/{offering_id}", json={"price": -1}, headers=h).status_code == 422
    # Otro propietario no puede tocarlo
    assert client.delete(f"/api/offerings/{offering_id}",
                         headers=_headers(client, "otro@test.com")).status_code == 403

    assert client.delete(f"/api/offerings/{offering_id}", headers=h).status_code == 204
    gone = db.scalar(select(Embedding).where(Embedding.entity_type == "offering", Embedding.entity_id == offering_id))
    assert gone is None  # el vector del producto eliminado también se borra


def test_weekly_and_special_hours(client, setup):
    h = _headers(client, "duenio@test.com")
    est_id = setup["est"].id
    slots = [{"day_of_week": d, "opens_at": "00:00", "closes_at": "00:00"} for d in range(7)]  # 24 horas
    r = client.put(f"/api/establishments/{est_id}/hours", json={"slots": slots}, headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["hours_status"]["state"] == "open"
    assert body["hours_status"]["verified"] is True   # lo confirmó el propietario
    assert body["hours_verified_at"] is not None

    bad = client.post(f"/api/establishments/{est_id}/special-hours",
                      json={"date": "2030-01-01", "is_closed": False}, headers=h)
    assert bad.status_code == 422  # faltan horas
    ok = client.post(f"/api/establishments/{est_id}/special-hours",
                     json={"date": "2030-01-01", "is_closed": True, "note": "Año nuevo"}, headers=h)
    assert ok.status_code == 201
    detail = client.get("/api/establishments/hamburguesas-prueba").json()
    assert detail["special_hours"][0]["note"] == "Año nuevo"


def test_create_requires_admin_and_valid_municipality(client, setup, admin_headers):
    data = {"name": "Nuevo Local", "municipality_id": setup["muni"].id, "latitude": 6.99, "longitude": -73.04,
            "category_ids": [setup["cat"].id]}
    assert client.post("/api/establishments", json=data,
                       headers=_headers(client, "duenio@test.com")).status_code == 403
    r = client.post("/api/establishments", json=data, headers=admin_headers)
    assert r.status_code == 201
    assert r.json()["slug"] == "nuevo-local-piedecuesta"
    bad = client.post("/api/establishments", json={**data, "municipality_id": 999999}, headers=admin_headers)
    assert bad.status_code == 422


def test_list_and_places_filters(client, setup):
    r = client.get("/api/establishments", params={"name": "hamburguesas", "municipality_id": setup["muni"].id})
    assert [e["slug"] for e in r.json()] == ["hamburguesas-prueba"]
    places = client.get("/api/places", params={"q": "PIEDE"}).json()
    assert any(p["name"] == "Piedecuesta" for p in places)
