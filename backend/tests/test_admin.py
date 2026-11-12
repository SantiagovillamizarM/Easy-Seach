"""Fase 7: panel administrativo (moderación, establecimientos, duplicados, usuarios, estadísticas)."""
import pytest
from sqlalchemy import select

from app.models import Category, Establishment, Place, Report, Review, SearchHistory, User
from tests.conftest import _make_user, _token


@pytest.fixture()
def muni(db):
    place = Place(name="Bucaramanga", normalized_name="bucaramanga", kind="municipio", latitude=7.119, longitude=-73.122)
    db.add(place)
    db.flush()
    return place


def _est(db, muni, name, slug, lat=7.119, lng=-73.122, **kw):
    est = Establishment(name=name, slug=slug, municipality_id=muni.id, latitude=lat, longitude=lng, source="osm", **kw)
    db.add(est)
    db.flush()
    return est


def _review(db, est, email, rating, comment, status="approved"):
    author = _make_user(db, email, "user")
    review = Review(establishment_id=est.id, user_id=author.id, rating=rating, comment=comment, status=status)
    db.add(review)
    db.flush()
    return review


def test_admin_endpoints_require_admin(client, user_headers):
    for path in ("/api/admin/overview", "/api/admin/reviews", "/api/admin/establishments", "/api/admin/duplicates",
                 "/api/admin/users", "/api/admin/categories", "/api/admin/search-stats"):
        assert client.get(path, headers=user_headers).status_code == 403, path
        assert client.get(path).status_code == 401, path


# ------------------------------- Moderación -----------------------------------------------

def test_approve_pending_review_updates_rating(client, db, muni, admin_headers):
    est = _est(db, muni, "Panadería La Espiga", "la-espiga")
    _review(db, est, "a@test.com", 5, "Excelente pan, muy fresco")
    pending = _review(db, est, "b@test.com", 3, "Bien, aunque algo demorado", status="pending")

    queue = client.get("/api/admin/reviews?status=pending", headers=admin_headers).json()
    assert queue["total"] == 1 and queue["counts"]["pending"] == 1
    item = queue["items"][0]
    assert item["establishment"]["slug"] == "la-espiga" and item["author"]["email"] == "b@test.com"

    r = client.post(f"/api/admin/reviews/{pending.id}/approve", headers=admin_headers).json()
    assert r["status"] == "approved" and r["rating_count"] == 2  # se recalcula: la existente + la aprobada
    public = client.get(f"/api/establishments/{est.id}/reviews").json()
    assert public["total"] == 2 and public["rating_avg"] == 4.0
    assert client.get("/api/admin/reviews?status=pending", headers=admin_headers).json()["total"] == 0


def test_reported_review_reject_resolves_reports(client, db, muni, admin_headers, user_headers):
    est = _est(db, muni, "Bar El Rincón", "el-rincon")
    review = _review(db, est, "autor@test.com", 1, "Contenido que alguien considera inapropiado")
    client.post(f"/api/reviews/{review.id}/report", json={"message": "Es un ataque personal"}, headers=user_headers)

    reported = client.get("/api/admin/reviews?status=reported", headers=admin_headers).json()
    assert reported["counts"]["reported"] == 1
    assert reported["items"][0]["open_reports"] == 1
    assert reported["items"][0]["reports"][0]["message"] == "Es un ataque personal"

    r = client.post(f"/api/admin/reviews/{review.id}/reject", json={"reason": "Ataque personal"}, headers=admin_headers)
    assert r.json()["status"] == "rejected" and r.json()["rating_count"] == 0
    db.expire_all()
    assert db.scalar(select(Report.status).where(Report.review_id == review.id)) == "resolved"
    assert db.get(Review, review.id).moderation_reason == "Ataque personal"
    assert client.get("/api/admin/reviews?status=reported", headers=admin_headers).json()["total"] == 0
    assert client.post("/api/admin/reviews/999999/approve", headers=admin_headers).status_code == 404


