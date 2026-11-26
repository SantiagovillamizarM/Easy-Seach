import { useState } from "react";
import { CountUp, PulseChart, fmt } from "../../components/admin/blackhole/Charts.jsx";
import { ErrorBox, Loading, useApiData } from "../../components/admin/ui.jsx";
import { api } from "../../lib/api.js";
import "./black-hole.css";

// Búsquedas: qué busca la gente y qué no encuentra. Mismo estilo que el resumen (minimalista: cifras grandes,
// líneas finas, rankings). No se guardan ubicaciones ni datos personales: solo el texto y los resultados.

const RANGES = [{ days: 7, label: "7D" }, { days: 30, label: "30D" }, { days: 90, label: "90D" }];
const pct = (part, total) => (total ? Math.round((part / total) * 100) : 0);

function Panel({ eyebrow, title, note, className = "", children }) {
  return (
    <section className={`bh-panel bh-hud ${className}`}>
      <header className="bh-head">
        <div>
          {eyebrow && <p className="bh-eyebrow">{eyebrow}</p>}
          <h2 className="bh-title">{title}</h2>
        </div>
        {note && <span className="bh-note">{note}</span>}
      </header>
      {children}
    </section>
  );
}

// Ranking minimalista: puesto, texto, cantidad y una línea fina proporcional al primero
function Ranking({ rows, label = (r) => r.query, extra, empty, muted = false }) {
  if (!rows.length) return <p className="bh-note">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ol className={`bh-rank ${muted ? "is-muted" : ""}`}>
      {rows.map((r, i) => (
        <li key={label(r)}>
          <span className="bh-rank-pos bh-num">{String(i + 1).padStart(2, "0")}</span>
          <span className="bh-rank-text" title={label(r)}>{label(r)}</span>
          {extra && <small className="bh-rank-extra bh-num">{extra(r)}</small>}
          <b className="bh-num">{fmt(r.count)}</b>
          <i aria-hidden="true"><u style={{ width: `${(r.count / max) * 100}%` }} /></i>
        </li>
      ))}
    </ol>
  );
}

export default function AdminSearchStats() {
  const [days, setDays] = useState(30);
  const { data, error, loading } = useApiData((opts) => api.admin.searchStats(days, opts), [days]);
  const found = data ? data.total - data.zero_results : 0;

  return (
    <div className="bh bh-searches">
      <header className="bh-searches-head">
        <div>
          <p className="bh-eyebrow">Analítica · búsquedas</p>
          <h1>Búsquedas</h1>
          <p className="bh-note">Qué busca la gente y qué no encuentra. Solo se guarda el texto y el número de resultados.</p>
        </div>
        <div className="bh-pills" role="group" aria-label="Periodo">
          {RANGES.map((r) => (
            <button key={r.days} type="button" aria-pressed={days === r.days} onClick={() => setDays(r.days)}>{r.label}</button>
          ))}
        </div>
      </header>

      <ErrorBox message={error} />
      {loading && !data && <Loading />}
      {data && (
        <div className={`bh-grid-layout bh-reveal ${loading ? "is-refreshing" : ""}`}>
          <Panel className="bh-span-12" eyebrow="Nº 001 · Volumen" title="Cuánto se busca"
                 note={`Últimos ${days} días`}>
            <dl className="bh-searches-stats">
              <div>
                <dt>Búsquedas</dt>
                <dd className="bh-num"><CountUp value={data.total} /></dd>
                <i aria-hidden="true"><u style={{ width: "100%" }} /></i>
              </div>
              <div>
                <dt>Con resultados</dt>
                <dd className="bh-num">{pct(found, data.total)}%</dd>
                <i aria-hidden="true"><u style={{ width: `${pct(found, data.total)}%` }} /></i>
                <small className="bh-num">{fmt(found)} búsquedas</small>
              </div>
              <div>
                <dt>Sin resultados</dt>
                <dd className="bh-num"><CountUp value={data.zero_results} /></dd>
                <i aria-hidden="true"><u style={{ width: `${pct(data.zero_results, data.total)}%` }} /></i>
                <small className="bh-num">{pct(data.zero_results, data.total)}% del total</small>
              </div>
              <div>
                <dt>Con sesión iniciada</dt>
                <dd className="bh-num">{pct(data.logged_in, data.total)}%</dd>
                <i aria-hidden="true"><u style={{ width: `${pct(data.logged_in, data.total)}%` }} /></i>
                <small className="bh-num">{fmt(data.logged_in)} búsquedas</small>
              </div>
            </dl>
            <PulseChart dates={data.daily.map((d) => d.date)} values={data.daily.map((d) => d.count)}
                        label="Búsquedas" color="#f2f2f2" />
          </Panel>

          <Panel className="bh-span-6" eyebrow="Nº 002 · Demanda" title="Lo más buscado" note="Veces · resultados promedio">
            <Ranking rows={data.top_queries} extra={(r) => `${r.avg_results.toLocaleString("es-CO")} res.`}
                     empty="Todavía no hay búsquedas en este periodo." />
          </Panel>

          <Panel className="bh-span-6" eyebrow="Nº 003 · Oportunidades" title="Sin resultados"
                 note="Lo que la gente busca y no está">
            <Ranking rows={data.top_zero_results} muted empty="Ninguna búsqueda se quedó sin resultados." />
          </Panel>

          <Panel className="bh-span-12" eyebrow="Nº 004 · Categorías" title="Categorías más buscadas">
            <Ranking rows={data.top_categories} label={(c) => c.name} empty="Sin datos en este periodo." />
          </Panel>

          {/* Los mismos datos de la gráfica, para lectores de pantalla */}
          <table className="sr-only">
            <caption>Búsquedas por día</caption>
            <thead><tr><th>Día</th><th>Búsquedas</th></tr></thead>
            <tbody>{data.daily.map((d) => <tr key={d.date}><td>{d.date}</td><td>{d.count}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
