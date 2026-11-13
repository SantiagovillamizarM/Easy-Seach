"""Aviso de tráfico: "Hay trancón en la Carrera 27; si vas a pedir a domicilio, puede demorar X–Y minutos más".

Se calcula la ruta del LOCAL hacia el USUARIO (el camino de un domicilio) con el tráfico en vivo de TomTom
(capa gratuita: ~2.500 consultas al día) y se compara con el tiempo sin tráfico.

Privacidad:
- La ubicación se redondea a una cuadrícula de ~200 m ANTES de salir del servidor: TomTom conoce la zona,
  nunca la casa. Tampoco se guarda en la base de datos ni en los registros.
- Usuarios de la misma zona comparten el cálculo guardado unos minutos (y así rinde la cuota gratuita).

Sin clave de TomTom (o si TomTom falla) simplemente no hay aviso: la página funciona igual.
"""
import logging
import math
import threading
import time
from dataclasses import dataclass, field
from datetime import date
from functools import lru_cache
from typing import Protocol

import httpx

from app.core.config import get_settings
from app.services.places import haversine_km

logger = logging.getLogger("easysearch.traffic")

GRID_METERS = 200          # redondeo de la ubicación del usuario
MIN_DELAY_MINUTES = 5      # por debajo de esto no vale la pena avisar
MIN_KM, MAX_KM = 0.3, 30   # muy cerca no hay ruta que valga; muy lejos ya no es el área metropolitana
CACHE_SECONDS = 5 * 60     # el tráfico cambia, pero no cada minuto
CACHE_MAX_ENTRIES = 5000


@dataclass
class Route:
    """Lo que devuelve el proveedor: tiempos en segundos y las vías con trancón (de mayor a menor demora)."""
    travel_seconds: int
    no_traffic_seconds: int
    jammed_streets: list[str] = field(default_factory=list)


@dataclass
class TrafficReport:
    delay_min: int
    delay_max: int
    streets: list[str]


class TrafficProvider(Protocol):
    name: str

    def route(self, origin: tuple[float, float], destination: tuple[float, float]) -> Route: ...


class TrafficError(Exception):
    pass


# ------------------------------- Privacidad ----------------------------------------------

def snap_to_grid(lat: float, lng: float, meters: int = GRID_METERS) -> tuple[float, float]:
    """Lleva el punto al centro de su celda de `meters` × `meters`: el mismo resultado para toda la zona."""
    lat_step = meters / 111_320
    lat_snapped = round(lat / lat_step) * lat_step
    lng_step = meters / (111_320 * max(math.cos(math.radians(lat_snapped)), 0.01))
    return round(lat_snapped, 6), round(round(lng / lng_step) * lng_step, 6)


# ------------------------------- TomTom --------------------------------------------------

class TomTomTraffic:
    name = "tomtom"
    URL = "https://api.tomtom.com/routing/1/calculateRoute/{o_lat},{o_lng}:{d_lat},{d_lng}/json"

    def __init__(self, api_key: str, timeout: float = 8.0):
        self._key, self._timeout = api_key, timeout

    def route(self, origin, destination) -> Route:
        url = self.URL.format(o_lat=origin[0], o_lng=origin[1], d_lat=destination[0], d_lng=destination[1])
        params = {
            "key": self._key, "traffic": "true", "travelMode": "car", "routeType": "fastest",
            "computeTravelTimeFor": "all",       # incluye el tiempo sin tráfico para comparar
            "sectionType": "traffic",            # tramos con trancón
            "instructionsType": "text", "language": "es-ES",   # nombres de las vías
        }
        try:
            response = httpx.get(url, params=params, timeout=self._timeout)
            response.raise_for_status()
            data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            # Nunca se registra la URL: lleva la clave y las coordenadas
            raise TrafficError(exc.__class__.__name__) from None
        try:
            return parse_tomtom(data)
        except (KeyError, IndexError, TypeError) as exc:
            raise TrafficError("respuesta inesperada") from exc


