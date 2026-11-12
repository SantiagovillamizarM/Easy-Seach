"""Fase 2: interpretación de horarios OSM y cálculo de abierto/cerrado."""
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from app.services.hours import Slot, SpecialDay, compute_status, parse_osm_opening_hours

BOGOTA = ZoneInfo("America/Bogota")


def at(y, m, d, hh, mm=0, tz=BOGOTA):
    return datetime(y, m, d, hh, mm, tzinfo=tz)


# 2026-11-16 es lunes, 2026-11-21 sábado, 2026-11-22 domingo
MON, SAT, SUN = (2026, 11, 16), (2026, 11, 21), (2026, 11, 22)


# ---------------------------- Interpretación -------------------------------------------

def test_parse_simple_range():
    slots = parse_osm_opening_hours("Mo-Fr 08:00-18:00")
    assert len(slots) == 5
    assert slots[0] == Slot(0, time(8), time(18))


def test_parse_without_days_means_every_day():
    assert len(parse_osm_opening_hours("11:00-22:50")) == 7


def test_parse_24_7():
    slots = parse_osm_opening_hours("24/7")
    assert len(slots) == 7 and slots[0].opens_at == slots[0].closes_at == time(0)


def test_parse_split_hours_and_lists():
    slots = parse_osm_opening_hours("Mo,We-Sa 12:00-14:30,18:00-23:00; Tu 17:30-23:00; Su off")
    monday = [s for s in slots if s.day_of_week == 0]
    assert [(s.opens_at, s.closes_at) for s in monday] == [(time(12), time(14, 30)), (time(18), time(23))]
    assert not [s for s in slots if s.day_of_week == 6]   # domingo cerrado
    assert len([s for s in slots if s.day_of_week == 1]) == 1


def test_parse_later_rule_overrides_day():
    slots = parse_osm_opening_hours("Sa, Su 11:00-23:00; Su 18:00-23:00")
    sunday = [s for s in slots if s.day_of_week == 6]
    assert [(s.opens_at, s.closes_at) for s in sunday] == [(time(18), time(23))]


def test_parse_additive_comma_rule():
    slots = parse_osm_opening_hours("Mo-Sa 08:00-12:00, Mo-Fr 14:00-18:00")
    assert len([s for s in slots if s.day_of_week == 0]) == 2   # lunes: mañana y tarde
    assert len([s for s in slots if s.day_of_week == 5]) == 1   # sábado: solo mañana


def test_parse_holidays_ignored_but_day_kept():
    slots = parse_osm_opening_hours("Mo-Fr 10:00-19:00; Su,PH 08:30-12:30")
    assert any(s.day_of_week == 6 for s in slots)


def test_parse_24_00_and_unparseable():
    assert parse_osm_opening_hours("Mo-Su 08:00-24:00")[0].closes_at == time(0)
    assert parse_osm_opening_hours("sunrise-sunset") is None
    assert parse_osm_opening_hours("") is None
    assert parse_osm_opening_hours("Mo-Fr 25:00-26:00") is None


# ---------------------------- Abierto / cerrado ----------------------------------------

def test_no_hours_is_unknown():
    assert compute_status([], [], "America/Bogota").state == "unknown"


def test_open_and_closed_simple():
    weekly = parse_osm_opening_hours("Mo-Fr 08:00-18:00")
    assert compute_status(weekly, [], "America/Bogota", at(*MON, 10)).state == "open"
    closed = compute_status(weekly, [], "America/Bogota", at(*MON, 19))
    assert closed.state == "closed"
    assert closed.opens_at == at(2026, 11, 17, 8)


def test_split_hours_closed_at_lunch():
    weekly = parse_osm_opening_hours("Mo-Fr 08:00-12:00, 14:00-18:00")
    status = compute_status(weekly, [], "America/Bogota", at(*MON, 13))
    assert status.state == "closed"
    assert status.opens_at == at(*MON, 14)


def test_overnight_slot_open_after_midnight():
    # Sábado 18:00 a domingo 02:00
    weekly = parse_osm_opening_hours("Sa 18:00-02:00")
    assert compute_status(weekly, [], "America/Bogota", at(*SUN, 1, 30)).state == "open"
    assert compute_status(weekly, [], "America/Bogota", at(*SUN, 2, 30)).state == "closed"


def test_24_hours():
    status = compute_status(parse_osm_opening_hours("24/7"), [], "America/Bogota", at(*MON, 3))
    assert status.state == "open" and status.label == "Abierto 24 horas"


def test_special_day_closed_overrides_weekly():
    weekly = parse_osm_opening_hours("Mo-Su 08:00-20:00")
    holiday = [SpecialDay(date(*MON), is_closed=True)]
    assert compute_status(weekly, holiday, "America/Bogota", at(*MON, 10)).state == "closed"


def test_special_day_different_hours():
    weekly = parse_osm_opening_hours("Mo-Su 08:00-20:00")
    special = [SpecialDay(date(*MON), is_closed=False, opens_at=time(10), closes_at=time(14))]
    assert compute_status(weekly, special, "America/Bogota", at(*MON, 9)).state == "closed"
    assert compute_status(weekly, special, "America/Bogota", at(*MON, 11)).state == "open"


def test_timezone_of_establishment_is_used():
    # 13:00 UTC = 08:00 en Bogotá -> abierto, aunque el servidor esté en otra zona
    weekly = parse_osm_opening_hours("Mo-Fr 08:00-18:00")
    now_utc = datetime(2026, 11, 16, 13, 30, tzinfo=ZoneInfo("UTC"))
    assert compute_status(weekly, [], "America/Bogota", now_utc).state == "open"
