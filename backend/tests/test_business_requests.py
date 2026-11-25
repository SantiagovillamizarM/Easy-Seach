"""Solicitudes de negocios: registrar un negocio nuevo, verificar al solicitante y avisar por correo."""
import pytest
from sqlalchemy import func, select

from app.models import Category, Embedding, Establishment, OwnershipClaim, Place, User
from app.services import notifications
from app.services.email_templates import build_claim_decision_email, build_new_claim_email
from tests.conftest import _make_user, _token


@pytest.fixture()
def outbox(monkeypatch):
    sent = []
    monkeypatch.setattr(notifications.email_service, "send_email",
                        lambda to, subject, text, html=None, headers=None: sent.append(
                            {"to": to, "subject": subject, "text": text, "html": html}))
    return sent


@pytest.fixture()
def world(db):
    muni = Place(name="Girón", normalized_name="giron", kind="municipio", latitude=7.07, longitude=-73.17)
    bakery = Category(name="Panadería", slug="panaderia")
    db.add_all([muni, bakery])
    db.flush()
    existing = Establishment(name="Pollo Asado Prueba", slug="pollo-asado-prueba-giron", municipality_id=muni.id,
                             latitude=7.07, longitude=-73.17, source="osm")
    db.add(existing)
    db.flush()
    return {"muni": muni, "category": bakery, "existing": existing}


def _registration(world, **business):
    return {
        "business": {
            "name": "Panadería La Espiga", "category_ids": [world["category"].id],
            "municipality_id": world["muni"].id, "address": "Calle 30 # 25-10", "neighborhood": "El Poblado",
            "phone": "300 123 4567", "description": "Pan artesanal todos los días.",
            "latitude": 7.068, "longitude": -73.169, **business,
        },
        "contact_phone": "300 765 4321", "applicant_role": "encargado", "applicant_position": "Administradora",
        "message": "Puedo enviar el RUT.", "accept_terms": True,
    }


# ------------------------------- Validación ----------------------------------------------

def test_registration_validation(client, world, user_headers):
    url = "/api/business-registrations"
    assert client.post(url, json=_registration(world)).status_code == 401
    assert client.post(url, json={**_registration(world), "accept_terms": False}, headers=user_headers).status_code == 422
    assert client.post(url, json={**_registration(world), "applicant_role": "primo"},
                       headers=user_headers).status_code == 422


def test_registration_validates_the_business(client, world, user_headers):
    url = "/api/business-registrations"
    # Sin categoría, fuera del área metropolitana o con categoría/municipio inexistente
    assert client.post(url, json=_registration(world, category_ids=[]), headers=user_headers).status_code == 422
    assert client.post(url, json=_registration(world, latitude=4.71, longitude=-74.07),
                       headers=user_headers).status_code == 422
    assert client.post(url, json=_registration(world, category_ids=[999999]), headers=user_headers).status_code == 422
    assert client.post(url, json=_registration(world, municipality_id=999999), headers=user_headers).status_code == 422


def test_registration_rejects_businesses_already_in_the_app(client, world, user_headers):
    r = client.post("/api/business-registrations", json=_registration(world, name="pollo asado  PRUEBA"),
                    headers=user_headers)
    assert r.status_code == 409 and "/lugar/pollo-asado-prueba-giron" in r.json()["detail"]
    assert client.post("/api/business-registrations", json=_registration(world), headers=user_headers).status_code == 201
    # La misma persona no puede mandar dos veces el mismo negocio mientras está pendiente
    assert client.post("/api/business-registrations", json=_registration(world), headers=user_headers).status_code == 409


def test_claim_requires_role_and_consent(client, world, user_headers):
    url = f"/api/establishments/{world['existing'].id}/claims"
    base = {"message": "Soy el dueño desde 2019, tengo el RUT a mano.", "contact_phone": "300 123 4567"}
    assert client.post(url, json=base, headers=user_headers).status_code == 422
    assert client.post(url, json={**base, "applicant_role": "dueno", "accept_terms": False},
                       headers=user_headers).status_code == 422
    r = client.post(url, json={**base, "applicant_role": "dueno", "applicant_position": "  Gerente ",
                               "accept_terms": True}, headers=user_headers)
    assert r.status_code == 201
    body = r.json()
    assert body["kind"] == "claim" and body["applicant_role"] == "dueno" and body["applicant_position"] == "Gerente"


# ------------------------------- Aprobación -----------------------------------------------

