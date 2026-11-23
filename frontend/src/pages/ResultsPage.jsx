import {
  AlertTriangle,
  Info,
  List,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Map as MapIcon,
  SearchX,
  SlidersHorizontal,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import FiltersPanel, { FILTER_KEYS } from "../components/FiltersPanel.jsx";
import InterpretationBar from "../components/InterpretationBar.jsx";
import ResultCard, { ResultCardSkeleton } from "../components/ResultCard.jsx";
import { useUserLocation } from "../context/LocationContext.jsx";
import { api } from "../lib/api.js";
import "./results-dashboard.css";

const ResultsMap = lazy(() => import("../components/ResultsMap.jsx"));
const EMPTY_RESULTS = [];
const RECOMMENDED_COUNT = 6; // la IA explica los primeros resultados

function buildPayload(params, coords) {
  const num = (k) => (params.get(k) ? Number(params.get(k)) : undefined);
  const payload = {
    q: params.get("q") ?? "",
    place_id: num("place_id"),
    radius_km: num("radius_km"),
    budget_min: num("budget_min"),
    budget_max: num("budget_max"),
    min_rating: num("min_rating"),
    category: params.get("category") || undefined,
    open_now: params.get("open_now") === "true" ? true : params.get("open_now") === "false" ? false : undefined,
    limit: 15,
  };
  if (coords) {
    payload.latitude = coords.latitude;
    payload.longitude = coords.longitude;
  }
  return payload;
}

// Invitado sin cuenta: cuántas búsquedas de prueba le quedan
function GuestBanner({ remaining, next }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 sm:flex-row sm:items-center">
      <UserPlus className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
      <p className="flex-1 text-sm">
        {remaining > 0 ? (
          <>
            Estás probando Easy Search sin cuenta: te {remaining === 1 ? "queda" : "quedan"}{" "}
            <strong>{remaining} {remaining === 1 ? "búsqueda" : "búsquedas"} de prueba</strong>.
          </>
        ) : (
          <strong>Esta fue tu última búsqueda de prueba.</strong>
        )}{" "}
        Con una cuenta gratis buscas sin límites, guardas favoritos y ves tu historial.
      </p>
      <Link to={`/registro?next=${encodeURIComponent(next)}`} className="btn-primary shrink-0 px-3 py-2 text-sm">
        Crear cuenta gratis
      </Link>
    </div>
  );
}

// Invitado que ya usó sus búsquedas de prueba
function GuestLimitCard({ message, next }) {
  const nextParam = encodeURIComponent(next);
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50">
        <UserPlus className="h-6 w-6 text-brand-600" aria-hidden="true" />
      </span>
      <p className="text-lg font-bold">Se acabaron tus búsquedas de prueba</p>
      <p className="max-w-md text-sm text-ink-soft">{message}</p>
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        <Link to={`/registro?next=${nextParam}`} className="btn-primary">Crear cuenta gratis</Link>
        <Link to={`/ingresar?next=${nextParam}`} className="btn-ghost">Ya tengo cuenta</Link>
      </div>
    </div>
  );
}

function MapFallback() {
  return <div className="skeleton h-full w-full rounded-2xl" />;
}

function FilterDrawer({ children, onClose, triggerRef }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = triggerRef.current;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) onClose();
    };
    dialog.showModal();
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      dialog.close();
      if (!desktop.matches) trigger?.focus();
    };
  }, [onClose, triggerRef]);
  return (
    <dialog
      ref={ref}
      aria-label="Filtros"
      className="filter-drawer lg:hidden"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="filter-surface flex h-full flex-col">{children}</div>
    </dialog>
  );
}

