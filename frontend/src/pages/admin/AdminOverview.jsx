import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { ErrorBox, Loading, PageHeader, useApiData } from "../../components/admin/ui.jsx";
import { api } from "../../lib/api.js";

function TaskTile({ to, label, count, hint }) {
  const done = count === 0;
  return (
    <Link to={to} className="card group flex flex-col gap-1 p-4 transition hover:border-brand-200">
      <span className="text-sm font-semibold text-ink-soft">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-3xl font-extrabold tabular-nums">{count}</span>
        {done && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-open">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Al día
          </span>
        )}
      </span>
      <span className="mt-auto flex items-center gap-1 text-xs text-ink-soft group-hover:text-brand-700">
        {hint}
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </span>
    </Link>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="text-xl font-bold tabular-nums">{Number(value).toLocaleString("es-CO")}</dd>
    </div>
  );
}

// Medidor de completitud: un solo color, el valor escrito al lado (nunca solo color)
function Meter({ label, value, total }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <li>
      <div className="mb-1 flex justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-ink-soft">
          <strong className="font-semibold text-ink">{pct}%</strong> · {value.toLocaleString("es-CO")} de {total.toLocaleString("es-CO")}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(pct, value > 0 ? 1 : 0)}%` }} />
      </div>
    </li>
  );
}

export default function AdminOverview() {
  const { data, error, loading } = useApiData((opts) => api.admin.overview(opts), []);

  if (error) return <ErrorBox message={error} />;
  if (loading && !data) return <Loading />;

  const { pending, establishments: est, completeness: c, users, reviews, searches_7d: s } = data;
  return (
    <>
      <PageHeader title="Resumen" description="Tareas pendientes y estado general de la información." />

      <section aria-label="Tareas pendientes" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <TaskTile to="/admin/resenas" label="Reseñas por revisar" count={pending.reviews} hint="Moderar" />
        <TaskTile to="/admin/resenas?estado=reported" label="Reportes abiertos" count={pending.reports} hint="Revisar reportes" />
        <TaskTile to="/admin/solicitudes" label="Solicitudes de propiedad" count={pending.claims} hint="Verificar" />
        <TaskTile to="/admin/duplicados" label="Posibles duplicados" count={pending.duplicates} hint="Revisar pares" />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className="card p-5">
          <h2 className="font-bold">Calidad de la información</h2>
          <p className="mb-4 text-xs text-ink-soft">
            Negocios activos que tienen cada dato. Lo que falta no se puede mostrar ni usar en las recomendaciones.
          </p>
          <ul className="space-y-4">
            <Meter label="Con horario" value={c.with_hours} total={est.active} />
            <Meter label="Con precios" value={c.with_prices} total={est.active} />
            <Meter label="Con descripción" value={c.with_description} total={est.active} />
            <Meter label="Con productos o servicios" value={c.with_offerings} total={est.active} />
            <Meter label="Con fotos" value={c.with_photos} total={est.active} />
            <Meter label="Administrados por su dueño" value={est.with_owner} total={est.active} />
          </ul>
        </section>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 font-bold">Negocios</h2>
            <dl className="grid grid-cols-3 gap-4">
              <Stat label="Activos" value={est.active} />
              <Stat label="Verificados" value={est.verified} />
              <Stat label="Ocultos o duplicados" value={est.hidden + est.duplicate} />
            </dl>
          </section>
          <section className="card p-5">
            <h2 className="mb-3 font-bold">Comunidad</h2>
            <dl className="grid grid-cols-3 gap-4">
              <Stat label="Usuarios" value={users.total} />
              <Stat label="Propietarios" value={users.owners} />
              <Stat label="Reseñas publicadas" value={reviews.approved} />
            </dl>
          </section>
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-bold">Búsquedas (últimos 7 días)</h2>
              <Link to="/admin/busquedas" className="text-xs font-semibold text-brand-700 hover:underline">Ver estadísticas</Link>
            </div>
            <dl className="grid grid-cols-3 gap-4">
              <Stat label="Búsquedas" value={s.total} />
              <Stat label="Sin resultados" value={s.zero_results} />
              <Stat label="Con resultados" value={s.total - s.zero_results} />
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
