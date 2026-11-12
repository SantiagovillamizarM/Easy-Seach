import { AlertTriangle, Info, List, LocateFixed, Map as MapIcon, SearchX, SlidersHorizontal } from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import FiltersPanel, { FILTER_KEYS } from "../components/FiltersPanel.jsx";
import InterpretationBar from "../components/InterpretationBar.jsx";
import ResultCard, { ResultCardSkeleton } from "../components/ResultCard.jsx";
import { useUserLocation } from "../context/LocationContext.jsx";
import { api } from "../lib/api.js";

const ResultsMap = lazy(() => import("../components/ResultsMap.jsx"));

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

function MapFallback() {
  return <div className="h-full w-full animate-pulse rounded-2xl bg-slate-100" />;
}

export default function ResultsPage() {
  const [params, setParams] = useSearchParams();
  const { coords, request, status: locationStatus } = useUserLocation();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [mobileView, setMobileView] = useState("list"); // list | map
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [retry, setRetry] = useState(0);

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
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .search(buildPayload(new URLSearchParams(paramsKey), coords), { signal: controller.signal })
      .then((res) => {
        setData(res);
        setActiveId(null);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [paramsKey, q, coords, retry]);

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

  const filters = <FiltersPanel params={params} applied={data?.applied_filters} onApply={applyFilters} />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-5">
      {/* Encabezado de resultados */}
      <div className="mb-4 space-y-3">
        {data && <InterpretationBar interpretation={data.interpretation} location={data.location} />}

        {data?.needs_location && !coords && (
          <div className="flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 sm:flex-row sm:items-center">
            <LocateFixed className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
            <p className="flex-1 text-sm">
              Para mostrarte lo más cercano necesitamos tu ubicación. Solo se usa para esta búsqueda y no se guarda.
            </p>
            <button type="button" className="btn-primary" onClick={request} disabled={locationStatus === "requesting"}>
              {locationStatus === "requesting" ? "Obteniendo ubicación…" : "Usar mi ubicación"}
            </button>
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
      <div className="mb-3 flex items-center gap-2 xl:hidden">
        <button type="button" className="btn-ghost lg:hidden" onClick={() => setFiltersOpen(true)}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filtros{activeFilters > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-xs text-white">{activeFilters}</span>}
        </button>
        <div className="ml-auto inline-flex rounded-xl border border-line bg-white p-1" role="tablist" aria-label="Vista">
          {[
            { key: "list", label: "Lista", icon: List },
            { key: "map", label: "Mapa", icon: MapIcon },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mobileView === key}
              onClick={() => setMobileView(key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${
                mobileView === key ? "bg-ink text-white" : "text-ink-soft"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_minmax(0,0.9fr)]">
        {/* Filtros (escritorio) */}
        <aside className="card hidden h-fit overflow-hidden lg:sticky lg:top-24 lg:block">{filters}</aside>

        {/* Lista */}
        <section className={`${mobileView === "map" ? "hidden xl:block" : ""}`} aria-live="polite" aria-busy={loading}>
          {!loading && data && (
            <p className="mb-3 text-sm text-ink-soft">
              {results.length === 0 ? "Sin resultados" : `${results.length} resultado${results.length === 1 ? "" : "s"}`} para{" "}
              <strong className="text-ink">“{q}”</strong>
            </p>
          )}

          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 4 }, (_, i) => (
                <ResultCardSkeleton key={i} />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="card flex flex-col items-center gap-3 p-8 text-center">
              <AlertTriangle className="h-8 w-8 text-closed" aria-hidden="true" />
              <p className="font-semibold">{error}</p>
              <button type="button" className="btn-primary" onClick={() => setRetry((n) => n + 1)}>
                Intentar de nuevo
              </button>
            </div>
          )}

          {!loading && !error && data && results.length === 0 && (
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

          {!loading && !error && results.length > 0 && (
            <ol className="space-y-3">
              {results.map((r, i) => (
                <li key={r.id}>
                  <ResultCard result={r} index={i} active={r.id === activeId} onHover={setActiveId} />
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Mapa: columna en pantallas grandes, pestaña en celular */}
        <section
          className={`${mobileView === "map" ? "block" : "hidden"} h-[70vh] xl:sticky xl:top-24 xl:block xl:h-[calc(100vh-8rem)]`}
          aria-label="Mapa de resultados"
        >
          <div className="card h-full overflow-hidden">
            <Suspense fallback={<MapFallback />}>
              <ResultsMap results={results} userCoords={coords} activeId={activeId} onSelect={setActiveId} />
            </Suspense>
          </div>
        </section>
      </div>

      {/* Filtros (celular): panel inferior */}
      {filtersOpen && (
        <div className="fixed inset-0 z-[1100] lg:hidden" role="dialog" aria-modal="true" aria-label="Filtros">
          <button type="button" className="absolute inset-0 bg-ink/40" onClick={() => setFiltersOpen(false)} aria-label="Cerrar" />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-hidden rounded-t-3xl bg-white shadow-[var(--shadow-float)]">
            <FiltersPanel params={params} applied={data?.applied_filters} onApply={applyFilters} onClose={() => setFiltersOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
