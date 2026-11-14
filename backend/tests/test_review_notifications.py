"""Aviso por correo al propietario cuando se publica una reseña de su negocio."""
import pytest

from app.models import Establishment, Place
from app.services import notifications
from app.services.email_templates import build_new_review_email
from tests.conftest import _make_user


@pytest.fixture()
def outbox(monkeypatch):
    sent = []
    monkeypatch.setattr(notifications.email_service, "send_email",
                        lambda to, subject, text, html=None: sent.append({"to": to, "subject": subject, "text": text}))
    return sent


@pytest.fixture()
def place(db):
    muni = Place(name="Girón", normalized_name="giron", kind="municipio", latitude=7.07, longitude=-73.17)
    db.add(muni)
    db.flush()
    owner = _make_user(db, "duenia.aviso@test.com", "owner")
    est = Establishment(name="Pollo Asado Prueba", slug="pollo-asado-prueba", municipality_id=muni.id,
                        latitude=7.07, longitude=-73.17, owner_id=owner.id)
    db.add(est)
    db.flush()
    return est


def _review(client, place, headers, **body):
    r = client.post(f"/api/establishments/{place.id}/reviews", json={"rating": 5, **body}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_published_review_emails_the_owner(client, place, user_headers, outbox):
    _review(client, place, user_headers, rating=4)                 # solo estrellas: se publica de una vez
    assert len(outbox) == 1
    mail = outbox[0]
    assert mail["to"] == "duenia.aviso@test.com"
    assert mail["subject"] == "Nueva reseña de 4 estrellas en Pollo Asado Prueba"
    assert f"/panel/lugar/{place.id}?tab=resenas" in mail["text"]
    assert "Prueba U." in mail["text"]                             # nombre corto del autor, no el completo


def test_pending_review_emails_only_when_admin_approves(client, place, user_headers, admin_headers, outbox):
    review = _review(client, place, user_headers, comment="Muy buen pollo y la atención es rápida")
    assert review["status"] == "pending" and outbox == []         # sin IA queda en revisión: aún no es pública
    assert client.post(f"/api/admin/reviews/{review['id']}/approve", headers=admin_headers).status_code == 200
    assert len(outbox) == 1 and "Muy buen pollo" in outbox[0]["text"]
    # Aprobarla otra vez no repite el correo
    client.post(f"/api/admin/reviews/{review['id']}/approve", headers=admin_headers)
    assert len(outbox) == 1


def test_editing_a_published_review_does_not_email_again(client, place, user_headers, outbox):
    review = _review(client, place, user_headers, rating=3)
    client.patch(f"/api/reviews/{review['id']}", json={"rating": 2}, headers=user_headers)
    assert len(outbox) == 1


def test_no_owner_or_unverified_owner_gets_no_email(client, db, place, user_headers, outbox):
    place.owner_id = None
    db.flush()
    _review(client, place, user_headers)
    assert outbox == []

    other = Establishment(name="Otro", slug="otro-prueba", municipality_id=place.municipality_id, latitude=7.07,
                          longitude=-73.17, owner_id=_make_user(db, "sin.confirmar@test.com", "owner",
                                                                 verified=False).id)
    db.add(other)
    db.flush()
    _review(client, other, user_headers)
    assert outbox == []


def test_review_email_escapes_user_text():
    subject, text, html = build_new_review_email("Ana <b>", "Bar <script>", "Juan P.", 1,
                                                 "<img src=x onerror=alert(1)> malo", "https://easysearch.co/x")
    assert "<script>" not in html and "<img" not in html and "&lt;img" in html
    assert subject == "Nueva reseña de 1 estrella en Bar <script>"   # el asunto es texto plano, no HTML
