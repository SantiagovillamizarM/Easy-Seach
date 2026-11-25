import {
  ArrowUpRight, Bot, Check, CheckCircle2, ChevronRight, Coins, Copy, Eye, Flag, MessageSquareText, Search, Store, UserPlus, Users,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  BarList, CountUp, Delta, DotHeatmap, Donut, Funnel, PulseChart, RadialRing, SparkArea, WordCloud, fmt, fmtUsd,
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
  { key: "visitors", label: "Visitantes", short: "Visitantes", color: "#7dd3fc" },
  { key: "pageviews", label: "Páginas vistas", short: "Páginas", color: "#60a5fa" },
  { key: "searches", label: "Búsquedas", short: "Búsquedas", color: "#3b82f6" },
  { key: "new_users", label: "Usuarios nuevos", short: "Usuarios", color: "#22d3ee" },
  { key: "questions", label: "Preguntas a la IA", short: "Preguntas IA", color: "#a5c8ff" },
];
const PROVIDER_COLORS = { xai: "var(--bh-accretion)", openai: "var(--bh-good)", gemini: "var(--bh-violet)", reglas: "var(--bh-faint)" };
const DEVICE = [
  { key: "mobile", label: "Celular", color: "var(--bh-accretion)" },
  { key: "desktop", label: "Computador", color: "var(--bh-violet)" },
  { key: "tablet", label: "Tableta", color: "var(--bh-pink)" },
];
const SECTION_LABEL = {
  inicio: "Inicio", buscar: "Resultados", lugar: "Página de un negocio", asistente: "Asistente IA", perfil: "Perfil",
  favoritos: "Favoritos", historial: "Historial", panel: "Panel del dueño", "registrar-negocio": "Registrar negocio",
  cuenta: "Ingreso y registro", otras: "Otras",
};

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
        <span><b style={{ background: "#60a5fa" }} />Búsquedas</span>
        <span><b style={{ background: "#cbd5e1" }} />Asistente</span>
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

