import { LoaderCircle, MapPin, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { api } from "../lib/api.js";
import { useUserLocation } from "../context/LocationContext.jsx";

// Filtros que se guardan en la URL (nunca coordenadas).
export const FILTER_KEYS = ["place_id", "place_label", "radius_km", "budget_min", "budget_max", "min_rating", "category", "open_now"];

const RATINGS = [
  { value: "", label: "Todas" },
  { value: "3", label: "3+" },
  { value: "4", label: "4+" },
  { value: "4.5", label: "4,5+" },
];
const RADII = ["1", "3", "5", "10", "25"];

function PlacePicker({ id, value, label, onChange }) {
  const [text, setText] = useState(label ?? "");
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => setText(label ?? ""), [label]);

  useEffect(() => {
    if (!open || text.trim().length < 2 || (value && text === label)) {
      setOptions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.places({ q: text.trim(), limit: 8 }, { signal: controller.signal }).then(setOptions).catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, open, value, label]);

  return (
    <div className="relative">
      <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
      <input
        id={id}
        data-filled={text ? "" : undefined}
        className="input pl-9 pr-8"
        placeholder="Municipio o barrio"
        value={text}
        autoComplete="off"
        role="combobox"
        aria-expanded={options.length > 0}
        aria-controls={options.length > 0 ? `${id}-options` : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setText(e.target.value);
          if (value) onChange(null);
        }}
      />
      {value && (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-soft hover:text-ink"
          onClick={() => {
            setText("");
            onChange(null);
          }}
          aria-label="Quitar lugar"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {open && options.length > 0 && (
        <ul id={`${id}-options`} role="listbox" className="card absolute z-20 mt-1 max-h-64 w-full overflow-auto p-1">
          {options.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={String(p.id) === value}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setText(p.name);
                  setOpen(false);
                  onChange(p);
                }}
              >
                <span className="truncate">{p.name}</span>
                <span className="ml-2 shrink-0 text-xs text-ink-soft">{p.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Indicador circular de grupo: se enciende cuando el grupo tiene un valor elegido
function GroupDot({ on }) {
  return <span className="filter-dot" data-on={on || undefined} aria-hidden="true" />;
}

// Valores iniciales: lo que está en la URL; si no, lo que la IA aplicó a partir del texto.
function initialDraft(params, applied) {
  const fromAi = {
    budget_min: applied?.budget_min ?? "",
    budget_max: applied?.budget_max ?? "",
    min_rating: applied?.min_rating ?? "",
    category: applied?.category ?? "",
    open_now: applied?.open_now ? "true" : "",
  };
  return Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? String(fromAi[k] ?? "")]));
}

export default function FiltersPanel({ params, applied, onApply, onClose, busy }) {
  const id = useId();
  const { coords } = useUserLocation();
  const [categories, setCategories] = useState([]);
  const [draft, setDraft] = useState(() => initialDraft(params, applied));

  useEffect(() => {
    setDraft(initialDraft(params, applied));
  }, [params, applied]);

  useEffect(() => {
    api.categories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const activeCount = FILTER_KEYS.filter((key) => key !== "place_label" && draft[key] && draft[key] !== "false").length;
  const budgetError =
    draft.budget_min && draft.budget_max && Number(draft.budget_min) > Number(draft.budget_max)
      ? "El mínimo no puede ser mayor que el máximo"
      : null;

  function apply(event) {
    event.preventDefault();
    if (budgetError || busy) return;
    onApply(draft);
  }

  function reset() {
    const empty = Object.fromEntries(FILTER_KEYS.map((k) => [k, ""]));
    setDraft(empty);
    onApply(empty);
  }

  return (
    <form onSubmit={apply} data-busy={busy || undefined} className="filters-form flex h-full min-h-0 flex-col lg:max-h-[calc(100svh-6.5rem)]">
      <div className="filter-header flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 font-bold">
          <span className="filter-icon"><SlidersHorizontal className="h-4 w-4" aria-hidden="true" /></span>
          Filtros
          {activeCount > 0 && <span className="filter-count" aria-label={`${activeCount} filtros seleccionados`}>{activeCount}</span>}
        </h2>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted" aria-label="Cerrar filtros">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="filter-fields min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="filter-group" data-on={draft.place_id ? "" : undefined}>
          <label htmlFor={`${id}-place`} className="mb-1.5 flex items-center gap-2 text-sm font-semibold"><GroupDot on={Boolean(draft.place_id)} />Ubicación</label>
          <PlacePicker
            id={`${id}-place`}
            value={draft.place_id}
            label={draft.place_label}
            onChange={(p) => setDraft((d) => ({ ...d, place_id: p ? String(p.id) : "", place_label: p ? p.name : "" }))}
          />
        </div>

        <div className="filter-group" data-on={draft.radius_km ? "" : undefined}>
          <label htmlFor={`${id}-radius`} className="mb-1.5 flex items-center gap-2 text-sm font-semibold"><GroupDot on={Boolean(draft.radius_km)} />Distancia máxima</label>
          <select
            id={`${id}-radius`}
            data-filled={draft.radius_km ? "" : undefined}
            className="input"
            value={draft.radius_km}
            onChange={(e) => set("radius_km", e.target.value)}
            disabled={!coords && !draft.place_id}
          >
            <option value="">Sin límite</option>
            {RADII.map((r) => (
              <option key={r} value={r}>Hasta {r} km</option>
            ))}
          </select>
          {!coords && !draft.place_id && (
            <p className="mt-1 text-xs text-ink-soft">Activa tu ubicación o elige un lugar para usar la distancia.</p>
          )}
        </div>

        <fieldset className="filter-group" data-on={draft.budget_min || draft.budget_max ? "" : undefined}>
          <legend className="mb-1.5 flex items-center gap-2 text-sm font-semibold"><GroupDot on={Boolean(draft.budget_min || draft.budget_max)} />Presupuesto (COP)</legend>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input"
              data-filled={draft.budget_min ? "" : undefined}
              type="number"
              inputMode="numeric"
              min="0"
              step="1000"
              placeholder="Mínimo"
              aria-label="Presupuesto mínimo"
              value={draft.budget_min}
              onChange={(e) => set("budget_min", e.target.value)}
            />
            <input
              className="input"
              data-filled={draft.budget_max ? "" : undefined}
              type="number"
              inputMode="numeric"
              min="0"
              step="1000"
              placeholder="Máximo"
              aria-label="Presupuesto máximo"
              value={draft.budget_max}
              onChange={(e) => set("budget_max", e.target.value)}
            />
          </div>
          {budgetError && <p className="mt-1 text-xs text-closed">{budgetError}</p>}
        </fieldset>

        <fieldset className="filter-group" data-on={draft.min_rating ? "" : undefined}>
          <legend className="mb-1.5 flex items-center gap-2 text-sm font-semibold"><GroupDot on={Boolean(draft.min_rating)} />Calificación mínima</legend>
          <div className="grid grid-cols-4 gap-1.5">
            {RATINGS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => set("min_rating", r.value)}
                aria-pressed={draft.min_rating === r.value}
                className={`filter-rating rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                  draft.min_rating === r.value
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-line bg-white text-ink-soft hover:border-brand-200"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="filter-group" data-on={draft.category ? "" : undefined}>
          <label htmlFor={`${id}-category`} className="mb-1.5 flex items-center gap-2 text-sm font-semibold"><GroupDot on={Boolean(draft.category)} />Categoría</label>
          <select id={`${id}-category`} data-filled={draft.category ? "" : undefined} className="input" value={draft.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>

        <label className="filter-open flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
          <span>
            <span className="block text-sm font-semibold">Abierto ahora</span>
            <span className="block text-xs text-ink-soft">Solo lugares con horario confirmado</span>
          </span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-brand-600"
            checked={draft.open_now === "true"}
            // "false" explícito: si la IA entendió "abierto ahora" y el usuario lo desmarca, se respeta su decisión
            onChange={(e) => set("open_now", e.target.checked ? "true" : "false")}
          />
        </label>
      </div>

      <div className="filter-actions flex shrink-0 gap-2 border-t border-line px-4 py-3">
        <button type="button" onClick={reset} className="btn-ghost flex-1" disabled={busy}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Limpiar
        </button>
        <button type="submit" className="btn-primary filter-apply relative flex-1 overflow-hidden" data-busy={busy || undefined} disabled={Boolean(budgetError) || busy}>
          <span className="filter-apply-sheen" aria-hidden="true" />{busy ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Buscando</> : "Aplicar"}
        </button>
      </div>
    </form>
  );
}
