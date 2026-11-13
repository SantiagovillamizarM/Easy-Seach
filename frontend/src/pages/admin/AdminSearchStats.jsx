import { useEffect, useRef, useState } from "react";
import { ErrorBox, FilterTabs, Loading, PageHeader, useApiData } from "../../components/admin/ui.jsx";
import { api } from "../../lib/api.js";

const RANGES = [
  { key: 7, label: "7 días" },
  { key: 30, label: "30 días" },
  { key: 90, label: "90 días" },
];

const dayLabel = (iso, opts = { day: "numeric", month: "short" }) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", opts);

/** Búsquedas por día: una sola serie (un color, sin leyenda), barras ancladas a la base con punta redondeada. */
function DailyChart({ daily }) {
  const boxRef = useRef(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = 200;
  const pad = { top: 12, right: 8, bottom: 26, left: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...daily.map((d) => d.count));
  const niceMax = max <= 5 ? max : Math.ceil(max / 5) * 5;
  const slot = plotW / daily.length;
  const gap = Math.max(2, slot * 0.25); // separación entre barras
  const barW = Math.max(1, slot - gap);
  const baseY = pad.top + plotH;
  const ticks = [0, niceMax / 2, niceMax].map((v) => Math.round(v));
  const labelEvery = Math.ceil(daily.length / 6);

  function barPath(x, h) {
    if (h <= 0) return "";
    const r = Math.min(4, barW / 2, h);
    const top = baseY - h;
    return `M${x},${baseY} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${baseY} Z`;
  }

  const active = hover !== null ? daily[hover] : null;
  return (
    <div ref={boxRef} className="relative" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label="Gráfica de búsquedas por día. La tabla con los datos está a continuación.">
        {ticks.map((t) => {
          const y = baseY - (t / niceMax) * plotH;
          return (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="var(--color-line)" strokeWidth="1" />
              <text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize="11" fill="var(--color-ink-soft)">{t}</text>
            </g>
          );
        })}
        {daily.map((d, i) => {
          const x = pad.left + i * slot + gap / 2;
          const h = (d.count / niceMax) * plotH;
          return (
            <g key={d.date}>
              <path d={barPath(x, h)} fill="var(--color-brand-600)" opacity={hover === null || hover === i ? 1 : 0.45} />
              {/* Zona de detección más grande que la barra: toda la columna */}
              <rect x={pad.left + i * slot} y={pad.top} width={slot} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
              {(i % labelEvery === 0 || i === daily.length - 1) && (
                <text x={x + barW / 2} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--color-ink-soft)">{dayLabel(d.date)}</text>
              )}
            </g>
          );
        })}
      </svg>
      {active && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(pad.left + hover * slot + slot / 2, 60), width - 60), top: 0 }}
        >
          <p className="text-ink-soft">{dayLabel(active.date, { weekday: "short", day: "numeric", month: "short" })}</p>
          <p className="font-bold text-ink">{active.count} {active.count === 1 ? "búsqueda" : "búsquedas"}</p>
        </div>
      )}
      <table className="sr-only">
        <caption>Búsquedas por día</caption>
        <thead><tr><th>Día</th><th>Búsquedas</th></tr></thead>
        <tbody>{daily.map((d) => <tr key={d.date}><td>{d.date}</td><td>{d.count}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function QueryTable({ title, description, rows, showResults = true, empty }) {
  return (
    <section className="card p-5">
      <h2 className="font-bold">{title}</h2>
      {description && <p className="mb-3 text-xs text-ink-soft">{description}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-soft">
              <th className="py-2 font-semibold">Búsqueda</th>
              <th className="py-2 text-right font-semibold">Veces</th>
              {showResults && <th className="py-2 text-right font-semibold">Resultados (prom.)</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.query}>
                <td className="py-2 pr-3 break-words">{r.query}</td>
                <td className="py-2 text-right tabular-nums">{r.count}</td>
                {showResults && <td className="py-2 text-right tabular-nums">{r.avg_results.toLocaleString("es-CO")}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function AdminSearchStats() {
  const [days, setDays] = useState(30);
  const { data, error, loading } = useApiData((opts) => api.admin.searchStats(days, opts), [days]);

  return (
    <>
      <PageHeader
        title="Búsquedas"
        description="Qué busca la gente y qué no encuentra. No se guardan ubicaciones ni datos personales: solo el texto y el número de resultados."
      />
      <FilterTabs label="Periodo" tabs={RANGES} value={days} onChange={setDays} />
      <ErrorBox message={error} />
      {loading && !data && <Loading />}
      {data && (
        <div className={`space-y-6 ${loading ? "opacity-60" : ""}`}>
          <section className="card p-5">
            <dl className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div><dt className="text-xs text-ink-soft">Búsquedas</dt><dd className="text-2xl font-extrabold tabular-nums">{data.total.toLocaleString("es-CO")}</dd></div>
              <div><dt className="text-xs text-ink-soft">Sin resultados</dt><dd className="text-2xl font-extrabold tabular-nums">{data.zero_results.toLocaleString("es-CO")}</dd></div>
              <div><dt className="text-xs text-ink-soft">% con resultados</dt><dd className="text-2xl font-extrabold tabular-nums">{data.total ? Math.round(((data.total - data.zero_results) / data.total) * 100) : 0}%</dd></div>
              <div><dt className="text-xs text-ink-soft">Con sesión iniciada</dt><dd className="text-2xl font-extrabold tabular-nums">{data.logged_in.toLocaleString("es-CO")}</dd></div>
            </dl>
            <h2 className="mb-2 text-sm font-bold">Búsquedas por día</h2>
            <DailyChart daily={data.daily} />
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <QueryTable title="Lo más buscado" rows={data.top_queries} empty="Todavía no hay búsquedas en este periodo." />
            <QueryTable
              title="Búsquedas sin resultados"
              description="Oportunidades: negocios o productos que la gente busca y no están en la base de datos."
              rows={data.top_zero_results}
              showResults={false}
              empty="Ninguna búsqueda se quedó sin resultados. 🎉"
            />
          </div>

          <section className="card p-5">
            <h2 className="mb-3 font-bold">Categorías más buscadas</h2>
            {data.top_categories.length === 0 ? (
              <p className="text-sm text-ink-soft">Sin datos en este periodo.</p>
            ) : (
              <ul className="space-y-3">
                {data.top_categories.map((c) => (
                  <li key={c.slug}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{c.name}</span>
                      <span className="tabular-nums font-semibold">{c.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${(c.count / data.top_categories[0].count) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