export default function ResultsPage() {
  const [params, setParams] = useSearchParams();
  const { coords, request, status: locationStatus, showHint, dismissHint } = useUserLocation();
  const locating = locationStatus === "auto"; // obteniendo la ubicación guardada al abrir la app
  const [data, setData] = useState(null);
  const [displayedParams, setDisplayedParams] = useState(null);
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const here = location.pathname + location.search;
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [mobileView, setMobileView] = useState("list"); // list | map
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersTrigger = useRef(null);
  const mapHeading = useRef(null);
  const focusMap = useRef(false);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  const [retry, setRetry] = useState(0);
  const [recs, setRecs] = useState({ summary: null, byId: {}, loading: false });

  useEffect(() => {
    if (mobileView === "map" && focusMap.current) {
      focusMap.current = false;
      mapHeading.current?.focus();
    }
  }, [mobileView]);

  const q = params.get("q") ?? "";
  const paramsKey = params.toString();
  const activeFilters = FILTER_KEYS.filter((k) => k !== "place_label" && params.get(k) && params.get(k) !== "false").length;

  useEffect(() => {
    document.title = q ? `${q} · Easy Search` : "Easy Search";
  }, [q]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setLoading(false);
      return;
    }
    // Si la app está obteniendo la ubicación, se espera (máx. ~8 s): buscar antes y otra vez al llegar
    // la ubicación gastaría dos consultas a la IA
    if (locating) {
      setLoading(true);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setErrorCode(null);
    api
      .search(buildPayload(new URLSearchParams(paramsKey), coords), { signal: controller.signal })
      .then((res) => {
        setData(res);
        setDisplayedParams(paramsKey);
        setSelectedId(null);
        setHoveredId(null);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err.message);
        setErrorCode(err.code);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [paramsKey, q, coords, retry, locating]);

  // Recomendaciones: se piden DESPUÉS de mostrar los resultados para no retrasarlos
  useEffect(() => {
    const ids = (data?.results ?? []).slice(0, RECOMMENDED_COUNT).map((r) => r.id);
    if (!data || ids.length === 0) {
      setRecs({ summary: null, byId: {}, loading: false });
      return;
    }
    const controller = new AbortController();
    setRecs({ summary: null, byId: {}, loading: true });
    api
      .recommendations({ q: data.query, establishment_ids: ids }, { signal: controller.signal })
      .then((res) =>
        setRecs({
          summary: res.summary,
          byId: Object.fromEntries(res.items.map((item) => [item.establishment_id, item])),
          loading: false,
        }),
      )
      .catch((err) => {
        if (err.name !== "AbortError") setRecs({ summary: null, byId: {}, loading: false });
      });
    return () => controller.abort();
  }, [data]);

  const applyFilters = useCallback(
    (values) => {
      const next = new URLSearchParams({ q });
      Object.entries(values).forEach(([k, v]) => v && next.set(k, v));
      setParams(next);
      setFiltersOpen(false);
    },
    [q, setParams],
  );

  const results = useMemo(() => data?.results ?? [], [data]);
  const hasQuery = q.trim().length >= 2;
  const showResults = hasQuery && !error && results.length > 0;
  const selectResult = (id) => {
    setSelectedId(id);
    setHoveredId(null);
    if (!window.matchMedia("(min-width: 1280px)").matches) {
      focusMap.current = true;
      setMobileView("map");
    }
  };

  // Marcador del mapa -> resalta la tarjeta y la trae a la vista si la lista está visible
  const selectFromMap = useCallback((id) => {
    setSelectedId(id);
    const card = document.getElementById(`resultado-${id}`);
    if (card && card.offsetParent !== null) {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      card.scrollIntoView({ block: "nearest", behavior: smooth ? "smooth" : "auto" });
    }
  }, []);

  const filters = <FiltersPanel params={params} applied={data?.applied_filters} onApply={applyFilters} busy={loading} />;

  return (
    // El fondo blanco ocupa todo el ancho de la página (sin marco); el contenido va centrado encima
    <div className="results-workspace">
      {/* Fondo blanco con formas perladas redondeadas que deambulan en todas direcciones */}
      <span className="rw-backdrop" aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <i key={i} />)}</span>
      <div className="rw-window rw-dark mx-auto max-w-[96rem] px-3 py-4 sm:px-6 lg:py-6">
      {/* Encabezado de resultados */}
      <div className="results-intro mb-4 space-y-3">
        <header className="rw-top">
          <div className="min-w-0">
            <p className="rw-eyebrow"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />Búsqueda inteligente</p>
            <h1 className="rw-title text-balance">
              Resultados para{" "}
              {q ? <span className="rw-title-query">{q}</span> : <span className="rw-title-query">tu búsqueda</span>}
            </h1>
            {data?.location?.label && !error && (
              <p className="rw-subtitle"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />{data.location.label}</p>
            )}
          </div>
          {hasQuery && (
            <div className="rw-stats">
              <div className="rw-stat rw-orbit">
                <span className="rw-stat-label">Encontrados</span>
                <span className="rw-stat-value">{loading && !data ? "…" : error ? "–" : results.length}</span>
                <span className="rw-stat-unit">{results.length === 1 ? "lugar" : "lugares"}</span>
              </div>
              <div className="rw-stat rw-orbit">
                <span className="rw-stat-label">Filtros</span>
                <span className="rw-stat-value">{activeFilters}</span>
                <span className="rw-stat-unit">{activeFilters === 1 ? "activo" : "activos"}</span>
              </div>
            </div>
          )}
        </header>
        {hasQuery && !error && data && <InterpretationBar interpretation={data.interpretation} location={data.location} />}

        {data && data.guest_remaining != null && !error && <GuestBanner remaining={data.guest_remaining} next={here} />}

        {data?.needs_location && !coords && (
          <div className="flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 sm:flex-row sm:items-center">
            <LocateFixed className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
            <p className="flex-1 text-sm">
              Para mostrarte lo más cercano necesitamos tu ubicación. Solo se usa para ordenar los resultados y avisarte
              si hay trancón: nunca se guarda.
            </p>
            <button type="button" className="btn-primary" onClick={request} disabled={locationStatus === "requesting"}>
              {locationStatus === "requesting" ? "Obteniendo ubicación…" : "Usar mi ubicación"}
            </button>
          </div>
        )}

        {/* Sugerencia de una sola vez, después de la primera búsqueda sin ubicación */}
        {data && !data.needs_location && showHint && (
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm sm:flex-row sm:items-center">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50">
              <LocateFixed className="h-5 w-5 text-brand-600" aria-hidden="true" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold">Obtén mejores resultados compartiendo tu ubicación</p>
              <p className="text-xs text-ink-soft">
                Verás primero lo más cercano y la distancia a cada lugar. Solo te lo preguntamos una vez; tu ubicación
                nunca se guarda.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-primary px-3 py-2 text-sm"
                disabled={locationStatus === "requesting"}
                onClick={() => {
                  dismissHint();
                  request();
                }}
              >
                {locationStatus === "requesting" ? "Obteniendo…" : "Usar mi ubicación"}
              </button>
              <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={dismissHint}>
                Ahora no
              </button>
            </div>
          </div>
        )}

        {data?.notices
          ?.filter((n) => !(data.needs_location && n.includes("ubicación")))
          .map((notice) => (
            <p key={notice} className="flex items-start gap-2 text-sm text-ink-soft">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {notice}
            </p>
          ))}
      </div>

      {/* Barra móvil: filtros y lista/mapa */}
      <div className="results-viewbar mb-3 flex items-center gap-2 xl:hidden">
        <button ref={filtersTrigger} type="button" className="btn-ghost lg:hidden" aria-haspopup="dialog" onClick={() => setFiltersOpen(true)}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filtros{activeFilters > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-xs text-white">{activeFilters}</span>}
        </button>
        <div className="view-switch ml-auto inline-flex rounded-xl border border-line p-1" role="group" aria-label="Vista de resultados">
          {[
            { key: "list", label: "Lista", icon: List },
            { key: "map", label: "Mapa", icon: MapIcon },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              aria-pressed={mobileView === key}
              onClick={() => setMobileView(key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${
                mobileView === key ? "view-selected text-white" : "text-ink-soft hover:bg-brand-50"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="results-dock grid gap-4 lg:grid-cols-[252px_minmax(0,1fr)] xl:grid-cols-[minmax(218px,0.58fr)_minmax(0,1.28fr)_minmax(0,1fr)] 2xl:gap-5">
        {/* Filtros (escritorio) */}
        <aside className="filter-surface hidden h-fit overflow-hidden rounded-2xl lg:sticky lg:top-22 lg:block lg:max-h-[calc(100svh-6.5rem)]">{filters}</aside>

        {/* Lista */}
        <section className={`results-list min-w-0 ${mobileView === "map" ? "hidden xl:block" : ""}`} aria-labelledby="results-list-title">
          <div className="results-list-title mb-3 flex flex-wrap items-center gap-2" role="status">
            <span className="dashboard-icon"><List className="h-4 w-4" aria-hidden="true" /></span>
            <h2 id="results-list-title" className="text-base font-bold sm:text-lg">
              {data && hasQuery && !error ? (results.length === 0 ? "Sin resultados" : `${results.length} resultado${results.length === 1 ? "" : "s"}`) : "Lugares"}
            </h2>
            {loading ? (
              <span className="results-status ml-auto">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                {locating ? "Obteniendo ubicación…" : data ? "Actualizando…" : "Buscando…"}
              </span>
            ) : activeFilters > 0 && <span className="results-status ml-auto">{activeFilters} {activeFilters === 1 ? "filtro" : "filtros"}</span>}
          </div>

          {!loading && !error && q.trim().length < 2 && (
            <div className="card flex items-center gap-3 p-5 text-sm text-ink-soft">
              <SearchX className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
              Escribe qué necesitas en el buscador para ver lugares.
            </div>
          )}

          {loading && !showResults && (
            <div className="space-y-3">
              {/* Explica la espera: la IA está convirtiendo la frase en filtros */}
              <p className="ai-surface mb-1 flex items-center gap-2 rounded-xl p-3 text-sm font-semibold text-brand-700">
                <Sparkles className="h-4 w-4 animate-pulse" aria-hidden="true" />
                {locating ? "Obteniendo tu ubicación…" : "Interpretando tu búsqueda…"}
              </p>
              {Array.from({ length: 4 }, (_, i) => (
                <ResultCardSkeleton key={i} />
              ))}
            </div>
          )}

          {!loading && error && errorCode === "guest_limit" && <GuestLimitCard message={error} next={here} />}

          {!loading && error && errorCode !== "guest_limit" && (
            <div className="card flex flex-col items-center gap-3 p-8 text-center">
              <AlertTriangle className="h-8 w-8 text-closed" aria-hidden="true" />
              <p className="font-semibold">{error}</p>
              <button type="button" className="btn-primary" onClick={() => setRetry((n) => n + 1)}>
                Intentar de nuevo
              </button>
            </div>
          )}

          {!loading && !error && hasQuery && data && results.length === 0 && (
            <div className="card flex flex-col items-center gap-2 p-8 text-center">
              <SearchX className="h-8 w-8 text-ink-soft" aria-hidden="true" />
              <p className="font-semibold">No encontramos lugares para esta búsqueda.</p>
              <p className="max-w-md text-sm text-ink-soft">
                Prueba quitando algunos filtros, ampliando la zona o escribiendo tu necesidad de otra forma.
              </p>
              {activeFilters > 0 && (
                <button type="button" className="btn-ghost mt-2" onClick={() => applyFilters({})}>
                  Quitar filtros
                </button>
              )}
            </div>
          )}

          {showResults && recs.summary && (
            // Llega después de los resultados: aparece con un fundido para que se note que es nuevo
            <p className="ai-surface fade-up mb-3 flex gap-2 rounded-2xl p-4 text-sm leading-relaxed">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
              <span>{recs.summary}</span>
            </p>
          )}

          {showResults && (
            // La "key" reinicia la cascada en cada búsqueda nueva
            <ol key={displayedParams} className="results-stack space-y-3" aria-busy={loading} data-updating={loading || undefined}>
              {results.map((r, i) => (
                <li key={r.id} className="result-in" style={{ "--i": i }}>
                  <ResultCard
                    result={r}
                    index={i}
                    active={r.id === selectedId}
                    onSelect={selectResult}
                    onHover={setHoveredId}
                    recommendation={recs.byId[r.id]}
                    recommendationLoading={recs.loading && i < RECOMMENDED_COUNT}
                  />
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Mapa: columna en pantallas grandes, pestaña en celular */}
        <section
          className={`${mobileView === "map" ? "flex" : "hidden"} map-frame h-[min(52svh,31rem)] min-h-72 flex-col xl:sticky xl:top-22 xl:flex xl:h-[calc(100svh-7rem)]`}
          aria-label="Mapa de resultados"
        >
          <div className="map-frame-label flex items-center justify-between gap-2 px-3 py-2.5">
            <h2 ref={mapHeading} tabIndex={-1} className="map-heading flex items-center gap-2 text-sm font-bold"><span className="map-frame-icon"><MapIcon className="h-4 w-4" aria-hidden="true" /></span> Mapa de resultados</h2>
            <span className="map-count">{showResults ? results.length : 0} {showResults && results.length === 1 ? "lugar" : "lugares"}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl">
            <Suspense fallback={<MapFallback />}>
              <ResultsMap results={showResults ? results : EMPTY_RESULTS} userCoords={coords} activeId={hoveredId ?? selectedId} onSelect={selectFromMap} />
            </Suspense>
          </div>
        </section>
      </div>

      {/* Filtros (celular): panel inferior */}
      {filtersOpen && (
        <FilterDrawer onClose={closeFilters} triggerRef={filtersTrigger}>
          <FiltersPanel params={params} applied={data?.applied_filters} onApply={applyFilters} onClose={closeFilters} busy={loading} />
        </FilterDrawer>
      )}
      </div>
    </div>
  );
}
