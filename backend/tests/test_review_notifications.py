"""Aviso por correo al propietario cuando se publica una reseña de su negocio."""
import pytest

from app.models import Establishment, Place
from app.services import notifications
from app.services.email_templates import build_new_review_email, build_owner_reply_email
from tests.conftest import _make_user, _token


@pytest.fixture()
def outbox(monkeypatch):
    sent = []
    monkeypatch.setattr(notifications.email_service, "send_email",
                        lambda to, subject, text, html=None, headers=None: sent.append(
                            {"to": to, "subject": subject, "text": text, "html": html, "headers": headers or {}}))
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


# ------------------------------- Aviso al cliente: el negocio respondió -------------------

def _owner_headers(client):
    return {"Authorization": f"Bearer {_token(client, 'duenia.aviso@test.com')}"}


def test_first_reply_emails_the_reviewer_once(client, place, user_headers, outbox):
    review = _review(client, place, user_headers, rating=4)
    outbox.clear()                                                  # el aviso al dueño no interesa aquí
    owner = _owner_headers(client)
    client.put(f"/api/reviews/{review['id']}/reply", json={"text": "¡Gracias por visitarnos!"}, headers=owner)
    assert len(outbox) == 1
    mail = outbox[0]
    assert mail["to"] == "usuario@test.com"
    assert mail["subject"] == "Pollo Asado Prueba respondió tu reseña"
    assert "¡Gracias por visitarnos!" in mail["text"] and "/lugar/pollo-asado-prueba" in mail["text"]
    # Editar la respuesta no vuelve a escribirle
    client.put(f"/api/reviews/{review['id']}/reply", json={"text": "Gracias, te esperamos"}, headers=owner)
    assert len(outbox) == 1


def test_reply_email_escapes_user_text():
    subject, text, html = build_owner_reply_email("Ana", "Bar <b>", 3, "<img src=x>", "<script>x</script>", "http://a")
    assert "<script>" not in html and "<img" not in html and "&lt;script&gt;" in html


# ------------------------------- Preferencias y bajas -------------------------------------

def test_each_notice_has_a_working_unsubscribe_link(client, db, place, user_headers, outbox):
    from app.models import User
    _review(client, place, user_headers, rating=5)
    mail = outbox[0]
    link = mail["headers"]["List-Unsubscribe"].strip("<>")
    assert "/correos/baja?t=" in link and link in mail["text"] and "Dejar de recibir estos avisos" in mail["html"]

    token = link.split("t=")[1]
    r = client.post("/api/auth/unsubscribe", json={"token": token})        # sin iniciar sesión
    assert r.status_code == 200 and r.json()["kind"] == "resenas"
    owner = db.query(User).filter(User.email == "duenia.aviso@test.com").one()
    db.refresh(owner)
    assert owner.notify_new_reviews is False and owner.notify_review_replies is True

    # Ya no le llegan avisos de reseñas nuevas
    _make_user(db, "otro.cliente@test.com", "user")
    other = {"Authorization": f"Bearer {_token(client, 'otro.cliente@test.com')}"}
    _review(client, place, other, rating=3)
    assert len(outbox) == 1


def test_forged_or_altered_unsubscribe_link_is_rejected(client, db, place):
    from app.services.unsubscribe import make_token
    good = make_token(place.owner_id, "resenas")
    for bad in [good[:-1] + ("0" if good[-1] != "0" else "1"),       # firma alterada
                good.replace(f"{place.owner_id}.", f"{place.owner_id + 1}.", 1),   # otro usuario
                "123.resenas.abc", "basura-sin-formato"]:
        assert client.post("/api/auth/unsubscribe", json={"token": bad}).status_code in (400, 422), bad


def test_profile_toggles_notifications(client, user_headers, place, outbox, db):
    r = client.patch("/api/auth/me/notifications", json={"notify_review_replies": False}, headers=user_headers)
    assert r.status_code == 200
    assert r.json()["notify_review_replies"] is False and r.json()["notify_new_reviews"] is True
    review = _review(client, place, user_headers, rating=4)
    outbox.clear()
    client.put(f"/api/reviews/{review['id']}/reply", json={"text": "Gracias"}, headers=_owner_headers(client))
    assert outbox == []                                                     # el cliente apagó este aviso
    assert client.patch("/api/auth/me/notifications", json={"notify_review_replies": True}).status_code == 401


def test_deleting_and_replying_again_does_not_email_again(client, place, user_headers, outbox):
    """Borrar la respuesta y volver a responder no puede usarse para llenar de correos a un cliente."""
    review = _review(client, place, user_headers, rating=2)
    outbox.clear()
    owner = _owner_headers(client)
    url = f"/api/reviews/{review['id']}/reply"
    client.put(url, json={"text": "Lo sentimos, vamos a mejorar"}, headers=owner)
    client.delete(url, headers=owner)
    client.put(url, json={"text": "Lo sentimos mucho"}, headers=owner)
    assert len(outbox) == 1
    item = client.get(f"/api/establishments/{place.id}/reviews").json()["items"][0]
    assert item["owner_reply"] == "Lo sentimos mucho"
    client.delete(url, headers=owner)
    item = client.get(f"/api/establishments/{place.id}/reviews").json()["items"][0]
    assert item["owner_reply"] is None and item["owner_reply_at"] is None   # sin respuesta: sin fecha visible
