"""Funciones de apoyo del catálogo que conectan los modelos con los servicios de horarios."""
from datetime import datetime

from sqlalchemy.orm import selectinload

from app.models import Establishment, OpeningHour
from app.services.hours import HoursStatus, Slot, SpecialDay, compute_status, parse_osm_opening_hours


def apply_opening_hours_text(est: Establishment, value: str | None) -> bool:
    """Reemplaza el horario semanal a partir de un texto en formato OSM.

    Devuelve False (sin tocar nada) si el texto no se puede interpretar.
    """
    slots = parse_osm_opening_hours(value)
    if slots is None:
        return False
    est.opening_hours = [
        OpeningHour(day_of_week=s.day_of_week, opens_at=s.opens_at, closes_at=s.closes_at) for s in slots
    ]
    return True


def hours_status(est: Establishment, now: datetime | None = None) -> HoursStatus:
    weekly = [Slot(h.day_of_week, h.opens_at, h.closes_at) for h in est.opening_hours]
    specials = [SpecialDay(s.date, s.is_closed, s.opens_at, s.closes_at) for s in est.special_hours]
    return compute_status(weekly, specials, est.timezone, now=now, verified=est.hours_verified_at is not None)


# Relaciones que se cargan junto con el establecimiento (evita cientos de consultas pequeñas)
LOAD_OPTIONS = (
    selectinload(Establishment.opening_hours),
    selectinload(Establishment.special_hours),
    selectinload(Establishment.photos),
    selectinload(Establishment.offerings),
)


def to_summary(est: Establishment, now: datetime | None = None) -> dict:
    """Datos resumidos de un establecimiento para listados y resultados de búsqueda."""
    status_ = hours_status(est, now)
    return {
        "id": est.id, "slug": est.slug, "name": est.name, "address": est.address,
        "neighborhood": est.neighborhood,
        "municipality": est.municipality.name if est.municipality else None,
        "latitude": est.latitude, "longitude": est.longitude,
        "categories": est.categories,
        "price_min": est.price_min, "price_max": est.price_max, "price_level": est.price_level,
        "rating_avg": est.rating_avg, "rating_count": est.rating_count, "is_verified": est.is_verified,
        "photo_url": est.photos[0].url if est.photos else None,
        "hours_status": status_.__dict__,
    }
