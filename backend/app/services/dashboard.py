"""Datos del dashboard del administrador: cómo va la aplicación (tráfico, uso, IA y costos, negocios, contenido).

Todo se agrupa por días de Bogotá. Cada cifra trae su valor del periodo anterior (mismo número de días) para
mostrar si subió o bajó. Los costos de IA son ESTIMADOS: tokens medidos por consulta × precio público del modelo.
"""
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import Date, and_, cast, distinct, extract, func, or_, select, text
from sqlalchemy.orm import Session

from app.models import (
    Category,
    Establishment,
    Favorite,
    OwnershipClaim,
    PageView,
    Review,
    SearchHistory,
    User,
    establishment_categories,
)

BOGOTA = ZoneInfo("America/Bogota")

# Tokens medidos (tokenizador o200k) y precios públicos por millón de tokens (entrada, salida) en USD
SEARCH_TOKENS = (940 + 1040, 90 + 430)      # interpretar la búsqueda + redactar las recomendaciones
ASSISTANT_TOKENS = (1200, 500)               # una pregunta al asistente con sus fichas
PRICES = {"xai": (2.0, 6.0), "openai": (0.40, 1.60), "gemini": (0.0, 0.0), "reglas": (0.0, 0.0)}
PROVIDER_LABEL = {"xai": "Grok", "openai": "OpenAI", "gemini": "Gemini", "reglas": "Sin IA (reglas)"}


def cost_of(provider: str, tokens: tuple[int, int]) -> float:
    price_in, price_out = PRICES.get(provider, (0.0, 0.0))
    return (tokens[0] * price_in + tokens[1] * price_out) / 1_000_000


def provider_of_model(model: str | None) -> str:
    m = (model or "").lower()
    if "grok" in m:
        return "xai"
    if "gpt" in m or m.startswith("o"):
        return "openai"
    if "gemini" in m:
        return "gemini"
    return "reglas"


def _day(col):
    return cast(func.timezone("America/Bogota", col), Date)


def _pct(part: int | float, total: int | float) -> float:
    return round(part * 100 / total, 1) if total else 0.0


class _Range:
    """Periodo de `days` días hasta hoy. `previous()` da el periodo anterior del mismo largo (para comparar)."""
    def __init__(self, days: int, shift: int = 0):
        self.days = days
        self.today = datetime.now(BOGOTA).date()
        self.first_day = self.today - timedelta(days=days - 1 + shift * days)
        self.start = datetime.combine(self.first_day, datetime.min.time(), BOGOTA)
        self.prev_start = self.start - timedelta(days=days)
        self.end = self.start + timedelta(days=days) if shift else None

    def previous(self) -> "_Range":
        return _Range(self.days, shift=1)

    def dates(self) -> list[date]:
        return [self.first_day + timedelta(days=i) for i in range(self.days)]


def _count(db: Session, col, *conds) -> int:
    return db.scalar(select(func.count(col)).where(*conds)) or 0


def _trend(db: Session, r: _Range, col, created, *conds, distinct_col=None) -> dict:
    """Valor del periodo y del periodo anterior (para el % de cambio)."""
    agg = func.count(distinct(distinct_col)) if distinct_col is not None else func.count(col)
    now = db.scalar(select(agg).where(created >= r.start, *conds)) or 0
    before = db.scalar(select(agg).where(created >= r.prev_start, created < r.start, *conds)) or 0
    return {"value": now, "previous": before}


def _daily(db: Session, r: _Range, created, *conds, value=None) -> list[int]:
    agg = value if value is not None else func.count()
    bounds = (created >= r.start,) + ((created < r.end,) if r.end else ())
    rows = dict(db.execute(select(_day(created).label("d"), agg).where(*bounds, *conds)
                           .group_by("d")).all())
    return [int(rows.get(d, 0)) for d in r.dates()]


