import { ChevronDown, Search, Tag, X } from "lucide-react";
import { useMemo, useState } from "react";
import { formatPrice } from "../lib/format.js";

// Carta del local: pestañas por sección, buscador y vista compacta. Pensado para menús largos (100+ productos)
// sin que la página se vuelva una lista interminable.

const PREVIEW = 6;      // productos visibles en "Todo" antes de "Ver la carta completa"
const SEARCH_FROM = 10; // con más productos que esto aparece el buscador

const norm = (s) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Agrupa por sección respetando el orden de la carta. Sin secciones: Productos / Servicios. */
export function groupOfferings(offerings) {
  const hasSections = offerings.some((o) => o.section);
  const groups = new Map();
  for (const o of offerings) {
    const key = hasSections ? o.section || "Otros" : o.kind === "service" ? "Servicios" : "Productos";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }
  return [...groups.entries()].map(([title, items]) => ({ title, items }));
}

function Item({ o }) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50">
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-snug">{o.name}</p>
        {o.description && <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-soft">{o.description}</p>}
      </div>
      <span className="shrink-0 text-sm font-bold tabular-nums">
        {formatPrice(o.price) ?? <span className="font-normal italic text-ink-soft">—</span>}
      </span>
    </li>
  );
}

function Group({ title, items, showTitle }) {
  return (
    <div>
      {showTitle && (
        <h3 className="mb-1 mt-4 px-3 text-xs font-bold uppercase tracking-wide text-brand-700 first:mt-0">{title}</h3>
      )}
      <ul className="grid gap-x-4 md:grid-cols-2">
        {items.map((o) => <Item key={o.id} o={o} />)}
      </ul>
    </div>
  );
}

export default function OfferingsMenu({ offerings }) {
  const groups = useMemo(() => groupOfferings(offerings), [offerings]);
  const [tab, setTab] = useState(null); // null = "Todo"
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  const q = norm(query.trim());
  const searching = q.length >= 2;

  // Qué grupos se muestran según la pestaña, la búsqueda o la vista previa
  const visible = useMemo(() => {
    if (searching) {
      // Primero por nombre y descripción ("michelada" → solo micheladas); si nada coincide, por sección
      // ("cócteles" → toda la sección de cócteles)
      const byItem = groups
        .map((g) => ({ ...g, items: g.items.filter((o) => norm(`${o.name} ${o.description ?? ""}`).includes(q)) }))
        .filter((g) => g.items.length);
      return byItem.length ? byItem : groups.filter((g) => norm(g.title).includes(q));
    }
    if (tab) return groups.filter((g) => g.title === tab);
    if (expanded) return groups;
    // Vista previa: los primeros productos de la carta, sin partir la lectura
    let left = PREVIEW;
    const preview = [];
    for (const g of groups) {
      if (left <= 0) break;
      preview.push({ ...g, items: g.items.slice(0, left) });
      left -= g.items.length;
    }
    return preview;
  }, [groups, tab, searching, q, expanded]);

  const total = offerings.length;
  const shown = visible.reduce((n, g) => n + g.items.length, 0);
  const multipleGroups = groups.length > 1;

  return (
    <section className="card p-5" aria-labelledby="menu-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="menu-title" className="flex items-center gap-2 text-base font-bold">
          <Tag className="h-4 w-4 text-brand-600" aria-hidden="true" />
          {groups.some((g) => !["Productos", "Servicios"].includes(g.title)) ? "Carta y precios" : "Productos y servicios"}
          <span className="text-sm font-normal text-ink-soft">({total})</span>
        </h2>
        {total > SEARCH_FROM && (
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
            <input
              type="search"
              className="input py-2 pl-9 pr-8"
              placeholder="Buscar en la carta…"
              aria-label="Buscar en la carta"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Borrar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-soft hover:text-ink">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      {multipleGroups && !searching && (
        <div role="tablist" aria-label="Secciones de la carta" className="mb-3 flex flex-wrap gap-1.5">
          {[{ title: null, label: "Todo", count: total }, ...groups.map((g) => ({ title: g.title, label: g.title, count: g.items.length }))].map((t) => {
            const selected = tab === t.title;
            return (
              <button
                key={t.label}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(t.title)}
                className={`chip cursor-pointer whitespace-nowrap ${selected ? "border-brand-600 bg-brand-600 text-white" : "hover:border-brand-200"}`}
              >
                {t.label}
                <span className={selected ? "text-white/70" : "text-ink-soft/70"}>{t.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-ink-soft">No encontramos “{query}” en la carta.</p>
      ) : (
        <div role="tabpanel">
          {visible.map((g) => <Group key={g.title} title={g.title} items={g.items} showTitle={multipleGroups && (!tab || searching)} />)}
        </div>
      )}

      {!tab && !searching && shown < total && (
        <button type="button" className="btn-ghost mt-3 w-full" onClick={() => setExpanded(true)}>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
          Ver la carta completa ({total})
        </button>
      )}
      {!tab && !searching && expanded && total > PREVIEW && (
        <button type="button" className="mt-3 w-full text-center text-sm font-semibold text-brand-700 hover:underline" onClick={() => setExpanded(false)}>
          Mostrar menos
        </button>
      )}
      {searching && <p className="mt-2 px-3 text-xs text-ink-soft">{shown} de {total} productos</p>}
    </section>
  );
}