# ------------------------------- Establecimientos -----------------------------------------

def test_establishment_search_hide_and_duplicate(client, db, muni, admin_headers):
    a = _est(db, muni, "Panadería Santa Clara", "santa-clara")
    b = _est(db, muni, "Panaderia Santa Clara Sede 2", "santa-clara-2")
    _est(db, muni, "Ferretería El Tornillo", "el-tornillo")

    found = client.get("/api/admin/establishments?q=PANADERIA", headers=admin_headers).json()  # sin tilde
    assert found["total"] == 2 and {i["slug"] for i in found["items"]} == {"santa-clara", "santa-clara-2"}
    assert client.get("/api/admin/establishments?q=100%25", headers=admin_headers).json()["total"] == 0  # "%" literal

    hidden = client.patch(f"/api/admin/establishments/{a.id}", json={"status": "hidden"}, headers=admin_headers)
    assert hidden.status_code == 200 and hidden.json()["status"] == "hidden"
    assert client.get("/api/establishments/santa-clara").status_code == 404  # fuera de la vista pública

    # Duplicado de un establecimiento oculto: no permitido
    bad = client.patch(f"/api/admin/establishments/{b.id}", json={"status": "duplicate", "duplicate_of_id": a.id},
                       headers=admin_headers)
    assert bad.status_code == 422
    assert client.patch(f"/api/admin/establishments/{b.id}", json={"status": "duplicate"},
                        headers=admin_headers).status_code == 422  # falta el original

    client.patch(f"/api/admin/establishments/{a.id}", json={"status": "active"}, headers=admin_headers)
    dup = client.patch(f"/api/admin/establishments/{b.id}", json={"status": "duplicate", "duplicate_of_id": a.id},
                       headers=admin_headers).json()
    assert dup["status"] == "duplicate" and dup["duplicate_of_id"] == a.id
    only_active = client.get("/api/admin/establishments?status=active", headers=admin_headers).json()
    assert {i["slug"] for i in only_active["items"]} == {"santa-clara", "el-tornillo"}


def test_remove_owner(client, db, muni, admin_headers):
    owner = _make_user(db, "duena@test.com", "owner")
    est = _est(db, muni, "Droguería Vida", "drogueria-vida", owner_id=owner.id, is_verified=True)
    item = client.get("/api/admin/establishments?owner=with", headers=admin_headers).json()["items"][0]
    assert item["owner"]["email"] == "duena@test.com"
    r = client.delete(f"/api/admin/establishments/{est.id}/owner", headers=admin_headers).json()
    assert r["owner"] is None and r["is_verified"] is False
    assert client.delete(f"/api/admin/establishments/{est.id}/owner", headers=admin_headers).status_code == 409


# ------------------------------- Duplicados -----------------------------------------------

def test_duplicates_detection_and_dismiss(client, db, muni, admin_headers):
    a = _est(db, muni, "Tienda Don Pepe", "don-pepe", lat=7.1190, lng=-73.1220)
    b = _est(db, muni, "Tienda Don Pepe", "don-pepe-osm", lat=7.1192, lng=-73.1221)   # ~25 m
    _est(db, muni, "Tienda Don Pepe", "don-pepe-lejos", lat=7.1400, lng=-73.1220)     # ~2 km: no
    _est(db, muni, "Barbería Estilo", "estilo", lat=7.1190, lng=-73.1221)             # cerca, otro nombre: no
    _est(db, muni, "Centro Comercial Cabecera II Etapa", "cc-2", lat=7.1191, lng=-73.1222)
    _est(db, muni, "Centro Comercial Cabecera III Etapa", "cc-3", lat=7.1192, lng=-73.1222)  # solo cambia el número

    pairs = client.get("/api/admin/duplicates", headers=admin_headers).json()
    assert len(pairs) == 1
    assert {pairs[0]["a"]["id"], pairs[0]["b"]["id"]} == {a.id, b.id}
    assert pairs[0]["similarity"] == 1.0 and pairs[0]["distance_m"] < 50
    assert client.get("/api/admin/overview", headers=admin_headers).json()["pending"]["duplicates"] == 1

    # Se envía en desorden: el servidor ordena el par. Repetirlo no es un error.
    for _ in range(2):
        assert client.post("/api/admin/duplicates/dismiss", json={"a_id": b.id, "b_id": a.id},
                           headers=admin_headers).status_code == 201
    assert client.get("/api/admin/duplicates", headers=admin_headers).json() == []