def _assistant(db: Session, r: _Range) -> dict:
    """Asistente con IA: tablas de Spring Boot (consultas_ia, respuestas_ia, calificaciones)."""
    params = {"start": r.start, "prev": r.prev_start}
    states = dict(db.execute(text("SELECT estado, count(*) FROM consultas_ia WHERE creada_en >= :start "
                                  "GROUP BY estado"), params).all())
    previous = db.scalar(text("SELECT count(*) FROM consultas_ia WHERE creada_en >= :prev AND creada_en < :start"),
                         params) or 0
    by_model = db.execute(text(
        "SELECT r.modelo, count(*) FROM respuestas_ia r JOIN consultas_ia c ON c.id = r.consulta_id "
        "WHERE c.creada_en >= :start AND c.estado = 'RESPONDIDA' GROUP BY r.modelo"), params).all()
    avg_ms = db.scalar(text("SELECT avg(duracion_ms) FROM consultas_ia WHERE creada_en >= :start "
                            "AND estado = 'RESPONDIDA'"), params)
    rating = db.execute(text(
        "SELECT avg(k.puntuacion), count(*) FROM calificaciones k JOIN respuestas_ia r ON r.id = k.respuesta_id "
        "JOIN consultas_ia c ON c.id = r.consulta_id WHERE c.creada_en >= :start"), params).one()
    daily_sql = text("SELECT (creada_en AT TIME ZONE 'America/Bogota')::date AS d, count(*) FROM consultas_ia "
                     "WHERE creada_en >= :start AND creada_en < :end GROUP BY d")
    far = r.start + timedelta(days=100 * 365)
    daily_rows = dict(db.execute(daily_sql, {"start": r.start, "end": far}).all())
    p = r.previous()
    prev_rows = dict(db.execute(daily_sql, {"start": p.start, "end": p.end}).all())
    total = sum(states.values())
    return {
        "questions": {"value": total, "previous": previous},
        "states": {k.lower(): v for k, v in states.items()},
        "by_model": [{"model": m or "sin modelo", "provider": provider_of_model(m), "count": c} for m, c in by_model],
        "avg_seconds": round(float(avg_ms) / 1000, 1) if avg_ms else None,
        "rating_avg": round(float(rating[0]), 2) if rating[0] is not None else None,
        "ratings": rating[1],
        "daily": [int(daily_rows.get(d, 0)) for d in r.dates()],
        "daily_prev": [int(prev_rows.get(d, 0)) for d in p.dates()],
    }


