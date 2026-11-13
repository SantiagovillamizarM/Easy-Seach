import { ChevronLeft, ChevronRight, Inbox, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// Piezas compartidas por las secciones del panel administrativo.

/**
 * Carga datos de la API y permite recargarlos. Cancela la petición anterior si cambian los parámetros.
 * Uso: const { data, error, loading, reload } = useApiData((opts) => api.admin.users(params, opts), [params]);
 */
export function useApiData(fetcher, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const controllerRef = useRef(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(fetcher, deps);

  const reload = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((s) => ({ ...s, loading: true, error: null }));
    load({ signal: controller.signal })
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((err) => {
        if (err.name !== "AbortError") setState((s) => ({ ...s, error: err.message, loading: false }));
      });
  }, [load]);

  useEffect(() => {
    reload();
    return () => controllerRef.current?.abort();
  }, [reload]);

  return { ...state, reload };
}

export function PageHeader({ title, description, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-soft">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function ErrorBox({ message }) {
  if (!message) return null;
  return <p role="alert" className="rounded-xl bg-closed-bg px-3 py-2 text-sm text-closed">{message}</p>;
}

export function Loading() {
  return (
    <p className="flex items-center gap-2 py-10 text-sm text-ink-soft" role="status">
      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
      Cargando…
    </p>
  );
}

export function Empty({ children }) {
  return (
    <div className="card flex flex-col items-center gap-2 p-10 text-center text-sm text-ink-soft">
      <Inbox className="h-8 w-8 text-slate-300" aria-hidden="true" />
      {children}
    </div>
  );
}

/** Pestañas tipo filtro con contador opcional: [{ key, label, count }] */
export function FilterTabs({ tabs, value, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} className="mb-4 flex flex-wrap gap-1 rounded-xl border border-line bg-white p-1">
      {tabs.map((t) => {
        const selected = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              selected ? "bg-brand-600 text-white" : "text-ink-soft hover:bg-brand-50 hover:text-ink"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`rounded-full px-1.5 text-xs ${selected ? "bg-white/25" : "bg-amber-100 text-amber-800"}`}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Pager({ total, limit, offset, onChange }) {
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <nav aria-label="Paginación" className="mt-4 flex items-center justify-between gap-3 text-sm">
      <span className="text-ink-soft">
        {offset + 1}–{Math.min(offset + limit, total)} de {total.toLocaleString("es-CO")}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" className="btn-ghost px-2.5 py-1.5" disabled={page <= 1} onClick={() => onChange(offset - limit)} aria-label="Página anterior">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="px-2 font-semibold">{page} / {pages}</span>
        <button type="button" className="btn-ghost px-2.5 py-1.5" disabled={page >= pages} onClick={() => onChange(offset + limit)} aria-label="Página siguiente">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

const PILL_STYLES = {
  green: "bg-open-bg text-open",
  red: "bg-closed-bg text-closed",
  amber: "bg-amber-50 text-amber-800",
  gray: "bg-slate-100 text-ink-soft",
  brand: "bg-brand-50 text-brand-700",
};

export function Pill({ tone = "gray", children }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${PILL_STYLES[tone]}`}>{children}</span>;
}

export function formatDate(value, withTime = false) {
  const d = new Date(value);
  return d.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

/** Mensaje temporal de confirmación ("Reseña aprobada"). */
export function useFlash() {
  const [flash, setFlash] = useState(null);
  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(t);
  }, [flash]);
  return [flash, setFlash];
}

export function Flash({ message }) {
  if (!message) return null;
  return (
    <p role="status" className="fixed bottom-4 left-1/2 z-[1300] -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-lg">
      {message}
    </p>
  );
}