function Ticker({ feed }) {
  if (!feed.length) return null;
  const KIND = { usuario: "USR", busqueda: "BUS", solicitud: "SOL", resena: "RES" };
  const line = feed.map((e, i) => (
    <span key={i}>
      <b>{KIND[e.kind] ?? "EVT"} · {new Date(e.at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</b>
      {e.text}
    </span>
  ));
  return (
    <div className="bh-ticker" aria-label="Actividad reciente">
      <div className="bh-ticker-track">{line}</div>
      <div className="bh-ticker-track" aria-hidden="true">{line}</div>
    </div>
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

export default function AdminOverview() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [chosenMetric, setMetric] = useState(null);
  const { data, error, loading } = useApiData((opts) => api.admin.dashboard(days, opts), [days]);
  const { data: overview } = useApiData((opts) => api.admin.overview(opts), []);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <DashboardSkeleton />;

  const { kpis, series, traffic, users, search, ai, business, content } = data;
  const today = series.searches.at(-1) + series.pageviews.at(-1) + series.questions.at(-1);
  // Sin elegir, la gráfica abre en la primera métrica con datos (las visitas se cuentan desde esta versión)
  const metric = chosenMetric ?? (METRICS.find((m) => series[m.key].some(Boolean)) ?? METRICS[0]).key;
  const deviceTotal = DEVICE.reduce((s, d) => s + traffic.devices[d.key], 0);
  const aiItems = ai.usage.map((u) => ({ label: u.label, value: u.count, color: PROVIDER_COLORS[u.provider] ?? "var(--bh-faint)" }));
  const aiTotal = aiItems.reduce((s, i) => s + i.value, 0);
  const claims = business.claims;
  const pendingClaims = (claims.claim_pending ?? 0) + (claims.register_pending ?? 0);

  return (
    <div className={`bh ${loading ? "is-refreshing" : ""}`}>
      <div className="bh-grid-layout bh-reveal">
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
          <Kpi label="Visitantes" icon={Users} kpi={kpis.visitors} series={series.visitors} color="#7dd3fc" />
          <Kpi label="Páginas vistas" icon={Eye} kpi={kpis.pageviews} series={series.pageviews} color="#60a5fa" />
          <Kpi label="Búsquedas" icon={Search} kpi={kpis.searches} series={series.searches} color="#3b82f6" />
          <Kpi label="Usuarios nuevos" icon={UserPlus} kpi={kpis.new_users} series={series.new_users} color="#22d3ee" />
          <Kpi label="Preguntas a la IA" icon={Bot} kpi={kpis.questions} series={series.questions} color="#a5c8ff" />
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
          <DotHeatmap grid={traffic.heatmap} />
        </Panel>

        <Panel className="bh-span-5" eyebrow="Nº 005 · Tráfico" title="Desde dónde llegan">
          <div className="grid items-center gap-4 sm:grid-cols-2">
            <RadialRing items={DEVICE.map((d) => ({ label: d.label, value: traffic.devices[d.key], color: d.color }))}
                        center={`${deviceTotal ? Math.round((traffic.devices.mobile / deviceTotal) * 100) : 0}%`} sub="desde celular" />
            <div className="space-y-4">
              <ul className="bh-legend">
                {DEVICE.map((d) => (
                  <li key={d.key}><i style={{ background: d.color }} /><span>{d.label}</span><span className="bh-num">{fmt(traffic.devices[d.key])}</span></li>
                ))}
              </ul>
              <BarList items={traffic.referrers.map((r) => ({ label: r.source === "directo" ? "Directo o WhatsApp" : r.source, value: r.count }))}
                       empty="Sin visitas registradas todavía." />
            </div>
          </div>
          <p className="bh-note mt-3">Con sesión iniciada: <strong>{traffic.logged_in_pct}%</strong> de las páginas vistas.</p>
        </Panel>

        {/* ------------------------------ Usuarios ------------------------------ */}
        <Panel className="bh-span-7" eyebrow="Nº 006 · Crecimiento" title="De visitante a usuario fiel">
          <Funnel steps={[
            { label: "Cuentas creadas", value: users.total },
            { label: "Correo confirmado", value: users.verified },
            { label: "Hicieron al menos una búsqueda", value: users.searched },
            { label: "Activos en los últimos 7 días", value: users.active_7d },
          ]} />
          <div className="bh-stat-row mt-4">
            <div className="bh-stat"><span>Volvieron otro día</span><strong>{users.returning_pct}%</strong></div>
            <div className="bh-stat"><span>Activos en el periodo</span><strong>{fmt(users.active_in_range)}</strong></div>
            <div className="bh-stat"><span>Propietarios</span><strong>{fmt(users.owners)}</strong></div>
          </div>
        </Panel>

        {/* ------------------------------ IA ------------------------------ */}
        <Panel className="bh-span-5" eyebrow="Nº 007 · IA y costos" title="Quién responde y cuánto cuesta">
          <div className="flex flex-wrap items-center gap-5">
            <div className="relative">
              <Donut items={aiItems} />
              <div className="absolute inset-0 grid place-content-center text-center">
                <strong className="bh-num text-lg">{fmt(aiTotal)}</strong>
                <span className="text-[0.62rem] text-[var(--bh-mute)]">respuestas</span>
              </div>
            </div>
            <ul className="bh-legend min-w-[150px] flex-1">
              {aiItems.map((i) => (
                <li key={i.label}><i style={{ background: i.color }} /><span>{i.label}</span><span className="bh-num">{fmt(i.value)}</span></li>
              ))}
            </ul>
          </div>
          <div className="bh-stat-row mt-4">
            <div className="bh-stat"><span>Búsquedas con IA paga</span><strong>{fmtUsd(ai.search_cost)}</strong></div>
            <div className="bh-stat"><span>Asistente</span><strong>{fmtUsd(ai.assistant_cost)}</strong></div>
            <div className="bh-stat"><span>Respuesta del asistente</span><strong>{ai.assistant.avg_seconds ? `${ai.assistant.avg_seconds} s` : "–"}</strong></div>
            <div className="bh-stat"><span>Calificación del asistente</span><strong>{ai.assistant.rating_avg ? `${ai.assistant.rating_avg}/5` : "–"}</strong></div>
          </div>
          <p className="bh-note mt-3">
            Estimado con los tokens medidos: una búsqueda con Grok ≈ {fmtUsd(ai.cost_per_search.xai)}; con OpenAI ≈ {fmtUsd(ai.cost_per_search.openai)}. Gemini es gratis.
          </p>
        </Panel>

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
        <Panel className="bh-span-5" eyebrow="Nº 010 · Negocios" title="Del mapa a la verificación">
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

        <Panel className="bh-span-7" eyebrow="Nº 011 · Monetización" title="Clientes potenciales"
               action={<span className="bh-note">Sin dueño, pero la gente los busca</span>}>
          {business.leads.length ? (
            <div className="bh-scroll">
              <table className="bh-table">
                <thead><tr><th>Negocio</th><th>Visitas</th><th>En favoritos</th></tr></thead>
                <tbody>
                  {business.leads.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <Link to={`/lugar/${l.slug}`} className="inline-flex items-center gap-1">
                          {l.name}
                          <ArrowUpRight className="h-3 w-3 opacity-60" aria-hidden="true" />
                        </Link>
                      </td>
                      <td className="bh-num">{fmt(l.views)}</td>
                      <td className="bh-num">{fmt(l.favorites)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="bh-note">Cuando la gente visite páginas de negocios sin dueño, aparecerán aquí para ofrecerles un plan.</p>}
          <p className="bh-note mt-3">
            Páginas más visitadas: {traffic.sections.slice(0, 4).map((s) => `${SECTION_LABEL[s.section] ?? s.section} (${fmt(s.count)})`).join(" · ") || "sin datos"}.
          </p>
        </Panel>

        <div className="bh-span-12">
          <Ticker feed={data.feed} />
        </div>
      </div>
    </div>
  );
}
