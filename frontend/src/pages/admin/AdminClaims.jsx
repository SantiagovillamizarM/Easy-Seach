import { Check, ExternalLink, Phone, X } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Empty, ErrorBox, Flash, FilterTabs, Loading, PageHeader, Pill, formatDate, useApiData, useFlash } from "../../components/admin/ui.jsx";
import { api } from "../../lib/api.js";
import { notifyAdminChange } from "./AdminLayout.jsx";

const STATUS = {
  pending: { label: "Pendiente", tone: "amber" },
  approved: { label: "Aprobada", tone: "green" },
  rejected: { label: "Rechazada", tone: "red" },
};

function ClaimCard({ claim, onDone }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const pending = claim.status === "pending";

  async function decide(kind) {
    const question = kind === "approve"
      ? `¿Aprobar? ${claim.user_name} podrá editar "${claim.establishment_name}" y el negocio quedará verificado.`
      : "¿Rechazar esta solicitud?";
    if (!window.confirm(question)) return;
    setBusy(true);
    setError(null);
    try {
      const fn = kind === "approve" ? api.admin.approveClaim : api.admin.rejectClaim;
      await fn(claim.id, note.trim() || null);
      onDone(kind === "approve" ? "Solicitud aprobada: el usuario ya es propietario." : "Solicitud rechazada.");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <li className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/lugar/${claim.establishment_slug}`} className="inline-flex items-center gap-1 font-bold hover:underline">
            {claim.establishment_name}
            <ExternalLink className="h-3.5 w-3.5 text-ink-soft" aria-hidden="true" />
          </Link>
          <p className="text-xs text-ink-soft">Enviada el {formatDate(claim.created_at, true)}</p>
        </div>
        <Pill tone={STATUS[claim.status].tone}>{STATUS[claim.status].label}</Pill>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-ink-soft">Solicitante</dt>
        <dd>{claim.user_name} · {claim.user_email}</dd>
        <dt className="text-ink-soft">Teléfono</dt>
        <dd>
          <a href={`tel:${(claim.contact_phone ?? "").replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            {claim.contact_phone}
          </a>
        </dd>
      </dl>
      <p className="mt-3 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm">{claim.message}</p>

      {!pending && claim.review_note && (
        <p className="mt-2 text-xs text-ink-soft"><strong className="font-semibold">Nota:</strong> {claim.review_note}</p>
      )}

      {pending && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-ink-soft">
            Antes de aprobar, llama al teléfono y confirma que la persona administra el negocio (p. ej. pide el RUT o la
            cámara de comercio).
          </p>
          <div>
            <label htmlFor={`note-${claim.id}`} className="mb-1 block text-sm font-semibold">Nota (opcional, la ve el solicitante)</label>
            <input id={`note-${claim.id}`} className="input py-2" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: Verificado por llamada con la cámara de comercio" />
          </div>
          <ErrorBox message={error} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary px-3 py-2 text-sm" disabled={busy} onClick={() => decide("approve")}>
              <Check className="h-4 w-4" aria-hidden="true" />
              Aprobar
            </button>
            <button type="button" className="btn-ghost px-3 py-2 text-sm text-closed" disabled={busy} onClick={() => decide("reject")}>
              <X className="h-4 w-4" aria-hidden="true" />
              Rechazar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function AdminClaims() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("estado") ?? "pending";
  const [flash, setFlash] = useFlash();
  const { data, error, loading, reload } = useApiData((opts) => api.admin.claims(tab, opts), [tab]);

  const tabs = [
    { key: "pending", label: "Pendientes", count: tab === "pending" ? data?.length : undefined },
    { key: "approved", label: "Aprobadas" },
    { key: "rejected", label: "Rechazadas" },
  ];

  return (
    <>
      <PageHeader title="Solicitudes de propiedad" description="Personas que piden administrar el perfil de un negocio. Al aprobar, el negocio recibe el sello de verificado." />
      <FilterTabs label="Estado de las solicitudes" tabs={tabs} value={tab} onChange={(key) => setParams(key === "pending" ? {} : { estado: key })} />
      <ErrorBox message={error} />
      {loading && !data && <Loading />}
      {data && data.length === 0 && <Empty>{tab === "pending" ? "No hay solicitudes pendientes." : "No hay solicitudes en esta lista."}</Empty>}
      {data && data.length > 0 && (
        <ul className={`space-y-4 ${loading ? "opacity-60" : ""}`}>
          {data.map((c) => (
            <ClaimCard
              key={c.id}
              claim={c}
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
