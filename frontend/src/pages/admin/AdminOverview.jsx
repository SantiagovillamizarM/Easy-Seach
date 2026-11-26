import {
  Bot, Check, CheckCircle2, ChevronRight, Coins, Copy, Eye, Flag, MessageSquareText, Monitor, Search, Smartphone,
  Store, Tablet, UserPlus, Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarList, CountUp, Delta, Funnel, PeakHeatmap, PulseChart, SegmentRing, SparkArea, WordCloud, fmt, fmtUsd, settleCounts,
} from "../../components/admin/blackhole/Charts.jsx";
import { ErrorBox, useApiData } from "../../components/admin/ui.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { api } from "../../lib/api.js";
import "./black-hole.css";

// Dashboard del administrador: "Horizonte de eventos". Todo lo que pasa en la app cae hacia el centro:
// visitas, búsquedas, usuarios, preguntas a la IA y negocios. Se ve solo con rol admin.

const PERIODS = [{ days: 7, label: "7D" }, { days: 30, label: "30D" }, { days: 90, label: "90D" }, { days: 365, label: "1A" }];
// Mismos colores que las tarjetas de indicadores
const METRICS = [
  { key: "visitors", label: "Visitantes", short: "Visitantes", color: "#ededed" },
  { key: "pageviews", label: "Páginas vistas", short: "Páginas", color: "#bebebe" },
  { key: "searches", label: "Búsquedas", short: "Búsquedas", color: "#a2a2a2" },
  { key: "new_users", label: "Usuarios nuevos", short: "Usuarios", color: "#d1d1d1" },
  { key: "questions", label: "Preguntas a la IA", short: "Preguntas IA", color: "#fafafa" },
];
const PROVIDER_COLORS = { xai: "var(--bh-accretion)", openai: "var(--bh-good)", gemini: "var(--bh-violet)", reglas: "var(--bh-faint)" };
const DEVICE = [
  { key: "mobile", label: "Celular", icon: Smartphone, color: "#ededed" },
  { key: "desktop", label: "Computador", icon: Monitor, color: "#a2a2a2" },
  { key: "tablet", label: "Tableta", icon: Tablet, color: "#fafafa" },
];

