"""Funciones de apoyo del catálogo que conectan los modelos con los servicios de horarios."""
from datetime import datetime

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
