"""Horarios de atención: interpretación del formato de OpenStreetMap y cálculo de "abierto ahora".

Convenciones:
- day_of_week: 0 = lunes … 6 = domingo.
- Si closes_at <= opens_at, la franja termina al día siguiente (ej. 18:00–02:00, o 00:00–00:00 = 24 horas).
- Nunca se afirma "abierto" sin datos: si no hay horario registrado el estado es "unknown".
"""
import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

DAY_CODES = {"mo": 0, "tu": 1, "we": 2, "th": 3, "fr": 4, "sa": 5, "su": 6}
DAY_NAMES_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]

_TIME_RANGE = re.compile(r"^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$")
_DAY_TOKEN = re.compile(r"^(mo|tu|we|th|fr|sa|su|ph)(\s*-\s*(mo|tu|we|th|fr|sa|su))?$", re.IGNORECASE)


@dataclass(frozen=True)
class Slot:
    day_of_week: int
    opens_at: time
    closes_at: time


# --------------------------------------------------------------------------------------
# Interpretación del formato opening_hours de OpenStreetMap
# --------------------------------------------------------------------------------------

def _parse_time(h: str, m: str) -> time:
    hour, minute = int(h), int(m)
    if hour == 24 and minute == 0:
        return time(0, 0)  # 24:00 = medianoche
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValueError("hora inválida")
    return time(hour, minute)


def _parse_days(selector: str) -> list[int] | None:
    """'Mo-Fr' -> [0..4]; 'Mo,We-Th' -> [0,2,3]; 'Su,PH' -> [6]. None si no es un selector de días."""
    days: list[int] = []
    for token in selector.split(","):
        token = token.strip()
        match = _DAY_TOKEN.match(token)
        if not match:
            return None
        start = match.group(1).lower()
        if start == "ph":
            continue  # festivos: no hay calendario por establecimiento en OSM; se ignoran
        end = (match.group(3) or start).lower()
        a, b = DAY_CODES[start], DAY_CODES[end]
        days.extend(range(a, b + 1) if a <= b else [*range(a, 7), *range(0, b + 1)])
    return days


def _parse_times(text: str) -> list[tuple[time, time]] | None:
    """'08:00-12:00, 14:00-18:00' -> [(8:00, 12:00), (14:00, 18:00)]; 'off' -> []."""
    text = text.strip().lower()
    if text in {"off", "closed"}:
        return []
    ranges = []
    for part in text.split(","):
        match = _TIME_RANGE.match(part.strip())
        if not match:
            return None
        try:
            ranges.append((_parse_time(match[1], match[2]), _parse_time(match[3], match[4])))
        except ValueError:
            return None
    return ranges


def _split_rule(rule: str) -> tuple[str | None, str]:
    """Separa 'Mo-Fr 08:00-18:00' en ('Mo-Fr', '08:00-18:00'). Sin días -> (None, texto)."""
    match = re.match(r"^((?:(?:mo|tu|we|th|fr|sa|su|ph)(?:\s*-\s*(?:mo|tu|we|th|fr|sa|su))?\s*,?\s*)+)\s+(.+)$",
                     rule.strip(), re.IGNORECASE)
    if match:
        return match.group(1).strip().rstrip(","), match.group(2)
    return None, rule.strip()


def parse_osm_opening_hours(value: str | None) -> list[Slot] | None:
    """Convierte el texto de OSM en franjas semanales.

    Devuelve None si el formato no se puede interpretar con seguridad (ej. 'sunrise-sunset');
    en ese caso el establecimiento queda "sin información" en lugar de mostrar un horario dudoso.
    """
    if not value or not value.strip():
        return None
    value = value.strip()
    if value == "24/7":
        return [Slot(d, time(0, 0), time(0, 0)) for d in range(7)]

    schedule: dict[int, list[tuple[time, time]]] = {}
    for rule in value.split(";"):
        rule = rule.strip()
        if not rule:
            continue
        # Reglas "aditivas" separadas por coma: 'Mo-Sa 08:00-12:00, Mo-Fr 14:00-18:00'
        # (solo cuando la coma viene después de una hora u "off"; 'Mo,We-Sa' es una lista de días)
        pieces = re.split(r"(?:(?<=\d)|(?<=off)),\s*(?=(?:mo|tu|we|th|fr|sa|su|ph)\b)", rule, flags=re.IGNORECASE)
        overridden: set[int] = set()
        for piece in pieces:
            selector, times_text = _split_rule(piece)
            days = list(range(7)) if selector is None else _parse_days(selector)
            times = _parse_times(times_text)
            if days is None or times is None:
                return None
            for d in days:
                # Una regla nueva (separada por ;) reemplaza lo anterior para esos días
                if d not in overridden:
                    schedule[d] = []
                    overridden.add(d)
                schedule[d].extend(times)

    slots = [Slot(d, o, c) for d, ranges in sorted(schedule.items()) for o, c in ranges]
    return slots


