"""Analítica de visitas (anónima) y dashboard del administrador."""
from datetime import datetime, timezone

from sqlalchemy import select, text

from app.models import Establishment, PageView, Place, SearchHistory, User
from app.api.routes.analytics import device_of, referrer_domain
from app.services.dashboard import SEARCH_TOKENS, cost_of, provider_of_model
from tests.conftest import _make_user

PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1"
DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"


def _place(db):
    muni = Place(name="Girón", normalized_name="giron", kind="municipio", latitude=7.07, longitude=-73.17)
    db.add(muni)
    db.flush()
    est = Establishment(name="Pollo Asado Prueba", slug="pollo-asado-prueba", municipality_id=muni.id,
                        latitude=7.07, longitude=-73.17, source="osm")
    db.add(est)
    db.flush()
    return est


def _view(client, path, ua=PHONE, **body):
    return client.post("/api/analytics/pageview", json={"path": path, **body}, headers={"User-Agent": ua})


# ------------------------------- Visitas ---------------------------------------------------

def test_pageviews_are_anonymous_and_skip_bots_admin_and_dnt(client, db):
    est = _place(db)
    assert _view(client, "/lugar/pollo-asado-prueba?x=1", referrer="https://www.google.com/search?q=pollo").status_code == 204
    assert _view(client, "/buscar?q=pizza", ua=DESKTOP, logged_in=True).status_code == 204
    _view(client, "/admin/solicitudes")                                        # el panel no se cuenta
    _view(client, "/", ua="Googlebot/2.1 (+http://www.google.com/bot.html)")   # robots tampoco
    client.post("/api/analytics/pageview", json={"path": "/"}, headers={"User-Agent": PHONE, "DNT": "1"})

    rows = db.scalars(select(PageView).order_by(PageView.id)).all()
    assert [(v.section, v.path, v.device) for v in rows] == [("lugar", "/lugar/:negocio", "mobile"),
                                                             ("buscar", "/buscar", "desktop")]
    assert rows[0].establishment_id == est.id and rows[0].referrer == "google.com" and not rows[0].is_logged_in
    assert rows[1].is_logged_in and len(rows[0].visitor_hash) == 32
    # Ni la IP ni el navegador quedan guardados
    assert "testclient" not in rows[0].visitor_hash and not hasattr(rows[0], "ip")


def test_visitor_code_is_the_same_during_the_day(client, db):
    _view(client, "/")
    _view(client, "/asistente")
    hashes = {v.visitor_hash for v in db.scalars(select(PageView))}
    assert len(hashes) == 1


def test_helpers():
    assert device_of(PHONE) == "mobile" and device_of(DESKTOP) == "desktop"
    assert device_of("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)") == "tablet"
    assert referrer_domain("https://www.instagram.com/p/x", "easysearch.co") == "instagram.com"
    assert referrer_domain("https://easysearch.co/buscar", "easysearch.co") is None
    assert provider_of_model("grok-4.7") == "xai" and provider_of_model("gpt-4.1-mini") == "openai"
    assert provider_of_model("gemini-2.5-flash") == "gemini"
    assert round(cost_of("xai", SEARCH_TOKENS), 5) == 0.00708 and cost_of("gemini", SEARCH_TOKENS) == 0


# ------------------------------- Dashboard -------------------------------------------------

def test_dashboard_requires_admin(client, user_headers):
    assert client.get("/api/admin/dashboard").status_code == 401
    assert client.get("/api/admin/dashboard", headers=user_headers).status_code == 403


def test_dashboard_numbers(client, db, admin_headers):
    est = _place(db)
    searcher = _make_user(db, "busca@test.com", "user")
    now = datetime.now(timezone.utc)
    db.add_all([
        SearchHistory(user_id=searcher.id, query_text="Pizza", results_count=3, location_label="Girón",
                      parsed_query={"parser": "xai", "category_slugs": ["restaurantes"]}, created_at=now),
        SearchHistory(user_id=searcher.id, query_text="pizza ", results_count=0,
                      parsed_query={"parser": "gemini", "category_slugs": []}, created_at=now),
        SearchHistory(user_id=None, query_text="montallantas", results_count=0, parsed_query={"parser": "reglas"},
                      created_at=now),
    ])
    db.flush()
    db.execute(text("INSERT INTO consultas_ia (usuario_id, pregunta, estado, umbral, duracion_ms) "
                    "VALUES (:u, '¿Dónde arreglan llantas?', 'RESPONDIDA', 0.82, 4000)"), {"u": searcher.id})
    db.execute(text("INSERT INTO respuestas_ia (consulta_id, respuesta, modelo) "
                    "SELECT id, 'En Girón…', 'grok-4.7' FROM consultas_ia"))
    db.flush()
    _view(client, "/lugar/pollo-asado-prueba")
    _view(client, "/", ua=DESKTOP)

    r = client.get("/api/admin/dashboard?days=7", headers=admin_headers)
    assert r.status_code == 200, r.text
    d = r.json()
    assert len(d["dates"]) == 7 and len(d["series"]["searches"]) == 7
    assert d["kpis"]["searches"]["value"] == 3 and d["kpis"]["pageviews"]["value"] == 2
    assert d["kpis"]["visitors"]["value"] == 2 and d["kpis"]["questions"]["value"] == 1
    assert d["series"]["searches"][-1] == 3
    assert d["search"]["zero_results"] == 2 and d["search"]["top_queries"][0] == {"query": "pizza", "count": 2}
    assert d["search"]["places"] == [{"place": "Girón", "count": 1}]
    usage = {u["provider"]: u["count"] for u in d["ai"]["usage"]}
    assert usage["xai"] == 2 and usage["gemini"] == 1 and usage["reglas"] == 1   # 1 búsqueda + 1 pregunta en Grok
    assert d["kpis"]["ai_cost"]["value"] > 0 and d["ai"]["assistant"]["avg_seconds"] == 4.0
    assert d["traffic"]["devices"] == {"mobile": 1, "desktop": 1, "tablet": 0}
    assert sum(sum(row) for row in d["traffic"]["heatmap"]) == 5          # 3 búsquedas + 2 visitas
    assert d["business"]["leads"][0]["slug"] == "pollo-asado-prueba" and d["business"]["leads"][0]["views"] == 1
    assert d["users"]["searched"] == 1 and d["users"]["active_7d"] == 1
    assert any(e["kind"] == "busqueda" for e in d["feed"])
    assert db.scalar(select(User.id).where(User.email == "busca@test.com"))
