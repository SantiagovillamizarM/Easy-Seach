import { Info } from "lucide-react";
import { ErrorBox, Loading, PageHeader, useApiData } from "../../components/admin/ui.jsx";
import { api } from "../../lib/api.js";

export default function AdminCategories() {
  const { data, error, loading } = useApiData((opts) => api.admin.categories(opts), []);
  const max = data?.length ? Math.max(1, ...data.map((c) => c.establishments)) : 1;

  return (
    <>
      <PageHeader title="Categorías" description="Cuántos negocios activos hay en cada categoría." />
      <p className="mb-4 flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm text-brand-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Las categorías se definen en el código (<code className="text-xs">backend/app/data/categories.py</code>) porque el
        buscador y la IA usan sus palabras clave para entender las consultas. Para agregar una nueva, se edita ese archivo.
      </p>
      <ErrorBox message={error} />
      {loading && !data && <Loading />}
      {data && (
        <section className="card p-5">
          <ul className="space-y-3">
            {data.map((c) => (
              <li key={c.id} className="grid gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,240px)_1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{c.name}</p>
                  <p className="truncate text-xs text-ink-soft">{c.description}</p>
                </div>
                <div className="h-2 rounded-full bg-slate-100" aria-hidden="true">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${(c.establishments / max) * 100}%` }} />
                </div>
                <span className="text-right text-sm font-semibold tabular-nums">
                  {c.establishments.toLocaleString("es-CO")}
                  <span className="sr-only"> negocios</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