# --------------------------------------------------------------------------------------
# Estado "abierto ahora"
# --------------------------------------------------------------------------------------

@dataclass
class SpecialDay:
    date: date
    is_closed: bool
    opens_at: time | None = None
    closes_at: time | None = None


@dataclass
class HoursStatus:
    state: str                          # "open" | "closed" | "unknown"
    label: str                          # texto para mostrar al usuario
    closes_at: datetime | None = None   # si está abierto, cuándo cierra
    opens_at: datetime | None = None    # si está cerrado, cuándo abre (dentro de 7 días)
    verified: bool = False              # True si el horario fue confirmado por propietario/admin


def _intervals_for_day(day: date, weekly: list[Slot], specials: dict[date, list[SpecialDay]],
                       tz: ZoneInfo) -> list[tuple[datetime, datetime]]:
    """Intervalos concretos (inicio, fin) que comienzan en ese día."""
    if day in specials:
        source = [(s.opens_at, s.closes_at) for s in specials[day] if not s.is_closed and s.opens_at and s.closes_at]
    else:
        source = [(s.opens_at, s.closes_at) for s in weekly if s.day_of_week == day.weekday()]
    intervals = []
    for opens, closes in source:
        start = datetime.combine(day, opens, tzinfo=tz)
        end_day = day + timedelta(days=1) if closes <= opens else day
        intervals.append((start, datetime.combine(end_day, closes, tzinfo=tz)))
    return intervals


def _fmt(dt: datetime, now: datetime) -> str:
    hour = dt.strftime("%I:%M %p").lstrip("0").replace("AM", "a. m.").replace("PM", "p. m.")
    days = (dt.date() - now.date()).days
    if days == 0:
        return hour
    if days == 1:
        return f"mañana {hour}"
    return f"el {DAY_NAMES_ES[dt.weekday()]} {hour}"


def compute_status(weekly: list[Slot], specials: list[SpecialDay], timezone: str,
                   now: datetime | None = None, verified: bool = False) -> HoursStatus:
    """Calcula si un establecimiento está abierto en `now` (por defecto, la hora actual).

    La hora se evalúa SIEMPRE en la zona horaria del establecimiento.
    """
    if not weekly and not specials:
        return HoursStatus("unknown", "Horario no disponible")

    tz = ZoneInfo(timezone)
    now = (now or datetime.now(tz)).astimezone(tz)
    by_date: dict[date, list[SpecialDay]] = {}
    for s in specials:
        by_date.setdefault(s.date, []).append(s)

    # ¿Está dentro de algún intervalo que empezó ayer u hoy?
    today = now.date()
    for day in (today - timedelta(days=1), today):
        for start, end in _intervals_for_day(day, weekly, by_date, tz):
            if start <= now < end:
                full_day = end - start >= timedelta(hours=24)
                label = "Abierto 24 horas" if full_day else f"Abierto · cierra {_fmt(end, now)}"
                return HoursStatus("open", label, closes_at=end, verified=verified)

    # Cerrado: buscar la próxima apertura en los siguientes 7 días
    for offset in range(0, 8):
        day = today + timedelta(days=offset)
        upcoming = sorted(s for s, _ in _intervals_for_day(day, weekly, by_date, tz) if s > now)
        if upcoming:
            return HoursStatus("closed", f"Cerrado · abre {_fmt(upcoming[0], now)}",
                               opens_at=upcoming[0], verified=verified)
    return HoursStatus("closed", "Cerrado", verified=verified)
