import { Check, Flag, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Empty,
  ErrorBox,
  Flash,
  FilterTabs,
  Loading,
  PageHeader,
  Pager,
  Pill,
  formatDate,
  useApiData,
  useFlash,
} from "../../components/admin/ui.jsx";
import { Stars } from "../../components/Stars.jsx";
import { api } from "../../lib/api.js";
import { notifyAdminChange } from "./AdminLayout.jsx";

const LIMIT = 20;
const REASONS = [
  "Lenguaje ofensivo o ataques personales",
  "Publicidad o spam",
  "No describe una experiencia real en el lugar",
  "Contiene datos personales",
];

function RejectForm({ onSubmit, onCancel, busy }) {
  const [reason, setReason] = useState(REASONS[0]);
  const [custom, setCustom] = useState("");
  return (
    <form
      className="mt-3 space-y-2 rounded-xl border border-line bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(reason === "otro" ? custom.trim() : reason);
      }}
    >
      <label htmlFor="reject-reason" className="block text-sm font-semibold">Motivo (lo verá el autor)</label>
      <select id="reject-reason" className="input py-2" value={reason} onChange={(e) => setReason(e.target.value)}>
        {REASONS.map((r) => <option key={r}>{r}</option>)}
        <option value="otro">Otro motivo…</option>
      </select>
      {reason === "otro" && (
        <input className="input py-2" maxLength={300} required placeholder="Escribe el motivo" aria-label="Otro motivo" value={custom} onChange={(e) => setCustom(e.target.value)} />
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn bg-closed px-3 py-2 text-sm text-white hover:opacity-90" disabled={busy}>Rechazar reseña</button>
        <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

function ReviewCard({ review, tab, onDone }) {
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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

  const approve = () => act(() => api.admin.approveReview(review.id), review.open_reports ? "Reportes descartados; la reseña sigue publicada." : "Reseña publicada.");
  const reject = (reason) => act(() => api.admin.rejectReview(review.id, reason), "Reseña rechazada.");
  const remove = () => {
    if (window.confirm("¿Eliminar la reseña definitivamente? El autor podrá escribir una nueva.")) {
      act(() => api.deleteReview(review.id), "Reseña eliminada.");
    }
  };

  return (
    <li className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/lugar/${review.establishment.slug}`} className="font-bold hover:underline">{review.establishment.name}</Link>
          <p className="text-xs text-ink-soft">
            {review.author.name} · {review.author.email} · {formatDate(review.created_at, true)}
          </p>
        </div>
        <Stars value={review.rating} />
      </div>

      {review.comment ? (
        <p className="mt-3 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm leading-relaxed">{review.comment}</p>
      ) : (
        <p className="mt-3 text-sm italic text-ink-soft">Solo calificación, sin comentario.</p>
      )}

      {review.moderation_reason && tab !== "approved" && (
        <p className="mt-2 text-xs text-ink-soft">
          <strong className="font-semibold">{tab === "rejected" ? "Motivo del rechazo:" : "Por qué está en revisión:"}</strong> {review.moderation_reason}
        </p>
      )}

      {review.reports.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="mb-1 flex items-center gap-1.5 font-semibold">
            <Flag className="h-4 w-4" aria-hidden="true" />
            {review.open_reports} {review.open_reports === 1 ? "reporte" : "reportes"}
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {review.reports.map((r) => <li key={r.id}>{r.message || <em>Sin mensaje</em>}</li>)}
          </ul>
        </div>
      )}

      <ErrorBox message={error} />

      {rejecting ? (
        <RejectForm busy={busy} onSubmit={reject} onCancel={() => setRejecting(false)} />
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {tab !== "approved" && (
            <button type="button" className="btn-primary px-3 py-2 text-sm" disabled={busy} onClick={approve}>
              <Check className="h-4 w-4" aria-hidden="true" />
              {tab === "reported" ? "Mantener publicada" : tab === "rejected" ? "Publicar de todas formas" : "Aprobar"}
            </button>
          )}
          {tab !== "rejected" && (
            <button type="button" className="btn-ghost px-3 py-2 text-sm text-closed" disabled={busy} onClick={() => setRejecting(true)}>
              <X className="h-4 w-4" aria-hidden="true" />
              {tab === "approved" || tab === "reported" ? "Ocultar reseña" : "Rechazar"}
            </button>
          )}
          <button type="button" className="btn-ghost ml-auto px-3 py-2 text-sm" disabled={busy} onClick={remove} aria-label="Eliminar reseña">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </li>
  );
}

export default function AdminReviews() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("estado") ?? "pending";
  const offset = Number(params.get("desde") ?? 0);
  const [flash, setFlash] = useFlash();
  const { data, error, loading, reload } = useApiData(
    (opts) => api.admin.reviews({ status: tab, limit: LIMIT, offset }, opts),
    [tab, offset],
  );

  const tabs = [
    { key: "pending", label: "Por revisar", count: data?.counts.pending },
    { key: "reported", label: "Reportadas", count: data?.counts.reported },
    { key: "rejected", label: "Rechazadas" },
    { key: "approved", label: "Publicadas" },
  ];

  function done(message) {
    setFlash(message);
    notifyAdminChange();
    reload();
  }

  return (
    <>
      <PageHeader
        title="Reseñas"
        description="La moderación automática aprueba o rechaza la mayoría. Aquí llegan las dudosas, las reportadas por otros usuarios y las que la IA no pudo revisar."
      />
      <FilterTabs label="Estado de las reseñas" tabs={tabs} value={tab} onChange={(key) => setParams(key === "pending" ? {} : { estado: key })} />
      <ErrorBox message={error} />
      {loading && !data && <Loading />}
      {data && data.items.length === 0 && (
        <Empty>{tab === "pending" ? "No hay reseñas por revisar. ¡Todo al día!" : tab === "reported" ? "No hay reportes abiertos." : "No hay reseñas en esta lista."}</Empty>
      )}
      {data && data.items.length > 0 && (
        <>
          <p className="mb-3 text-sm text-ink-soft">
            {data.total} {data.total === 1 ? "reseña" : "reseñas"} {tab === "pending" && <Pill tone="amber">la más antigua primero</Pill>}
          </p>
          <ul className={`space-y-4 ${loading ? "opacity-60" : ""}`}>
            {data.items.map((r) => <ReviewCard key={r.id} review={r} tab={tab} onDone={done} />)}
          </ul>
          <Pager total={data.total} limit={LIMIT} offset={offset} onChange={(o) => setParams({ ...(tab !== "pending" ? { estado: tab } : {}), desde: String(o) })} />
        </>
      )}
      <Flash message={flash} />
    </>
  );
}