def parse_tomtom(data: dict) -> Route:
    route = data["routes"][0]
    summary = route["summary"]
    travel = int(summary["travelTimeInSeconds"])
    free = int(summary.get("noTrafficTravelTimeInSeconds") or travel - int(summary.get("trafficDelayInSeconds", 0)))

    # Nombre de la vía de cada tramo con trancón: la última instrucción que empieza antes del tramo
    instructions = sorted((i for i in route.get("guidance", {}).get("instructions", []) if i.get("street")),
                          key=lambda i: i.get("pointIndex", 0))
    jams = sorted((s for s in route.get("sections", []) if s.get("sectionType") == "TRAFFIC"
                   and s.get("simpleCategory") in ("JAM", "ROAD_WORK", "ROAD_CLOSURE")),
                  key=lambda s: -int(s.get("delayInSeconds", 0)))
    streets: list[str] = []
    for jam in jams:
        start = jam.get("startPointIndex", 0)
        street = next((i["street"] for i in reversed(instructions) if i.get("pointIndex", 0) <= start), None)
        if street and street not in streets:
            streets.append(street)
    return Route(travel_seconds=travel, no_traffic_seconds=free, jammed_streets=streets[:2])


@lru_cache
def get_traffic_provider() -> TrafficProvider | None:
    key = get_settings().tomtom_api_key
    return TomTomTraffic(key) if key else None


# ------------------------------- Caché y cuota diaria ------------------------------------

class _Budget:
    """Cuenta las consultas del día para no pasarse de la capa gratuita (un solo proceso de uvicorn)."""

    def __init__(self):
        self._lock = threading.Lock()
        self._day, self._used = date.today(), 0

    def take(self, limit: int) -> bool:
        with self._lock:
            if self._day != date.today():
                self._day, self._used = date.today(), 0
            if self._used >= limit:
                return False
            self._used += 1
            return True


_budget = _Budget()
_cache: dict[tuple, tuple[float, TrafficReport | None]] = {}
_cache_lock = threading.Lock()


def reset_state() -> None:
    """Solo para pruebas."""
    global _budget
    _budget = _Budget()
    with _cache_lock:
        _cache.clear()


def _cached(key: tuple) -> tuple[bool, TrafficReport | None]:
    with _cache_lock:
        entry = _cache.get(key)
        if entry and entry[0] > time.monotonic():
            return True, entry[1]
    return False, None


def _store(key: tuple, report: TrafficReport | None) -> None:
    with _cache_lock:
        if len(_cache) >= CACHE_MAX_ENTRIES:
            now = time.monotonic()
            for k in [k for k, (exp, _) in _cache.items() if exp <= now] or list(_cache)[: CACHE_MAX_ENTRIES // 10]:
                _cache.pop(k, None)
        _cache[key] = (time.monotonic() + CACHE_SECONDS, report)


# ------------------------------- Cálculo del aviso ---------------------------------------

def delay_range(delay_seconds: int) -> tuple[int, int]:
    """Rango honesto: el tráfico cambia durante el trayecto, así que no se da un número exacto."""
    minutes = delay_seconds / 60
    low = max(1, math.floor(minutes))
    return low, max(low + 2, math.ceil(minutes * 1.5))


def traffic_report(establishment_id: int, origin: tuple[float, float], user: tuple[float, float],
                   provider: TrafficProvider | None) -> TrafficReport | None:
    """Aviso de trancón entre el local y el usuario, o None si no hay trancón (o no se puede saber)."""
    if provider is None:
        return None
    destination = snap_to_grid(*user)
    if not MIN_KM <= haversine_km(*origin, *destination) <= MAX_KM:
        return None

    key = (establishment_id, destination)
    hit, report = _cached(key)
    if hit:
        return report
    if not _budget.take(get_settings().tomtom_daily_limit):
        logger.warning("Cuota diaria de tráfico agotada: no se consultan más rutas hoy")
        return None
    try:
        route = provider.route(origin, destination)
    except TrafficError as exc:
        logger.warning("No se pudo consultar el tráfico: %s", exc)
        return None   # no se guarda en caché: el próximo intento puede funcionar

    delay = route.travel_seconds - route.no_traffic_seconds
    report = None
    if delay >= MIN_DELAY_MINUTES * 60:
        low, high = delay_range(delay)
        report = TrafficReport(delay_min=low, delay_max=high, streets=route.jammed_streets)
    _store(key, report)
    return report