def build_dashboard(db: Session, days: int) -> dict:
    r = _Range(days)
    prev = r.previous()
    active = Establishment.status == "active"
    in_range = SearchHistory.created_at >= r.start
    parser = SearchHistory.parsed_query["parser"].astext

    # ------------------------------- Tráfico web ------------------------------------------
    pv_daily = _daily(db, r, PageView.created_at)
    visitors_daily = _daily(db, r, PageView.created_at, value=func.count(distinct(PageView.visitor_hash)))
    visitors_prev = db.scalar(select(func.count(distinct(func.concat(_day(PageView.created_at), PageView.visitor_hash))))
                              .where(PageView.created_at >= r.prev_start, PageView.created_at < r.start)) or 0
    pv_range = PageView.created_at >= r.start
    devices = dict(db.execute(select(PageView.device, func.count()).where(pv_range).group_by(PageView.device)).all())
    referrers = db.execute(select(func.coalesce(PageView.referrer, "directo").label("ref"), func.count().label("c"))
                           .where(pv_range).group_by("ref").order_by(func.count().desc()).limit(6)).all()
    sections = db.execute(select(PageView.section, func.count().label("c")).where(pv_range)
                          .group_by(PageView.section).order_by(func.count().desc()).limit(8)).all()
    logged = _count(db, PageView.id, pv_range, PageView.is_logged_in.is_(True))

    # Horas pico: búsquedas + páginas vistas por día de la semana (0 = domingo) y hora, en hora de Bogotá
    heat = [[0] * 24 for _ in range(7)]
    for created in (PageView.created_at, SearchHistory.created_at):
        local = func.timezone("America/Bogota", created)
        rows = db.execute(select(extract("dow", local).label("w"), extract("hour", local).label("h"), func.count())
                          .where(created >= r.start).group_by("w", "h")).all()
        for w, h, c in rows:
            heat[int(w)][int(h)] += c

    # ------------------------------- Usuarios ---------------------------------------------
    total_users = _count(db, User.id)
    verified = _count(db, User.id, User.email_verified_at.is_not(None))
    searched = db.scalar(select(func.count(distinct(SearchHistory.user_id))).where(SearchHistory.user_id.is_not(None))) or 0
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    active_7d = db.scalar(select(func.count(distinct(SearchHistory.user_id)))
                          .where(SearchHistory.user_id.is_not(None), SearchHistory.created_at >= week_ago)) or 0
    # Volvieron: usuarios que buscaron en 2 o más días distintos del periodo
    per_user_days = (select(SearchHistory.user_id, func.count(distinct(_day(SearchHistory.created_at))).label("n"))
                     .where(in_range, SearchHistory.user_id.is_not(None)).group_by(SearchHistory.user_id).subquery())
    active_users = db.scalar(select(func.count()).select_from(per_user_days)) or 0
    returning = db.scalar(select(func.count()).select_from(per_user_days).where(per_user_days.c.n >= 2)) or 0

    # ------------------------------- Búsquedas --------------------------------------------
    searches = _trend(db, r, SearchHistory.id, SearchHistory.created_at)
    zero = _count(db, SearchHistory.id, in_range, SearchHistory.results_count == 0)
    query_col = func.lower(func.trim(SearchHistory.query_text))
    top_queries = [{"query": q, "count": c} for q, c in db.execute(
        select(query_col.label("q"), func.count().label("c")).where(in_range).group_by("q")
        .order_by(func.count().desc()).limit(24)).all()]
    zero_queries = [{"query": q, "count": c} for q, c in db.execute(
        select(query_col.label("q"), func.count().label("c")).where(in_range, SearchHistory.results_count == 0)
        .group_by("q").order_by(func.count().desc()).limit(8)).all()]
    places = [{"place": p, "count": c} for p, c in db.execute(
        select(SearchHistory.location_label, func.count().label("c"))
        .where(in_range, SearchHistory.location_label.is_not(None)).group_by(SearchHistory.location_label)
        .order_by(func.count().desc()).limit(6)).all()]
    # Demanda (búsquedas por categoría) frente a oferta (negocios activos de esa categoría)
    slug = func.jsonb_array_elements_text(SearchHistory.parsed_query["category_slugs"]).label("slug")
    demand_rows = db.execute(select(slug, func.count().label("c")).where(in_range).group_by("slug")
                             .order_by(func.count().desc()).limit(8)).all()
    supply = dict(db.execute(select(Category.slug, func.count(Establishment.id))
                             .join(establishment_categories, establishment_categories.c.category_id == Category.id)
                             .join(Establishment, and_(Establishment.id == establishment_categories.c.establishment_id,
                                                       active))
                             .where(Category.slug.in_([s for s, _ in demand_rows] or [""]))
                             .group_by(Category.slug)).all())
    names = dict(db.execute(select(Category.slug, Category.name)).all())
    demand = [{"slug": s, "name": names.get(s, s), "searches": c, "businesses": supply.get(s, 0)} for s, c in demand_rows]

    # ------------------------------- IA y costos ------------------------------------------
    providers = dict(db.execute(select(func.coalesce(parser, "reglas").label("p"), func.count())
                                .where(in_range).group_by("p")).all())
    assistant = _assistant(db, r)
    search_cost = sum(cost_of(p, SEARCH_TOKENS) * c for p, c in providers.items())
    assistant_cost = sum(cost_of(m["provider"], ASSISTANT_TOKENS) * m["count"] for m in assistant["by_model"])
    usage = {p: providers.get(p, 0) for p in PROVIDER_LABEL}
    for m in assistant["by_model"]:
        usage[m["provider"]] = usage.get(m["provider"], 0) + m["count"]
    total_cost = search_cost + assistant_cost

    # ------------------------------- Negocios ---------------------------------------------
    with_owner = _count(db, Establishment.id, active, Establishment.owner_id.is_not(None))
    complete = _count(db, Establishment.id, active, Establishment.opening_hours.any(),
                      Establishment.description.is_not(None),
                      or_(Establishment.price_min.is_not(None), Establishment.price_max.is_not(None),
                          Establishment.offerings.any()))
    claims = {f"{k}_{s}": c for k, s, c in db.execute(
        select(OwnershipClaim.kind, OwnershipClaim.status, func.count()).group_by(OwnershipClaim.kind,
                                                                                  OwnershipClaim.status)).all()}
    # Clientes potenciales: negocios SIN dueño que la gente más visita y guarda en favoritos
    views = (select(PageView.establishment_id.label("eid"), func.count().label("views"))
             .where(pv_range, PageView.establishment_id.is_not(None)).group_by(PageView.establishment_id).subquery())
    favs = (select(Favorite.establishment_id.label("eid"), func.count().label("favs"))
            .group_by(Favorite.establishment_id).subquery())
    leads = [{"id": i, "name": n, "slug": s, "views": v or 0, "favorites": f or 0} for i, n, s, v, f in db.execute(
        select(Establishment.id, Establishment.name, Establishment.slug, views.c.views, favs.c.favs)
        .outerjoin(views, views.c.eid == Establishment.id).outerjoin(favs, favs.c.eid == Establishment.id)
        .where(active, Establishment.owner_id.is_(None), or_(views.c.views.is_not(None), favs.c.favs.is_not(None)))
        .order_by((func.coalesce(views.c.views, 0) + 3 * func.coalesce(favs.c.favs, 0)).desc()).limit(8)).all()]

    # ------------------------------- Contenido --------------------------------------------
    reviews = dict(db.execute(select(Review.status, func.count()).group_by(Review.status)).all())
    rating_avg = db.scalar(select(func.avg(Review.rating)).where(Review.status == "approved"))

    # ------------------------------- Actividad reciente (cinta) ---------------------------
    feed = []
    for name, created in db.execute(select(User.full_name, User.created_at).order_by(User.created_at.desc()).limit(4)):
        feed.append({"at": created, "kind": "usuario", "text": f"Nuevo usuario: {(name or 'Alguien').split()[0]}"})
    for q, created, n in db.execute(select(SearchHistory.query_text, SearchHistory.created_at,
                                           SearchHistory.results_count)
                                    .order_by(SearchHistory.created_at.desc()).limit(8)):
        feed.append({"at": created, "kind": "busqueda", "text": f"«{q[:60]}» · {n} resultados"})
    for kind, data, est_id, created in db.execute(select(OwnershipClaim.kind, OwnershipClaim.proposed_data,
                                                         OwnershipClaim.establishment_id, OwnershipClaim.created_at)
                                                  .order_by(OwnershipClaim.created_at.desc()).limit(3)):
        name = (data or {}).get("name") or db.scalar(select(Establishment.name).where(Establishment.id == est_id))
        feed.append({"at": created, "kind": "solicitud",
                     "text": f"Solicitud: {'registrar' if kind == 'register' else 'administrar'} {name or 'un negocio'}"})
    for rating, created in db.execute(select(Review.rating, Review.created_at).order_by(Review.created_at.desc()).limit(3)):
        feed.append({"at": created, "kind": "resena", "text": f"Reseña nueva de {rating} estrellas"})
    feed.sort(key=lambda e: e["at"], reverse=True)

    return {
        "days": days,
        "dates": [d.isoformat() for d in r.dates()],
        "generated_at": datetime.now(timezone.utc),
        "kpis": {
            "pageviews": {"value": sum(pv_daily), "previous": _count(db, PageView.id, PageView.created_at >= r.prev_start,
                                                                       PageView.created_at < r.start)},
            "visitors": {"value": sum(visitors_daily), "previous": visitors_prev},
            "searches": searches,
            "new_users": _trend(db, r, User.id, User.created_at),
            "questions": assistant["questions"],
            "ai_cost": {"value": round(total_cost, 4), "monthly": round(total_cost / days * 30, 2)},
        },
        "series": {
            "pageviews": pv_daily, "visitors": visitors_daily,
            "searches": _daily(db, r, SearchHistory.created_at),
            "new_users": _daily(db, r, User.created_at),
            "questions": assistant["daily"],
        },
        # Mismo largo, periodo anterior: la gráfica de pulso lo dibuja como línea punteada para comparar
        "series_prev": {
            "pageviews": _daily(db, prev, PageView.created_at),
            "visitors": _daily(db, prev, PageView.created_at, value=func.count(distinct(PageView.visitor_hash))),
            "searches": _daily(db, prev, SearchHistory.created_at),
            "new_users": _daily(db, prev, User.created_at),
            "questions": assistant["daily_prev"],
        },
        "traffic": {
            "devices": {d: devices.get(d, 0) for d in ("mobile", "desktop", "tablet")},
            "referrers": [{"source": s, "count": c} for s, c in referrers],
            "sections": [{"section": s, "count": c} for s, c in sections],
            "logged_in_pct": _pct(logged, sum(pv_daily)),
            "heatmap": heat,
        },
        "users": {
            "total": total_users, "verified": verified, "searched": searched, "active_7d": active_7d,
            "owners": _count(db, User.id, User.role == "owner"),
            "active_in_range": active_users, "returning": returning, "returning_pct": _pct(returning, active_users),
        },
        "search": {
            "zero_results": zero, "zero_pct": _pct(zero, searches["value"]),
            "top_queries": top_queries, "zero_queries": zero_queries, "places": places, "demand": demand,
        },
        "ai": {
            "usage": [{"provider": p, "label": PROVIDER_LABEL.get(p, p), "count": c} for p, c in usage.items()],
            "search_cost": round(search_cost, 4), "assistant_cost": round(assistant_cost, 4),
            "cost_per_search": {p: round(cost_of(p, SEARCH_TOKENS), 5) for p in ("xai", "openai")},
            "assistant": {k: v for k, v in assistant.items() if k not in ("daily", "daily_prev", "questions")},
        },
        "business": {
            "active": _count(db, Establishment.id, active), "with_owner": with_owner,
            "verified": _count(db, Establishment.id, active, Establishment.is_verified.is_(True)),
            "complete": complete, "claims": claims, "leads": leads,
        },
        "content": {
            "reviews": {s: reviews.get(s, 0) for s in ("approved", "pending", "rejected")},
            "rating_avg": round(float(rating_avg), 2) if rating_avg is not None else None,
            "favorites": _count(db, Favorite.user_id),
        },
        "feed": feed[:14],
    }
