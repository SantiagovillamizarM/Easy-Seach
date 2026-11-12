import { useEffect, useState } from "react";

// Página temporal de la Fase 0: verifica que frontend → backend → PostgreSQL/pgvector funcionan.
// En la Fase 4 se reemplaza por la página de inicio real con el buscador.
function StatusRow({ label, ok, value }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <span className="text-slate-600">{label}</span>
      <span
        className={`rounded-full px-3 py-1 text-sm font-medium ${
          ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
        }`}
      >
        {value}
      </span>
    </li>
  );
}

export default function App() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setHealth)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-12">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Easy <span className="text-brand-600">Search</span>
      </h1>
      <p className="mt-3 text-lg text-slate-600">
        Encuentra lo que necesitas escribiéndolo con tus palabras.
      </p>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Estado del sistema
        </h2>
        {error && (
          <p className="mt-4 text-rose-700">
            No se pudo conectar con el backend ({error}). ¿Está corriendo uvicorn en el puerto 8010?
          </p>
        )}
        {!error && !health && <p className="mt-4 text-slate-500">Verificando…</p>}
        {health && (
          <ul className="mt-2 divide-y divide-slate-100">
            <StatusRow label="API (FastAPI)" ok={health.api === "ok"} value={health.api} />
            <StatusRow label="PostgreSQL" ok={health.database === "ok"} value={health.database} />
            <StatusRow
              label="pgvector"
              ok={Boolean(health.pgvector)}
              value={health.pgvector ? `v${health.pgvector}` : "no instalado"}
            />
          </ul>
        )}
      </section>
    </main>
  );
}