function Panel({ title, eyebrow, action, className = "", children }) {
  return (
    <section className={`bh-panel bh-hud ${className}`}>
      <header className="bh-head">
        <div>
          {eyebrow && <p className="bh-eyebrow">{eyebrow}</p>}
          <h2 className="bh-title">{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

// Tarjeta de un indicador: ícono, cifra que sube contando, cambio frente al periodo anterior y su curva
function Kpi({ label, icon: Icon, kpi, series, hint, color }) {
  const peak = Math.max(0, ...series);
  const today = series.at(-1) ?? 0;
  return (
    <div className="bh-kpi" style={{ "--kc": color }}>
      <div className="bh-kpi-top">
        <span className="bh-kpi-icon"><Icon className="h-4 w-4" aria-hidden="true" /></span>
        <span className="bh-kpi-label">{label}</span>
      </div>
      <div className="bh-kpi-value">
        <strong><CountUp value={kpi.value} /></strong>
        <Delta value={kpi.value} previous={kpi.previous} />
      </div>
      <small>{hint ?? (peak ? `Hoy ${fmt(today)} · récord ${fmt(peak)} al día` : "Sin datos todavía")}</small>
      <SparkArea values={series} color={color} />
    </div>
  );
}

// Costo estimado de IA: cifra, proyección al mes y una barra que reparte el gasto (búsquedas vs. asistente)
function CostKpi({ cost, search, assistant }) {
  const total = search + assistant;
  const pct = total ? (search / total) * 100 : 50;
  return (
    <div className="bh-kpi bh-kpi-cost" style={{ "--kc": "#cbd5e1" }}>
      <div className="bh-kpi-top">
        <span className="bh-kpi-icon"><Coins className="h-4 w-4" aria-hidden="true" /></span>
        <span className="bh-kpi-label">Costo de IA</span>
      </div>
      <div className="bh-kpi-value">
        <strong><CountUp value={cost.value} format={fmtUsd} /></strong>
      </div>
      <small>Estimado · ≈ {fmtUsd(cost.monthly)} al mes</small>
      <div className="bh-split" role="img" aria-label={`Búsquedas ${fmtUsd(search)}, asistente ${fmtUsd(assistant)}`}>
        <i style={{ width: `${pct}%` }} />
        <i style={{ width: `${100 - pct}%` }} />
      </div>
      <div className="bh-split-legend">
        <span><b style={{ background: "#bebebe" }} />Búsquedas</span>
        <span><b style={{ background: "#fafafa" }} />Asistente</span>
      </div>
    </div>
  );
}

// Pendientes: total arriba y cada tarea con su ícono, qué hay que hacer y su número.
// Las que tienen trabajo brillan; las que están al día se ven apagadas con un ✓.
function Alerts({ pending }) {
  const items = [
    { to: "/admin/solicitudes", label: "Solicitudes de negocios", hint: "Llama, verifica y aprueba", icon: Store, value: pending?.claims },
    { to: "/admin/resenas", label: "Reseñas por moderar", hint: "Publica o rechaza", icon: MessageSquareText, value: pending?.reviews },
    { to: "/admin/resenas?estado=reported", label: "Reportes abiertos", hint: "Revisa lo que reportaron", icon: Flag, value: pending?.reports },
    { to: "/admin/duplicados", label: "Posibles duplicados", hint: "Une o descarta pares", icon: Copy, value: pending?.duplicates },
  ];
  const loaded = pending != null;
  const total = items.reduce((s, it) => s + (it.value ?? 0), 0);
  return (
    <div className="bh-todo">
      <div className={`bh-todo-total ${loaded && total === 0 ? "is-done" : ""}`}>
        {loaded && total === 0 ? (
          <>
            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
            <div><strong>Todo al día</strong><span>No hay nada pendiente</span></div>
          </>
        ) : (
          <>
            <strong className="bh-num"><CountUp value={total} /></strong>
            <div><strong>tareas pendientes</strong><span>en {items.filter((i) => i.value).length} secciones</span></div>
          </>
        )}
      </div>
      <ul className="bh-alerts">
        {items.map(({ to, label, hint, icon: Icon, value }) => (
          <li key={to}>
            <Link to={to} className={`bh-alert ${value ? "is-hot" : "is-done"}`}>
              <span className="bh-alert-icon"><Icon className="h-4 w-4" aria-hidden="true" /></span>
              <span className="bh-alert-text">
                <b>{label}</b>
                <small>{value ? hint : "Al día"}</small>
              </span>
              {value ? <strong className="bh-alert-count">{fmt(value)}</strong>
                : <Check className="bh-alert-check h-4 w-4" aria-label="Al día" />}
              <ChevronRight className="bh-alert-go h-4 w-4" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Pulso: pestañas con el total de cada métrica, cifras del periodo y la gráfica con el periodo anterior
function Pulse({ data, metric, setMetric }) {
  const active = METRICS.find((m) => m.key === metric);
  const values = data.series[metric];
  const previous = data.series_prev?.[metric];
  const total = values.reduce((a, b) => a + b, 0);
  const prevTotal = previous ? previous.reduce((a, b) => a + b, 0) : undefined;
  const best = values.reduce((b, v, i) => (v > values[b] ? i : b), 0);
  const fmtDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  return (
    <>
      <div className="bh-pulse-tabs" role="group" aria-label="Métrica">
        {METRICS.map((m) => (
          <button key={m.key} type="button" aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}
                  style={{ "--kc": m.color }}>
            <i />
            <span title={m.label}>{m.short}</span>
            <b className="bh-num">{fmt(data.series[m.key].reduce((a, c) => a + c, 0))}</b>
          </button>
        ))}
      </div>
      <div className="bh-pulse-stats" style={{ "--kc": active.color }}>
        <div className="is-main">
          <span>Total del periodo</span>
          <strong><CountUp value={total} /></strong>
          {prevTotal !== undefined && <Delta value={total} previous={prevTotal} />}
        </div>
        <div><span>Promedio diario</span><strong>{(total / values.length).toLocaleString("es-CO", { maximumFractionDigits: 1 })}</strong></div>
        <div><span>Mejor día</span><strong>{values[best] ? `${fmt(values[best])}` : "–"}</strong><small>{values[best] ? fmtDay(data.dates[best]) : ""}</small></div>
        <div><span>Hoy</span><strong>{fmt(values.at(-1) ?? 0)}</strong></div>
      </div>
      <PulseChart dates={data.dates} values={values} previous={previous} label={active.label} color={active.color} />
      {previous && (
        <p className="bh-pulse-legend">
          <span><i style={{ background: active.color }} />Este periodo</span>
          <span><i className="is-prev" />Periodo anterior</span>
        </p>
      )}
    </>
  );
}

// Tráfico: anillo por dispositivo, tarjetitas con su cantidad, fuentes de visitas y quién entra con sesión
function Traffic({ traffic }) {
  const total = DEVICE.reduce((sum, d) => sum + traffic.devices[d.key], 0);
  const share = (v) => (total ? Math.round((v / total) * 100) : 0);
  const sources = traffic.referrers;
  const maxSource = Math.max(1, ...sources.map((r) => r.count));
  const logged = traffic.logged_in_pct;
  return (
    <div className="bh-traffic">
      <div className="bh-traffic-devices">
        <SegmentRing items={DEVICE.map((d) => ({ label: d.label, value: traffic.devices[d.key], color: d.color }))} label="sin visitas" />
        <ul>
          {DEVICE.map(({ key, label, icon: Icon, color }) => (
            <li key={key} style={{ "--kc": color }}>
              <span className="bh-traffic-icon"><Icon className="h-4 w-4" aria-hidden="true" /></span>
              <span className="bh-traffic-name">{label}</span>
              <b className="bh-num">{fmt(traffic.devices[key])}</b>
              <small>{share(traffic.devices[key])}%</small>
              <i className="bh-traffic-bar"><em style={{ width: `${share(traffic.devices[key])}%` }} /></i>
            </li>
          ))}
        </ul>
      </div>

      <p className="bh-eyebrow">De dónde llegan</p>
      {sources.length ? (
        <ul className="bh-sources">
          {sources.map((r) => {
            const name = r.source === "directo" ? "Directo o WhatsApp" : r.source;
            return (
              <li key={r.source}>
                <span className="bh-source-badge">{r.source === "directo" ? "↗" : name[0].toUpperCase()}</span>
                <span className="bh-source-name">{name}</span>
                <b className="bh-num">{fmt(r.count)}</b>
                <i className="bh-traffic-bar"><em style={{ width: `${(r.count / maxSource) * 100}%` }} /></i>
              </li>
            );
          })}
        </ul>
      ) : <p className="bh-note">Sin visitas registradas todavía.</p>}

      <div className="bh-session">
        <div className="bh-session-bar" role="img" aria-label={`Con sesión ${logged}%, sin sesión ${100 - logged}%`}>
          <i style={{ width: `${logged}%` }} />
        </div>
        <div className="bh-session-legend">
          <span><b className="is-in" />Con sesión <strong>{logged}%</strong></span>
          <span><b />Sin sesión <strong>{Math.round((100 - logged) * 10) / 10}%</strong></span>
        </div>
      </div>
    </div>
  );
}

// Crecimiento (minimalista): las 4 etapas del recorrido como cifras con una línea fina, el porcentaje que
// pasa de una etapa a la otra y una sola línea de retención.
function Growth({ users, days }) {
  const stages = [
    { label: "Cuentas", value: users.total },
    { label: "Confirmaron", value: users.verified },
    { label: "Buscaron", value: users.searched },
    { label: "Activos 7 días", value: users.active_7d },
  ];
  const top = Math.max(1, users.total);
  return (
    <Panel className="bh-report" eyebrow="Nº 006 · Crecimiento" title="De visitante a usuario fiel">
      <ol className="bh-min-steps">
        {stages.map(({ label, value }, i) => (
          <li key={label}>
            <strong className="bh-num"><CountUp value={value} /></strong>
            <span>{label}</span>
            <i aria-hidden="true"><u style={{ width: `${(value / top) * 100}%` }} /></i>
            {i > 0 && (
              <small className="bh-num" title="De la etapa anterior">
                {stages[i - 1].value ? `↳ ${Math.round((value / stages[i - 1].value) * 100)}%` : "—"}
              </small>
            )}
          </li>
        ))}
      </ol>
      <dl className="bh-min-facts">
        <div>
          <dt>Volvieron a buscar</dt>
          <dd className="bh-num">{users.active_in_range ? `${fmt(users.returning_pct)}%` : "—"}</dd>
          <small>{users.active_in_range ? `${fmt(users.returning)} de ${fmt(users.active_in_range)} activos` : `sin actividad en ${days} días`}</small>
        </div>
        <div><dt>Propietarios</dt><dd className="bh-num">{fmt(users.owners)}</dd></div>
      </dl>
    </Panel>
  );
}

// IA y costos (minimalista): respuestas y gasto como cifras, una barra fina por proveedor con su leyenda en
// texto, y los datos del asistente y del costo por búsqueda en una línea.
function AiCosts({ ai, cost }) {   // cost = kpis.ai_cost: { value, monthly }
  const providers = [...ai.usage].sort((a, b) => b.count - a.count);
  const total = providers.reduce((sum, item) => sum + item.count, 0);
  const shades = ["#f2f2f2", "#a8a8a8", "#6b6b6b", "#3f3f3f"];
  return (
    <Panel className="bh-report" eyebrow="Nº 007 · IA y costos" title="Quién responde y cuánto cuesta">
      <div className="bh-min-pair">
        <div><span>Respuestas</span><strong className="bh-num"><CountUp value={total} /></strong></div>
        <div>
          <span>Gasto estimado</span>
          <strong className="bh-num"><CountUp value={cost.value} format={fmtUsd} /></strong>
          <small>≈ {fmtUsd(cost.monthly)} / mes</small>
        </div>
      </div>
      <div className="bh-min-bar" aria-hidden="true">
        {providers.filter((p) => p.count > 0).map((p, i) => (
          <i key={p.provider} style={{ flexGrow: p.count, background: shades[i] ?? shades[3] }} />
        ))}
      </div>
      <ul className="bh-min-legend" aria-label="Respuestas por proveedor">
        {providers.map((p, i) => (
          <li key={p.provider}>
            <i style={{ background: shades[i] ?? shades[3] }} aria-hidden="true" />
            {p.label} <b className="bh-num">{total ? `${Math.round((p.count / total) * 100)}%` : "—"}</b>
          </li>
        ))}
      </ul>
      <dl className="bh-min-facts">
        <div><dt>Búsquedas</dt><dd className="bh-num">{fmtUsd(ai.search_cost)}</dd></div>
        <div><dt>Asistente</dt><dd className="bh-num">{fmtUsd(ai.assistant_cost)}</dd></div>
        <div><dt>Respuesta</dt><dd className="bh-num">{ai.assistant.avg_seconds == null ? "—" : `${fmt(ai.assistant.avg_seconds)} s`}</dd></div>
        <div><dt>Calificación</dt><dd className="bh-num">{ai.assistant.rating_avg == null ? "—" : `${fmt(ai.assistant.rating_avg)}/5`}</dd></div>
      </dl>
      <p className="bh-min-note">
        Por búsqueda: Grok ≈ {fmtUsd(ai.cost_per_search.xai)} · OpenAI ≈ {fmtUsd(ai.cost_per_search.openai)} · Gemini gratis
      </p>
    </Panel>
  );
}

// Esqueleto con la forma del dashboard: mientras llegan los datos no hay saltos ni textos de "cargando"
function DashboardSkeleton() {
  return (
    <div className="bh" aria-busy="true" aria-label="Cargando el panel">
      <div className="bh-grid-layout bh-skeleton-grid">
        <div className="bh-ghost bh-span-12" style={{ height: 360 }} />
        <div className="bh-kpis bh-span-12">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="bh-ghost" style={{ height: 118 }} />)}
        </div>
        <div className="bh-ghost bh-span-8" style={{ height: 380 }} />
        <div className="bh-ghost bh-span-4" style={{ height: 380 }} />
      </div>
    </div>
  );
}

// La animación de entrada (paneles que suben uno tras otro, curvas que se dibujan, cifras que cuentan) se hace
// solo la primera vez en la sesión. Al volver desde otra sección todo aparece directo, sin repetirla.
let introPlayed = false;

export default function AdminOverview() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [chosenMetric, setMetric] = useState(null);
  const { data, error, loading } = useApiData((opts) => api.admin.dashboard(days, opts), [days]);
  const { data: overview } = useApiData((opts) => api.admin.overview(opts), []);
  const [calm] = useState(() => introPlayed);
  useEffect(() => {
    if (!data || introPlayed) return;
    introPlayed = true;
    settleCounts();
  }, [data]);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <DashboardSkeleton />;

  const { kpis, series, traffic, users, search, ai, business, content } = data;
  const today = series.searches.at(-1) + series.pageviews.at(-1) + series.questions.at(-1);
  // Sin elegir, la gráfica abre en la primera métrica con datos (las visitas se cuentan desde esta versión)
  const metric = chosenMetric ?? (METRICS.find((m) => series[m.key].some(Boolean)) ?? METRICS[0]).key;
  const claims = business.claims;
  const pendingClaims = (claims.claim_pending ?? 0) + (claims.register_pending ?? 0);

  return (
    <div className={`bh ${loading ? "is-refreshing" : ""} ${calm ? "bh-calm" : ""}`}>
      <div className={`bh-grid-layout ${calm ? "" : "bh-reveal"}`}>
        {/* ------------------------------ Hero ------------------------------ */}
        <section className="bh-hero bh-span-12" aria-labelledby="bh-title">
          <div className="bh-hero-top">
            <div>
              <p className="bh-eyebrow">Nº 001 · Panel de {user.full_name.split(" ")[0]}</p>
              <h1 id="bh-title">Horizonte <em>de eventos</em></h1>
              <p className="bh-hero-sub">Todo lo que pasa en Easy Search cae hacia aquí: visitas, búsquedas, usuarios, IA y negocios.</p>
            </div>
            <div className="bh-pills" role="group" aria-label="Periodo">
              {PERIODS.map((p) => (
                <button key={p.days} type="button" aria-pressed={days === p.days} onClick={() => setDays(p.days)}>{p.label}</button>
              ))}
            </div>
          </div>
          <div className="bh-hero-meta">
            <span>Actividad de hoy: <strong>{fmt(today)}</strong> eventos</span>
            <span>Periodo: <strong>últimos {days} días</strong></span>
          </div>
        </section>

        {/* ------------------------------ KPIs ------------------------------ */}
        <div className="bh-kpis bh-span-12">
          <Kpi label="Visitantes" icon={Users} kpi={kpis.visitors} series={series.visitors} color="#ededed" />
          <Kpi label="Páginas vistas" icon={Eye} kpi={kpis.pageviews} series={series.pageviews} color="#bebebe" />
          <Kpi label="Búsquedas" icon={Search} kpi={kpis.searches} series={series.searches} color="#a2a2a2" />
          <Kpi label="Usuarios nuevos" icon={UserPlus} kpi={kpis.new_users} series={series.new_users} color="#d1d1d1" />
          <Kpi label="Preguntas a la IA" icon={Bot} kpi={kpis.questions} series={series.questions} color="#fafafa" />
          <CostKpi cost={kpis.ai_cost} search={ai.search_cost} assistant={ai.assistant_cost} />
        </div>

        {/* ------------------------------ Pulso ------------------------------ */}
        <Panel className="bh-span-8" eyebrow="Nº 002 · Pulso" title="Cómo se mueve la app">
          <Pulse data={data} metric={metric} setMetric={setMetric} />
        </Panel>

        <Panel className="bh-span-4" eyebrow="Nº 003 · Pendientes" title="Lo que te espera">
          <Alerts pending={overview?.pending} />
        </Panel>

        {/* ------------------------------ Tráfico ------------------------------ */}
        <Panel className="bh-span-7" eyebrow="Nº 004 · Horas pico" title="Cuándo entra la gente">
          <PeakHeatmap grid={traffic.heatmap} />
        </Panel>

        <Panel className="bh-span-5" eyebrow="Nº 005 · Tráfico" title="Desde dónde llegan">
          <Traffic traffic={traffic} />
        </Panel>

        <div className="bh-reports bh-span-12">
          <Growth users={users} days={days} />
          <AiCosts ai={ai} cost={kpis.ai_cost} />
        </div>

        {/* ------------------------------ Búsquedas ------------------------------ */}
        <Panel className="bh-span-6" eyebrow="Nº 008 · Demanda" title="Lo que más busca la gente"
               action={<Link to="/admin/busquedas" className="bh-link">Ver todo</Link>}>
          <WordCloud words={search.top_queries} />
          <p className="bh-note">
            Sin resultados: <strong>{search.zero_pct}%</strong> de las búsquedas ({fmt(search.zero_results)}). Eso es demanda que la app todavía no cubre.
          </p>
        </Panel>

        <Panel className="bh-span-6" eyebrow="Nº 009 · Oferta vs demanda" title="Categorías que piden más negocios">
          {search.demand.length ? (
            <div className="bh-scroll">
              <table className="bh-table">
                <thead><tr><th>Categoría</th><th>Búsquedas</th><th>Negocios</th><th>Por negocio</th></tr></thead>
                <tbody>
                  {search.demand.map((d) => (
                    <tr key={d.slug}>
                      <td>{d.name}</td>
                      <td className="bh-num">{fmt(d.searches)}</td>
                      <td className="bh-num">{fmt(d.businesses)}</td>
                      <td className="bh-num" style={{ color: d.businesses === 0 || d.searches / d.businesses > 2 ? "var(--bh-accretion)" : undefined }}>
                        {d.businesses ? (d.searches / d.businesses).toFixed(1) : "∞"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="bh-note">Todavía no hay búsquedas con categoría en este periodo.</p>}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="bh-eyebrow mb-2">Sin resultados</p>
              <BarList items={search.zero_queries.map((q) => ({ label: q.query, value: q.count }))} color="var(--bh-bad)" empty="Ninguna. Todo se encontró." />
            </div>
            <div>
              <p className="bh-eyebrow mb-2">Lugares más buscados</p>
              <BarList items={search.places.map((p) => ({ label: p.place, value: p.count }))} color="var(--bh-accretion)" />
            </div>
          </div>
        </Panel>

        {/* ------------------------------ Negocios ------------------------------ */}
        <Panel className="bh-span-12" eyebrow="Nº 010 · Negocios" title="Del mapa a la verificación">
          <Funnel steps={[
            { label: "Negocios activos", value: business.active },
            { label: "Con dueño", value: business.with_owner },
            { label: "Verificados", value: business.verified },
            { label: "Completos (horario, precios y descripción)", value: business.complete },
          ]} />
          <div className="bh-stat-row mt-4">
            <div className="bh-stat"><span>Solicitudes pendientes</span><strong>{fmt(pendingClaims)}</strong></div>
            <div className="bh-stat"><span>Registros aprobados</span><strong>{fmt(claims.register_approved ?? 0)}</strong></div>
            <div className="bh-stat"><span>Reseñas publicadas</span><strong>{fmt(content.reviews.approved)}</strong></div>
            <div className="bh-stat"><span>Calificación promedio</span><strong>{content.rating_avg ? `${content.rating_avg}★` : "–"}</strong></div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
