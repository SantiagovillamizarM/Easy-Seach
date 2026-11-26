import { CircleDashed, Layers, Search, Store, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { CountUp, SegmentRing, fmt } from "../../components/admin/blackhole/Charts.jsx";
import { ErrorBox, Loading, useApiData } from "../../components/admin/ui.jsx";
import { api } from "../../lib/api.js";
import { normalizeText } from "../../lib/format.js";
import "./black-hole.css";

// Categorías: cuántos negocios activos hay en cada una. Mismo lenguaje que el resumen: tarjetas de indicadores,
// anillo de reparto y un mosaico de tarjetas que brillan más cuantos más negocios tienen.

const SHADES = ["#f2f2f2", "#d4d4d4", "#b3b3b3", "#949494", "#777777", "#5c5c5c", "#424242"];
const TOP = 6;

function Panel({ eyebrow, title, note, className = "", children }) {
  return (
    <section className={`bh-panel bh-hud ${className}`}>
      <header className="bh-head">
        <div>
          {eyebrow && <p className="bh-eyebrow">{eyebrow}</p>}
          <h2 className="bh-title">{title}</h2>
        </div>
        {note}
      </header>
      {children}
    </section>
  );
}

// Tarjeta de indicador (como las del resumen): ícono, cifra que cuenta, detalle y una barra de proporción
function Stat({ icon: Icon, label, value, hint, share, color = "#f2f2f2" }) {
  return (
    <div className="bh-kpi bh-cat-kpi" style={{ "--kc": color }}>
      <div className="bh-kpi-top">
        <span className="bh-kpi-icon"><Icon className="h-4 w-4" aria-hidden="true" /></span>
        <span className="bh-kpi-label">{label}</span>
      </div>
      <div className="bh-kpi-value"><strong><CountUp value={value} /></strong></div>
      <small>{hint}</small>
      <div className="bh-cat-kpi-bar" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, share))}%` }} /></div>
    </div>
  );
}

export default function AdminCategories() {
  const { data, error, loading } = useApiData((opts) => api.admin.categories(opts), []);
  const [query, setQuery] = useState("");

  const stats = useMemo(() => {
    if (!data) return null;
    const used = data.filter((c) => c.establishments > 0);
    const total = used.reduce((s, c) => s + c.establishments, 0);
    const top = used.slice(0, TOP);
    const rest = total - top.reduce((s, c) => s + c.establishments, 0);
    return { used: used.length, empty: data.length - used.length, total, biggest: used[0], top, rest };
  }, [data]);

  const shown = useMemo(() => {
    if (!data) return [];
    const q = normalizeText(query);
    return q ? data.filter((c) => normalizeText(`${c.name} ${c.description ?? ""}`).includes(q)) : data;
  }, [data, query]);
  const max = data?.length ? Math.max(1, ...data.map((c) => c.establishments)) : 1;
  const ring = stats ? [
    ...stats.top.map((c, i) => ({ label: c.name, value: c.establishments, color: SHADES[i] })),
    ...(stats.rest > 0 ? [{ label: "Otras", value: stats.rest, color: SHADES[6] }] : []),
  ] : [];

  return (
    <div className="bh bh-searches">
      <header className="bh-searches-head">
        <div>
          <p className="bh-eyebrow">Catálogo · categorías</p>
          <h1>Categorías</h1>
          <p className="bh-note">Cuántos negocios activos hay en cada categoría del buscador.</p>
        </div>
        <label className="bh-cat-search">
          <Search className="h-4 w-4" aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar categoría"
                 aria-label="Buscar categoría" />
        </label>
      </header>

      <ErrorBox message={error} />
      {loading && !data && <Loading />}
      {data && stats && (
        <div className="bh-grid-layout bh-reveal">
          <div className="bh-kpis bh-span-12">
            <Stat icon={Layers} label="Categorías" value={data.length} hint="en el buscador" share={100} color="#f2f2f2" />
            <Stat icon={Store} label="Con negocios" value={stats.used} share={(stats.used / Math.max(1, data.length)) * 100}
                  hint={`${Math.round((stats.used / Math.max(1, data.length)) * 100)}% del catálogo`} color="#d4d4d4" />
            <Stat icon={CircleDashed} label="Vacías" value={stats.empty} share={(stats.empty / Math.max(1, data.length)) * 100}
                  hint={stats.empty ? "sin negocios activos" : "ninguna vacía"} color="#9a9a9a" />
            <Stat icon={Trophy} label="La más grande" value={stats.biggest?.establishments ?? 0}
                  share={stats.total ? (stats.biggest.establishments / stats.total) * 100 : 0}
                  hint={stats.biggest ? `${stats.biggest.name} · ${Math.round((stats.biggest.establishments / stats.total) * 100)}%` : "—"}
                  color="#ffffff" />
          </div>

          <Panel className="bh-span-12" eyebrow="Nº 001 · Reparto" title="Dónde se concentran los negocios">
            <div className="bh-cat-share">
              <div className="bh-cat-ring">
                <SegmentRing items={ring} label="sin negocios"
                             center={<><strong><CountUp value={stats.total} /></strong><span>asignaciones</span></>} />
              </div>
              <ul className="bh-cat-top">
                {ring.map((r) => (
                  <li key={r.label} style={{ "--kc": r.color }}>
                    <i aria-hidden="true" />
                    <span>{r.label}</span>
                    <b className="bh-num">{fmt(r.value)}</b>
                    <small className="bh-num">{Math.round((r.value / Math.max(1, stats.total)) * 100)}%</small>
                    <em aria-hidden="true"><u style={{ width: `${(r.value / Math.max(1, ...ring.map((x) => x.value))) * 100}%` }} /></em>
                  </li>
                ))}
              </ul>
            </div>
            <p className="bh-note mt-3">Un negocio puede estar en varias categorías, por eso se cuentan asignaciones.</p>
          </Panel>

          <Panel className="bh-span-12" eyebrow="Nº 002 · Detalle" title="Todas las categorías"
                 note={<span className="bh-note bh-num">{fmt(shown.length)} de {fmt(data.length)}</span>}>
            {shown.length === 0 ? (
              <p className="bh-note">Ninguna categoría coincide con «{query}».</p>
            ) : (
              <ol className="bh-rank bh-cat-rank">
                {shown.map((c) => (
                  <li key={c.id} className={c.establishments ? "" : "is-empty"}>
                    <span className="bh-rank-pos bh-num">{String(data.indexOf(c) + 1).padStart(2, "0")}</span>
                    <span className="bh-cat-name">
                      <span className="bh-rank-text">{c.name}</span>
                      {c.description && <small title={c.description}>{c.description}</small>}
                    </span>
                    {c.establishments ? <span /> : <em className="bh-cat-empty">vacía</em>}
                    <b className="bh-num">{fmt(c.establishments)}<span className="sr-only"> negocios</span></b>
                    <i aria-hidden="true"><u style={{ width: `${(c.establishments / max) * 100}%` }} /></i>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
