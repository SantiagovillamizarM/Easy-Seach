"""Fase 10: rutas internas que usan los flujos de n8n (embeddings y textos pendientes de indexar)."""
import pytest

from app.core.config import get_settings
from app.models import Establishment, Offering, Place
from app.services.embeddings import sync_establishments

KEY = {"X-Internal-Key": "clave-interna-solo-para-pruebas-0123456789"}


@pytest.fixture()
def negocio(db):
    muni = Place(name="Girón", normalized_name="giron", kind="municipio", latitude=7.07, longitude=-73.17)
    db.add(muni)
    db.flush()
    est = Establishment(name="Arepas Prueba", slug="arepas-prueba-interna", municipality_id=muni.id,
                        latitude=7.07, longitude=-73.17, source="manual", description="Arepas rellenas")
    est.offerings = [Offering(kind="product", name="Arepa de huevo", is_available=True)]
    db.add(est)
    db.flush()
    db.refresh(est)
    return est


def _pendientes_de(client, est_id, **params):
    r = client.get("/api/internal/indexacion/pendientes", headers=KEY, params=params)
    assert r.status_code == 200, r.text
    body = r.json()
    return body, [p for p in body["pendientes"] if p["establishment_id"] == est_id]


# ------------------------------------------------------------------ protección

def test_sin_clave_o_con_clave_incorrecta_responde_401(client):
    assert client.post("/api/internal/embeddings", json={"textos": ["hola"], "tipo": "consulta"}).status_code == 401
    r = client.get("/api/internal/indexacion/pendientes", headers={"X-Internal-Key": "otra-clave"})
    assert r.status_code == 401


def test_sin_clave_configurada_las_rutas_estan_desactivadas(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "internal_api_key", None)
    r = client.post("/api/internal/embeddings", headers=KEY, json={"textos": ["hola"], "tipo": "consulta"})
    assert r.status_code == 503


def test_no_aparecen_en_la_documentacion_publica(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert not [p for p in paths if p.startswith("/api/internal")]


# ------------------------------------------------------------------ embeddings

def test_genera_vectores_de_documentos_y_consultas(client, fake_embedder):
    r = client.post("/api/internal/embeddings", headers=KEY,
                    json={"textos": ["Arepas rellenas", "Pizza artesanal"], "tipo": "documento"})
    assert r.status_code == 200
    body = r.json()
    assert body["modelo"] == "fake-embedder"
    assert body["dimensiones"] == 384
    assert len(body["vectores"]) == 2 and len(body["vectores"][0]) == 384
    assert fake_embedder.calls == ["Arepas rellenas", "Pizza artesanal"]

    r = client.post("/api/internal/embeddings", headers=KEY, json={"textos": ["¿dónde hay arepas?"], "tipo": "consulta"})
    assert r.status_code == 200 and len(r.json()["vectores"]) == 1


@pytest.mark.parametrize("cuerpo", [
    {"textos": [], "tipo": "documento"},
    {"textos": ["x"] * 65, "tipo": "documento"},
    {"textos": ["   "], "tipo": "consulta"},
    {"textos": ["x" * 4001], "tipo": "consulta"},
    {"textos": ["hola"], "tipo": "otro"},
])
def test_rechaza_textos_invalidos(client, cuerpo):
    assert client.post("/api/internal/embeddings", headers=KEY, json=cuerpo).status_code == 422


# ------------------------------------------------------------------ pendientes de indexar

def test_lista_lo_que_no_tiene_vector_y_no_repite_lo_ya_indexado(client, db, negocio, fake_embedder):
    _, propios = _pendientes_de(client, negocio.id)
    assert {p["entity_type"] for p in propios} == {"establishment", "offering"}
    texto = next(p["texto"] for p in propios if p["entity_type"] == "establishment")
    assert "Arepas Prueba" in texto and "Arepa de huevo" in texto

    sync_establishments(db, [negocio], fake_embedder)   # ya indexado: no debe volver a aparecer
    _, propios = _pendientes_de(client, negocio.id)
    assert propios == []


def test_un_texto_modificado_vuelve_a_quedar_pendiente_con_otro_hash(client, db, negocio, fake_embedder):
    sync_establishments(db, [negocio], fake_embedder)
    negocio.description = "Arepas rellenas y jugos naturales"
    db.flush()

    _, propios = _pendientes_de(client, negocio.id)
    assert [p["entity_type"] for p in propios] == ["establishment"]
    assert "jugos naturales" in propios[0]["texto"]


def test_productos_no_disponibles_quedan_como_obsoletos(client, db, negocio, fake_embedder):
    sync_establishments(db, [negocio], fake_embedder)
    negocio.offerings[0].is_available = False
    db.flush()

    body, _ = _pendientes_de(client, negocio.id)
    from app.models import Embedding
    vector_producto = db.query(Embedding).filter_by(entity_type="offering", entity_id=negocio.offerings[0].id).one()
    assert vector_producto.id in body["obsoletos"]


def test_respeta_el_limite_e_informa_si_hay_mas(client, negocio):
    body, _ = _pendientes_de(client, negocio.id, limite=1)
    assert len(body["pendientes"]) == 1
    assert body["hay_mas"] is True


# ------------------------------------------------------------------ asistente RAG

def test_fichas_solo_de_negocios_activos_y_en_el_orden_pedido(client, db, negocio):
    from decimal import Decimal
    oculto = Establishment(name="Negocio Oculto", slug="negocio-oculto-interno", municipality_id=negocio.municipality_id,
                           latitude=7.07, longitude=-73.17, source="manual", status="hidden")
    db.add(oculto)
    negocio.price_min, negocio.price_max = Decimal("5000"), Decimal("12000")
    db.flush()

    r = client.post("/api/internal/asistente/fichas", headers=KEY, json={"ids": [oculto.id, negocio.id, 999999]})
    assert r.status_code == 200
    fichas = r.json()["fichas"]
    assert [f["id"] for f in fichas] == [negocio.id]          # el oculto y el inexistente no son fuentes
    assert fichas[0]["nombre"] == "Arepas Prueba"
    assert fichas[0]["rango_precios"] == "$5.000 - $12.000"
    assert "Arepa de huevo" in fichas[0]["productos_servicios"]


def test_validar_borra_precios_inventados_y_conserva_los_reales(client, db, negocio):
    from decimal import Decimal
    negocio.price_min, negocio.price_max = Decimal("5000"), Decimal("12000")
    db.flush()
    r = client.post("/api/internal/asistente/validar", headers=KEY, json={
        "respuesta": "Arepas Prueba vende arepas rellenas. Sus precios van de $5.000 a $12.000. El combo cuesta $3.500.",
        "pasos": ["Pide la arepa de huevo.", "Lleva $50.000 para el combo familiar."],
        "ids": [negocio.id],
    })
    assert r.status_code == 200
    body = r.json()
    assert "$5.000" in body["respuesta"] and "$3.500" not in body["respuesta"]
    assert body["pasos"] == ["Pide la arepa de huevo."]
    assert body["frases_eliminadas"] is True


def test_rutas_del_asistente_exigen_clave(client, negocio):
    assert client.post("/api/internal/asistente/fichas", json={"ids": [negocio.id]}).status_code == 401
    assert client.post("/api/internal/asistente/validar",
                       json={"respuesta": "x", "ids": [negocio.id]}).status_code == 401
