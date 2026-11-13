"""Fase 6: solicitudes de propiedad, aprobación por admin, panel del propietario y fotos."""
import io

import pytest
from PIL import Image
from sqlalchemy import select

from app.models import Establishment, Place, User
from app.services import photos as photos_service
from tests.conftest import _make_user, _token


@pytest.fixture()
def shop(db):
    muni = Place(name="Piedecuesta", normalized_name="piedecuesta", kind="municipio", latitude=6.98, longitude=-73.05)
    db.add(muni)
    db.flush()
    est = Establishment(name="Montallantas Prueba", slug="montallantas-prueba", municipality_id=muni.id,
                        latitude=6.98, longitude=-73.05, source="osm")
    db.add(est)
    db.flush()
    return est


@pytest.fixture(autouse=True)
def temp_uploads(tmp_path, monkeypatch):
    """Las fotos de las pruebas se guardan en una carpeta temporal."""
    monkeypatch.setattr(photos_service, "UPLOAD_ROOT", tmp_path)
    return tmp_path


def _h(client, email):
    return {"Authorization": f"Bearer {_token(client, email)}"}


CLAIM = {"message": "Soy el dueño desde 2019, puedo enviar el RUT y la cámara de comercio.", "contact_phone": "300 123 4567"}


def _approve(client, admin_headers, establishment_id, user_headers):
    claim = client.post(f"/api/establishments/{establishment_id}/claims", json=CLAIM, headers=user_headers).json()
    r = client.post(f"/api/admin/claims/{claim['id']}/approve", json={"note": "Verificado por teléfono"},
                    headers=admin_headers)
    assert r.status_code == 200, r.text
    return claim


# ------------------------------- Solicitudes ----------------------------------------------

def test_claim_validation_and_duplicates(client, shop, user_headers):
    url = f"/api/establishments/{shop.id}/claims"
    assert client.post(url, json=CLAIM).status_code == 401
    assert client.post(url, json={**CLAIM, "message": "corto"}, headers=user_headers).status_code == 422
    assert client.post(url, json=CLAIM, headers=user_headers).status_code == 201
    assert client.post(url, json=CLAIM, headers=user_headers).status_code == 409   # ya hay una pendiente
    mine = client.get("/api/me/claims", headers=user_headers).json()
    assert mine[0]["status"] == "pending" and mine[0]["establishment_slug"] == "montallantas-prueba"


def test_only_admin_reviews_claims(client, shop, user_headers):
    claim = client.post(f"/api/establishments/{shop.id}/claims", json=CLAIM, headers=user_headers).json()
    assert client.post(f"/api/admin/claims/{claim['id']}/approve", json={}, headers=user_headers).status_code == 403
    assert client.get("/api/admin/claims", headers=user_headers).status_code == 403


def test_approve_makes_owner_and_rejects_others(client, db, shop, user_headers, admin_headers):
    _make_user(db, "competidor@test.com", "user")
    other = _h(client, "competidor@test.com")
    other_claim = client.post(f"/api/establishments/{shop.id}/claims", json=CLAIM, headers=other).json()

    pending = client.get("/api/admin/claims", headers=admin_headers).json()
    assert len(pending) == 1 and pending[0]["user_email"] == "competidor@test.com"

    _approve(client, admin_headers, shop.id, user_headers)
    db.expire_all()
    est = db.get(Establishment, shop.id)
    owner = db.scalar(select(User).where(User.email == "usuario@test.com"))
    assert est.owner_id == owner.id and est.is_verified and owner.role == "owner"

    other_status = client.get("/api/me/claims", headers=other).json()[0]
    assert other_status["id"] == other_claim["id"] and other_status["status"] == "rejected"
    # Ya tiene dueño: nadie más puede solicitarlo
    assert client.post(f"/api/establishments/{shop.id}/claims", json=CLAIM, headers=other).status_code == 409


def test_reject_claim(client, shop, user_headers, admin_headers):
    claim = client.post(f"/api/establishments/{shop.id}/claims", json=CLAIM, headers=user_headers).json()
    r = client.post(f"/api/admin/claims/{claim['id']}/reject", json={}, headers=admin_headers)
    assert r.json()["status"] == "rejected" and r.json()["review_note"]
    assert client.post(f"/api/admin/claims/{claim['id']}/approve", json={}, headers=admin_headers).status_code == 409


# ------------------------------- Panel del propietario ------------------------------------