# ------------------------------- Usuarios -------------------------------------------------

def test_users_search_and_role_changes(client, db, muni, admin_headers):
    owner = _make_user(db, "propietario@test.com", "owner")
    owner.full_name = "Andrés Gómez"
    est = _est(db, muni, "Taller Gómez", "taller-gomez", owner_id=owner.id, is_verified=True)

    found = client.get("/api/admin/users?q=andres", headers=admin_headers).json()  # sin tilde
    assert found["total"] == 1 and found["items"][0]["establishments_count"] == 1
    assert client.get("/api/admin/users?role=admin", headers=admin_headers).json()["total"] == 1

    r = client.patch(f"/api/admin/users/{owner.id}", json={"role": "user"}, headers=admin_headers).json()
    assert r["role"] == "user" and r["establishments_count"] == 0
    db.expire_all()
    assert db.get(Establishment, est.id).owner_id is None and not db.get(Establishment, est.id).is_verified


def test_admin_cannot_lock_themselves_out(client, db, admin_headers):
    me = db.scalar(select(User).where(User.email == "admin@test.com"))
    assert client.patch(f"/api/admin/users/{me.id}", json={"role": "user"}, headers=admin_headers).status_code == 400
    assert client.patch(f"/api/admin/users/{me.id}", json={"is_active": False}, headers=admin_headers).status_code == 400


def test_deactivated_user_loses_access(client, db, admin_headers):
    victim = _make_user(db, "spam@test.com", "user")
    token = _token(client, "spam@test.com")
    client.patch(f"/api/admin/users/{victim.id}", json={"is_active": False}, headers=admin_headers)
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    assert client.post("/api/auth/login", data={"username": "spam@test.com", "password": "clave1234"}).status_code != 200


# ------------------------------- Categorías y estadísticas --------------------------------

def test_categories_with_counts(client, db, muni, admin_headers):
    cat = Category(name="Panaderías", slug="panaderias")
    db.add(cat)
    db.flush()
    est = _est(db, muni, "Pan Pan", "pan-pan")
    est.categories = [cat]
    hidden = _est(db, muni, "Pan Viejo", "pan-viejo", status="hidden")
    hidden.categories = [cat]
    db.flush()
    rows = client.get("/api/admin/categories", headers=admin_headers).json()
    assert next(c for c in rows if c["slug"] == "panaderias")["establishments"] == 1  # solo activos


def test_search_stats(client, db, admin_headers):
    db.add_all([
        SearchHistory(query_text="Pizza", results_count=8, parsed_query={"category_slugs": ["comida-rapida"]}),
        SearchHistory(query_text="  pizza ", results_count=6, parsed_query={"category_slugs": ["comida-rapida"]}),
        SearchHistory(query_text="cerrajero 24 horas", results_count=0, parsed_query={"category_slugs": []}),
        SearchHistory(query_text="sushi", results_count=3, parsed_query=None),
    ])
    db.flush()
    stats = client.get("/api/admin/search-stats?days=7", headers=admin_headers).json()
    assert stats["total"] == 4 and stats["zero_results"] == 1 and stats["logged_in"] == 0
    assert len(stats["daily"]) == 7 and stats["daily"][-1]["count"] == 4
    assert stats["top_queries"][0] == {"query": "pizza", "count": 2, "avg_results": 7.0}
    assert stats["top_zero_results"][0]["query"] == "cerrajero 24 horas"
    assert stats["top_categories"][0]["slug"] == "comida-rapida" and stats["top_categories"][0]["count"] == 2
