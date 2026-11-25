import { ArrowUpRight, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AreaChart, BarList, Delta, DotHeatmap, Donut, Funnel, RadialRing, Sparkline, WordCloud, fmt, fmtUsd,
} from "../../components/admin/blackhole/Charts.jsx";
import { ErrorBox, useApiData } from "../../components/admin/ui.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { api } from "../../lib/api.js";
import "./black-hole.css";

// Dashboard del administrador: "Horizonte de eventos". Todo lo que pasa en la app cae hacia el centro:
// visitas, búsquedas, usuarios, preguntas a la IA y negocios. Se ve solo con rol admin.

const PERIODS = [{ days: 7, label: "7D" }, { days: 30, label: "30D" }, { days: 90, label: "90D" }, { days: 365, label: "1A" }];
const METRICS = [
  { key: "visitors", label: "Visitantes", color: "var(--bh-pink)" },
  { key: "pageviews", label: "Páginas vistas", color: "var(--bh-violet)" },
  { key: "searches", label: "Búsquedas", color: "var(--bh-accretion)" },
  { key: "new_users", label: "Usuarios nuevos", color: "var(--bh-good)" },
  { key: "questions", label: "Preguntas a la IA", color: "#8ec5ff" },
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

function Kpi({ label, kpi, series, hint, color, value }) {
  return (
    <div className="bh-kpi">
      <p className="bh-kpi-label">{label}</p>
      <div className="bh-kpi-value">
        <strong>{value ?? fmt(kpi.value)}</strong>
        {kpi.previous !== undefined && <Delta value={kpi.value} previous={kpi.previous} />}
      </div>
      {hint && <small>{hint}</small>}
      {series && <Sparkline values={series} color={color} />}
    </div>
  );
}

function Alerts({ pending }) {
  const items = [
    { to: "/admin/solicitudes", label: "Solicitudes de negocios", value: pending?.claims },
    { to: "/admin/resenas", label: "Reseñas por moderar", value: pending?.reviews },
    { to: "/admin/resenas?estado=reported", label: "Reportes abiertos", value: pending?.reports },
    { to: "/admin/duplicados", label: "Posibles duplicados", value: pending?.duplicates },
  ];
  return (
    <ul className="bh-alerts">
      {items.map((it) => (
        <li key={it.to}>
          <Link to={it.to} className={`bh-alert ${it.value ? "is-hot" : ""}`}>
            <strong>{it.value ?? "–"}</strong>
            <span>{it.value === 0 ? `${it.label} · al día` : it.label}</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
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
  const active = METRICS.find((m) => m.key === metric);
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
          <Kpi label="Visitantes" kpi={kpis.visitors} series={series.visitors} color="var(--bh-pink)" hint="Únicos por día" />
          <Kpi label="Páginas vistas" kpi={kpis.pageviews} series={series.pageviews} color="var(--bh-violet)" />
          <Kpi label="Búsquedas" kpi={kpis.searches} series={series.searches} color="var(--bh-accretion)" />
          <Kpi label="Usuarios nuevos" kpi={kpis.new_users} series={series.new_users} color="var(--bh-good)" />
          <Kpi label="Preguntas a la IA" kpi={kpis.questions} series={series.questions} color="#8ec5ff" />
          <Kpi label="Costo de IA (estimado)" kpi={kpis.ai_cost} value={fmtUsd(kpis.ai_cost.value)}
               hint={`≈ ${fmtUsd(kpis.ai_cost.monthly)} al mes a este ritmo`} />
        </div>

        {/* ------------------------------ Pulso ------------------------------ */}
        <Panel className="bh-span-8" eyebrow="Nº 002 · Pulso" title="Cómo se mueve la app"
               action={(
                 <div className="bh-tabs" role="group" aria-label="Métrica">
                   {METRICS.map((m) => (
                     <button key={m.key} type="button" aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</button>
                   ))}
                 </div>
               )}>
          <AreaChart dates={data.dates} values={series[metric]} label={active.label} color={active.color} />
        </Panel>

        <Panel className="bh-span-4" eyebrow="Nº 003 · Pendientes" title="Lo que te espera">
          <Alerts pending={overview?.pending} />
          <p className="bh-note mt-3">Revisa las solicitudes pronto: cada negocio verificado es un posible cliente.</p>
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
