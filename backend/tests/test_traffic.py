"""Aviso de trancón para quien piensa pedir a domicilio (TomTom simulado: nunca se llama al servicio real)."""
import pytest

from app.main import app
from app.models import Establishment, Place
from app.services import traffic
from app.services.places import haversine_km
from app.services.traffic import Route, TrafficError, get_traffic_provider, parse_tomtom, snap_to_grid
from tests.conftest import _make_user, _token

USER = (7.1050, -73.1100)      # ~2 km del local
LOCAL = (7.1193, -73.1227)


class FakeTraffic:
    name = "fake"

    def __init__(self, route=None, fail=False):
        self.result, self.fail, self.calls, self.destinations = route, fail, 0, []

    def route(self, origin, destination):
        self.calls += 1
        self.destinations.append(destination)
        if self.fail:
            raise TrafficError("caída simulada")
        return self.result


@pytest.fixture(autouse=True)
def _clean_state():
    traffic.reset_state()
    yield
    traffic.reset_state()


@pytest.fixture()
def place(db):
    bga = Place(name="Bucaramanga", normalized_name="bucaramanga", kind="municipio", latitude=7.1193,
                longitude=-73.1227)
    db.add(bga)
    db.flush()
    est = Establishment(name="Pizza Prueba", slug="pizza-prueba", municipality_id=bga.id,
                        latitude=LOCAL[0], longitude=LOCAL[1])
    db.add(est)
    db.flush()
    return est


def _use(provider):
    app.dependency_overrides[get_traffic_provider] = lambda: provider


def _post(client, est, coords=USER):
    return client.post(f"/api/establishments/{est.id}/traffic", json={"latitude": coords[0], "longitude": coords[1]})


# ------------------------------- Privacidad ----------------------------------------------

def test_location_is_snapped_to_200m_grid():
    snapped = snap_to_grid(*USER)
    assert haversine_km(*USER, *snapped) <= 0.15          # como máximo media diagonal de la celda
    assert snapped != USER                                # nunca la coordenada exacta
    # Dos casas a ~30 m dentro de la misma celda dan el mismo punto (en el borde caen en celdas vecinas)
    c_lat, c_lng = snapped
    assert snap_to_grid(c_lat + 0.0002, c_lng - 0.0001) == snap_to_grid(c_lat - 0.0001, c_lng + 0.0002) == snapped


def test_provider_only_receives_the_rounded_location(searcher, place):
    fake = FakeTraffic(Route(travel_seconds=1500, no_traffic_seconds=900))
    _use(fake)
    _post(searcher, place)
    assert fake.destinations == [snap_to_grid(*USER)]


# ------------------------------- Aviso ---------------------------------------------------

def test_jam_gives_range_and_streets(searcher, place):
    _use(FakeTraffic(Route(travel_seconds=1500, no_traffic_seconds=900, jammed_streets=["Carrera 27"])))
    body = _post(searcher, place).json()
    assert body["available"] is True
    assert body["report"] == {"delay_min": 10, "delay_max": 15, "streets": ["Carrera 27"]}


def test_small_delay_gives_no_notice(searcher, place):
    _use(FakeTraffic(Route(travel_seconds=780, no_traffic_seconds=600)))   # 3 minutos: no vale la pena
    assert _post(searcher, place).json()["report"] is None


def test_without_key_or_on_failure_there_is_no_notice(searcher, place):
    _use(None)
    assert _post(searcher, place).json() == {"available": False, "report": None}
    _use(FakeTraffic(fail=True))
    r = _post(searcher, place)
    assert r.status_code == 200 and r.json()["report"] is None


def test_same_zone_reuses_cached_result(searcher, place):
    fake = FakeTraffic(Route(travel_seconds=1500, no_traffic_seconds=900))
    _use(fake)
    _post(searcher, place)
    _post(searcher, place, (USER[0] + 0.0001, USER[1]))   # vecino a ~11 m
    assert fake.calls == 1


def test_too_close_or_too_far_is_not_queried(searcher, place):
    fake = FakeTraffic(Route(travel_seconds=1500, no_traffic_seconds=900))
    _use(fake)
    _post(searcher, place, LOCAL)                 # en el mismo local
    _post(searcher, place, (4.7110, -74.0721))    # Bogotá
    assert fake.calls == 0


def test_daily_budget_stops_queries(searcher, place, monkeypatch):
    monkeypatch.setattr(traffic.get_settings(), "tomtom_daily_limit", 1)
    fake = FakeTraffic(Route(travel_seconds=1500, no_traffic_seconds=900))
    _use(fake)
    _post(searcher, place)
    _post(searcher, place, (7.0900, -73.1000))    # otra zona: necesitaría otra consulta
    assert fake.calls == 1


def test_requires_verified_account(client, db, place):
    assert _post(client, place).status_code == 401
    _make_user(db, "sin-confirmar@test.com", "user", verified=False)
    client.headers["Authorization"] = f"Bearer {_token(client, 'sin-confirmar@test.com')}"
    assert _post(client, place).status_code == 403


def test_unknown_establishment_is_404(searcher):
    assert searcher.post("/api/establishments/999999/traffic", json={"latitude": 7.1, "longitude": -73.1}).status_code == 404


# ------------------------------- Respuesta de TomTom -------------------------------------

def test_parse_tomtom_response():
    data = {"routes": [{
        "summary": {"travelTimeInSeconds": 1500, "noTrafficTravelTimeInSeconds": 900, "trafficDelayInSeconds": 540},
        "guidance": {"instructions": [
            {"pointIndex": 0, "street": "Calle 45"},
            {"pointIndex": 10, "street": "Carrera 27"},
            {"pointIndex": 40, "street": "Autopista Floridablanca"},
        ]},
        "sections": [
            {"sectionType": "TRAVEL_MODE", "startPointIndex": 0},
            {"sectionType": "TRAFFIC", "simpleCategory": "JAM", "startPointIndex": 15, "delayInSeconds": 400},
            {"sectionType": "TRAFFIC", "simpleCategory": "JAM", "startPointIndex": 45, "delayInSeconds": 120},
            {"sectionType": "TRAFFIC", "simpleCategory": "JAM", "startPointIndex": 20, "delayInSeconds": 60},
        ],
    }]}
    route = parse_tomtom(data)
    assert (route.travel_seconds, route.no_traffic_seconds) == (1500, 900)
    assert route.jammed_streets == ["Carrera 27", "Autopista Floridablanca"]   # de mayor a menor demora, sin repetir
