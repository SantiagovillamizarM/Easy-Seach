import { History, MapPin, RotateCcw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";

const PAGE_SIZE = 20;

function dayLabel(date) {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hoy";
  if (d.toDateString() === yesterday.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
}

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async (offset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.history({ limit: PAGE_SIZE, offset });
      setItems((prev) => (offset === 0 ? page.items : [...prev, ...page.items]));
      setTotal(page.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "Mi historial · Easy Search";
    load(0);
  }, [load]);

  async function remove(id) {
    const previous = items;
    setItems((list) => list.filter((i) => i.id !== id));
    setTotal((t) => t - 1);
    try {
      await api.deleteHistoryItem(id);
    } catch (err) {
      setItems(previous);
      setTotal((t) => t + 1);
      setError(err.message);
    }
  }

  async function clearAll() {
    try {
      await api.clearHistory();
      setItems([]);
      setTotal(0);
      setConfirmClear(false);
    } catch (err) {
      setError(err.message);
    }
  }

  // Agrupar por día
  const groups = [];
  for (const item of items) {
    const label = dayLabel(item.created_at);
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
    groups.at(-1).items.push(item);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <History className="h-6 w-6 text-brand-600" aria-hidden="true" />
            Mi historial
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Tus búsquedas anteriores. Nunca guardamos tu ubicación exacta, solo el texto que escribiste.
          </p>
        </div>
        {total > 0 &&
          (confirmClear ? (
            <div className="flex items-center gap-2">
              <span className="text-sm">¿Borrar todo?</span>
              <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => setConfirmClear(false)}>Cancelar</button>
              <button type="button" className="btn bg-closed px-3 py-1.5 text-white hover:opacity-90" onClick={clearAll}>Sí, borrar</button>
            </div>
          ) : (
            <button type="button" className="btn-ghost text-closed" onClick={() => setConfirmClear(true)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Borrar historial
            </button>
          ))}
      </div>

      {error && <p className="mt-4 text-sm text-closed">{error}</p>}

      {!loading && items.length === 0 && !error && (
        <div className="card mt-6 flex flex-col items-center gap-2 p-10 text-center">
          <Search className="h-8 w-8 text-ink-soft" aria-hidden="true" />
          <p className="font-semibold">No tienes búsquedas guardadas</p>
          <p className="text-sm text-ink-soft">Cuando busques con tu sesión iniciada, aparecerán aquí.</p>
          <Link to="/" className="btn-primary mt-3">Hacer una búsqueda</Link>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {groups.map((group) => (
          <section key={group.label}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft first-letter:uppercase">{group.label}</h2>
            <ul className="card divide-y divide-line">
              {group.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{item.query_text}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-soft">
                      <span>{new Date(item.created_at).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })}</span>
                      {item.location_label && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" aria-hidden="true" />
                          {item.location_label}
                        </span>
                      )}
                      <span>{item.results_count} resultado{item.results_count === 1 ? "" : "s"}</span>
                    </p>
                  </div>
                  <Link to={`/buscar?${new URLSearchParams({ q: item.query_text })}`} className="btn-ghost shrink-0 px-3 py-1.5">
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">Buscar de nuevo</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    className="shrink-0 rounded-lg p-2 text-ink-soft hover:bg-closed-bg hover:text-closed"
                    aria-label={`Eliminar "${item.query_text}" del historial`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {items.length < total && (
        <button type="button" className="btn-ghost mx-auto mt-6 flex" onClick={() => load(items.length)} disabled={loading}>
          Ver más
        </button>
      )}
    </div>
  );
}