def test_approving_a_registration_creates_the_verified_business(client, db, world, user_headers, admin_headers):
    claim = client.post("/api/business-registrations", json=_registration(world), headers=user_headers).json()
    assert claim["kind"] == "register" and claim["establishment_id"] is None
    assert claim["establishment_name"] == "Panadería La Espiga" and claim["status"] == "pending"
    assert client.get("/api/me/claims", headers=user_headers).json()[0]["id"] == claim["id"]

    pending = client.get("/api/admin/claims", headers=admin_headers).json()
    assert len(pending) == 1
    proposed = pending[0]["proposed"]
    assert proposed["municipality_name"] == "Girón" and proposed["category_names"] == ["Panadería"]
    assert pending[0]["consent_at"] is not None and pending[0]["applicant_position"] == "Administradora"

    r = client.post(f"/api/admin/claims/{claim['id']}/approve", json={"note": "RUT verificado"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    approved = r.json()
    assert approved["status"] == "approved" and approved["establishment_slug"] == "panaderia-la-espiga-giron"

    db.expire_all()
    user = db.scalar(select(User).where(User.email == "usuario@test.com"))
    est = db.get(Establishment, approved["establishment_id"])
    assert user.role == "owner" and est.owner_id == user.id and est.is_verified and est.source == "owner"
    assert est.address == "Calle 30 # 25-10" and [c.slug for c in est.categories] == ["panaderia"]
    # Queda indexado para la búsqueda desde que se aprueba
    assert db.scalar(select(func.count(Embedding.id)).where(Embedding.establishment_id == est.id)) >= 1
    # Y el nuevo propietario ya puede editarlo
    owner_h = {"Authorization": f"Bearer {_token(client, 'usuario@test.com')}"}
    assert client.get(f"/api/owner/establishments/{est.id}", headers=owner_h).status_code == 200


def test_rejecting_a_registration_creates_nothing(client, db, world, user_headers, admin_headers):
    claim = client.post("/api/business-registrations", json=_registration(world), headers=user_headers).json()
    r = client.post(f"/api/admin/claims/{claim['id']}/reject", json={}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["review_note"] == "No pudimos verificar los datos del negocio."
    assert db.scalar(select(Establishment.id).where(Establishment.name == "Panadería La Espiga")) is None
    assert client.post(f"/api/admin/claims/{claim['id']}/approve", json={}, headers=admin_headers).status_code == 409
    assert db.get(OwnershipClaim, claim["id"]).establishment_id is None


# ------------------------------- Correos ----------------------------------------------------

def test_admins_get_an_email_for_each_new_request(client, db, world, user_headers, admin_headers, outbox):
    _make_user(db, "otro.admin@test.com", "admin")
    _make_user(db, "admin.sin.confirmar@test.com", "admin", verified=False)
    client.post("/api/business-registrations", json=_registration(world), headers=user_headers)
    recipients = sorted(m["to"] for m in outbox)
    assert recipients == ["admin@test.com", "otro.admin@test.com"]
    mail = outbox[0]
    assert mail["subject"] == "Nueva solicitud para registrar «Panadería La Espiga»"
    assert "300 765 4321" in mail["text"] and "encargado autorizado" in mail["text"] and "(Girón)" in mail["text"]
    assert "/admin/solicitudes" in mail["text"]


def test_applicant_gets_an_email_with_the_decision(client, world, user_headers, admin_headers, outbox):
    claim = client.post("/api/business-registrations", json=_registration(world), headers=user_headers).json()
    outbox.clear()
    approved = client.post(f"/api/admin/claims/{claim['id']}/approve", json={}, headers=admin_headers).json()
    assert [m["to"] for m in outbox] == ["usuario@test.com"]
    assert outbox[0]["subject"] == "Ya puedes administrar «Panadería La Espiga» en Easy Search"
    assert f"/panel/lugar/{approved['establishment_id']}" in outbox[0]["text"]

    url = f"/api/establishments/{world['existing'].id}/claims"
    claim2 = client.post(url, json={"message": "Soy el dueño, tengo la cámara de comercio.", "contact_phone": "3001112233",
                                    "applicant_role": "dueno", "accept_terms": True}, headers=user_headers).json()
    outbox.clear()
    client.post(f"/api/admin/claims/{claim2['id']}/reject", json={"note": "El número no contestó."}, headers=admin_headers)
    assert outbox[0]["subject"] == "Tu solicitud para «Pollo Asado Prueba» no fue aprobada"
    assert "El número no contestó." in outbox[0]["text"] and "/lugar/pollo-asado-prueba-giron" in outbox[0]["text"]


def test_claim_emails_escape_user_text():
    _, _, html = build_new_claim_email("Ana Admin", "register", "<b>Pan</b>", "Girón", "<script>x</script>",
                                       "dueño", "300", "https://x")
    assert "<script>" not in html and "&lt;b&gt;Pan&lt;/b&gt;" in html
    _, _, html = build_claim_decision_email("Luis", "Pan & Co", False, "<i>no</i>", "https://x")
    assert "Pan &amp; Co" in html and "<i>no</i>" not in html
