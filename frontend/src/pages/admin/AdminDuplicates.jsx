import { Check, ExternalLink, MapPin, Sparkles, Unlink } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Empty, ErrorBox, Flash, Loading, PageHeader, Pill, useApiData, useFlash } from "../../components/admin/ui.jsx";
import { api } from "../../lib/api.js";
import { notifyAdminChange } from "./AdminLayout.jsx";

// Cuál conviene conservar: el que tiene dueño, está verificado o tiene más información
function score(e) {
  return (e.owner ? 100 : 0) + (e.is_verified ? 50 : 0) + e.rating_count * 5 + e.photos_count * 3 + e.offerings_count * 2
    + (e.has_hours ? 4 : 0) + (e.has_description ? 4 : 0) + (e.phone ? 2 : 0) + (e.address ? 1 : 0) + (e.source !== "osm" ? 10 : 0);
}

function Side({ est, suggested, onKeep, busy }) {
  const facts = [
    est.address || "Sin dirección",
    est.phone ? `Tel. ${est.phone}` : "Sin teléfono",
    est.has_hours ? "Con horario" : "Sin horario",
    `${est.rating_count} reseñas · ${est.photos_count} fotos · ${est.offerings_count} productos`,
    est.owner ? `Dueño: ${est.owner.name}` : "Sin dueño",
  ];
  return (
    <div className={`flex flex-col rounded-xl border p-4 ${suggested ? "border-brand-200 bg-brand-50/40" : "border-line"}`}>
      <div className="flex items-start justify-between gap-2">
        <Link to={`/lugar/${est.slug}`} target="_blank" className="inline-flex items-center gap-1 font-semibold hover:underline">
          {est.name}
          <ExternalLink className="h-3.5 w-3.5 text-ink-soft" aria-hidden="true" />
        </Link>
        {suggested && (
          <Pill tone="brand">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Sugerido
          </Pill>
        )}
      </div>
      <p className="text-xs text-ink-soft">
        #{est.id} · {est.categories.map((c) => c.name).join(", ") || "Sin categoría"} · {est.source === "osm" ? "OpenStreetMap" : "Editado"}
      </p>
      <ul className="mt-2 flex-1 space-y-0.5 text-sm">
        {facts.map((f) => <li key={f}>{f}</li>)}
      </ul>
      <button type="button" className={`${suggested ? "btn-primary" : "btn-ghost"} mt-3 px-3 py-2 text-sm`} disabled={busy} onClick={onKeep}>
        <Check className="h-4 w-4" aria-hidden="true" />
        Conservar este
      </button>
    </div>
  );
}

function PairCard({ pair, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { a, b } = pair;
  const suggestedId = score(a) >= score(b) ? a.id : b.id;

  async function act(fn, message) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone(message);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const keep = (keepEst, dropEst) => {
    if (!window.confirm(`Se ocultará "${dropEst.name}" (#${dropEst.id}) como duplicado de #${keepEst.id}. Se puede revertir desde Negocios.`)) return;
    act(() => api.admin.updateEstablishment(dropEst.id, { status: "duplicate", duplicate_of_id: keepEst.id }), "Duplicado resuelto.");
  };

  return (
    <li className="card p-5">
      <p className="mb-3 flex flex-wrap items-center gap-3 text-sm text-ink-soft">
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          a {pair.distance_m} m
        </span>
        <span>Nombres {Math.round(pair.similarity * 100)}% parecidos</span>
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <Side est={a} suggested={suggestedId === a.id} busy={busy} onKeep={() => keep(a, b)} />
        <Side est={b} suggested={suggestedId === b.id} busy={busy} onKeep={() => keep(b, a)} />
      </div>
      <ErrorBox message={error} />
      <button type="button" className="btn-ghost mt-3 px-3 py-2 text-sm" disabled={busy}
        onClick={() => act(() => api.admin.dismissDuplicate(a.id, b.id), "Marcados como negocios distintos.")}>
        <Unlink className="h-4 w-4" aria-hidden="true" />
        No son duplicados (son lugares distintos)
      </button>
    </li>
  );
}

export default function AdminDuplicates() {
  const [flash, setFlash] = useFlash();
  const { data, error, loading, reload } = useApiData((opts) => api.admin.duplicates(opts), []);

  return (
    <>
      <PageHeader
        title="Posibles duplicados"
        description="Negocios activos con nombre parecido a menos de 200 m. OpenStreetMap a veces registra el mismo lugar dos veces (como punto y como edificio). Las cadenas como Terpel pueden tener sedes reales muy cerca: revisa antes de decidir."
      />
      <ErrorBox message={error} />
      {loading && !data && <Loading />}
      {data && data.length === 0 && <Empty>No hay posibles duplicados por revisar.</Empty>}
      {data && data.length > 0 && (
        <ul className={`space-y-4 ${loading ? "opacity-60" : ""}`}>
          {data.map((pair) => (
            <PairCard
              key={`${pair.a.id}-${pair.b.id}`}
              pair={pair}
              onDone={(message) => {
                setFlash(message);
                notifyAdminChange();
                reload();
              }}
            />
          ))}
        </ul>
      )}
      <Flash message={flash} />
    </>
  );
}