def test_owner_panel_lists_only_own(client, shop, user_headers, admin_headers):
    assert client.get("/api/owner/establishments", headers=user_headers).status_code == 403   # aún no es owner
    _approve(client, admin_headers, shop.id, user_headers)
    owner_headers = _h(client, "usuario@test.com")   # nuevo token con el rol actualizado
    mine = client.get("/api/owner/establishments", headers=owner_headers).json()
    assert [e["slug"] for e in mine] == ["montallantas-prueba"]
    assert mine[0]["has_hours"] is False
    # Y puede editarlo con los endpoints del catálogo
    r = client.patch(f"/api/establishments/{shop.id}", json={"description": "Despinche y venta de llantas"},
                     headers=owner_headers)
    assert r.status_code == 200 and r.json()["source"] == "owner"


def test_owner_editor_includes_unavailable_offerings(client, db, shop, user_headers, admin_headers):
    _approve(client, admin_headers, shop.id, user_headers)
    h = _h(client, "usuario@test.com")
    client.post(f"/api/establishments/{shop.id}/offerings", headers=h,
                json={"kind": "product", "name": "Llanta rin 13", "price": 180000, "is_available": False})
    editor = client.get(f"/api/owner/establishments/{shop.id}", headers=h)
    assert editor.status_code == 200
    assert [o["name"] for o in editor.json()["offerings"]] == ["Llanta rin 13"]
    # El detalle público no muestra lo que no está disponible
    assert client.get("/api/establishments/montallantas-prueba").json()["offerings"] == []
    # Otro propietario no puede abrir el editor
    _make_user(db, "extrano2@test.com", "owner")
    assert client.get(f"/api/owner/establishments/{shop.id}",
                      headers=_h(client, "extrano2@test.com")).status_code == 403


# ------------------------------- Fotos ----------------------------------------------------

def _jpeg_with_gps() -> bytes:
    img = Image.new("RGB", (2400, 1200), "red")
    exif = Image.Exif()
    exif[0x8825] = {2: (7.0, 4.0, 0.0), 4: (73.0, 6.0, 0.0)}  # GPSInfo: latitud y longitud
    exif[0x010F] = "MarcaCelular"                                # fabricante de la cámara
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif)
    return buf.getvalue()


def test_photo_upload_strips_exif_and_resizes(client, shop, user_headers, admin_headers, temp_uploads):
    _approve(client, admin_headers, shop.id, user_headers)
    h = _h(client, "usuario@test.com")
    original = _jpeg_with_gps()
    assert Image.open(io.BytesIO(original)).getexif()          # la original SÍ tiene metadatos
    r = client.post(f"/api/establishments/{shop.id}/photos", headers=h,
                    files={"file": ("foto.jpg", original, "image/jpeg")}, data={"caption": "Fachada"})
    assert r.status_code == 201, r.text
    url = r.json()["url"]
    assert url.startswith("/uploads/establishments/") and url.endswith(".webp")
    with Image.open(temp_uploads / url.removeprefix("/uploads/")) as saved:   # "with" cierra el archivo
        assert max(saved.size) == 1600                          # redimensionada
        assert not saved.getexif()                              # sin metadatos (ni GPS)
    detail = client.get("/api/establishments/montallantas-prueba").json()
    assert detail["photos"][0]["caption"] == "Fachada" and detail["photo_url"] == url

    assert client.delete(f"/api/establishments/{shop.id}/photos/{r.json()['id']}", headers=h).status_code == 204
    assert not (temp_uploads / url.removeprefix("/uploads/")).exists()


def test_photo_rejects_fake_images_and_strangers(client, db, shop, user_headers, admin_headers):
    _approve(client, admin_headers, shop.id, user_headers)
    h = _h(client, "usuario@test.com")
    fake = client.post(f"/api/establishments/{shop.id}/photos", headers=h,
                       files={"file": ("virus.jpg", b"<?php echo 'hola'; ?>", "image/jpeg")})
    assert fake.status_code == 422
    _make_user(db, "extrano@test.com", "owner")
    stranger = client.post(f"/api/establishments/{shop.id}/photos", headers=_h(client, "extrano@test.com"),
                           files={"file": ("foto.jpg", _jpeg_with_gps(), "image/jpeg")})
    assert stranger.status_code == 403


def test_offering_section_is_cleaned_and_editable(client, db, shop, user_headers, admin_headers):
    _approve(client, admin_headers, shop.id, user_headers)
    h = _h(client, "usuario@test.com")
    r = client.post(f"/api/establishments/{shop.id}/offerings", headers=h,
                    json={"kind": "product", "name": "Llanta rin 14", "section": "  llantas   nuevas "})
    assert r.status_code == 201 and r.json()["section"] == "Llantas nuevas"
    r = client.patch(f"/api/offerings/{r.json()['id']}", headers=h, json={"section": ""})
    assert r.json()["section"] is None   # vacío = sin sección
