import { Check, ExternalLink, MapPin, Phone, X } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Empty, ErrorBox, Flash, FilterTabs, Loading, PageHeader, Pill, formatDate, useApiData, useFlash } from "../../components/admin/ui.jsx";
import { api } from "../../lib/api.js";
import { notifyAdminChange } from "./AdminLayout.jsx";

const ROLE = { dueno: "Dueño", encargado: "Encargado autorizado" };

function telHref(phone) {
  return `tel:${(phone ?? "").replace(/[^\d+]/g, "")}`;
}

// Datos del negocio nuevo que propone el solicitante (se crea así al aprobar)
function ProposedBusiness({ data }) {
  const rows = [
    ["Tipo", data.category_names?.join(", ")],
    ["Municipio", data.municipality_name],
    ["Barrio", data.neighborhood],
    ["Dirección", data.address],
    ["Teléfono", data.phone],
    ["WhatsApp", data.whatsapp],
    ["Correo", data.email],
    ["Instagram", data.instagram],
    ["Web", data.website],
    ["Facebook", data.facebook],
  ].filter(([, v]) => v);
  const mapUrl = `https://www.openstreetmap.org/?mlat=${data.latitude}&mlon=${data.longitude}#map=18/${data.latitude}/${data.longitude}`;
  return (
    <div className="mt-3 rounded-xl border border-line p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">Negocio que se creará</p>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-soft">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
        <dt className="text-ink-soft">Ubicación</dt>
        <dd>
          <a href={mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Ver el punto en el mapa
          </a>
        </dd>
      </dl>
      {data.description && <p className="mt-2 whitespace-pre-line text-sm text-ink-soft">{data.description}</p>}
    </div>
  );
}

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
    const isNew = claim.kind === "register";
    const question = kind === "approve"
      ? (isNew
        ? `¿Aprobar? Se creará "${claim.establishment_name}" verificado y a nombre de ${claim.user_name}.`
        : `¿Aprobar? ${claim.user_name} podrá editar "${claim.establishment_name}" y el negocio quedará verificado.`)
      : "¿Rechazar esta solicitud? Al solicitante le llegará un correo con la nota.";
    if (!window.confirm(question)) return;
    setBusy(true);
    setError(null);
    try {
      const fn = kind === "approve" ? api.admin.approveClaim : api.admin.rejectClaim;
      await fn(claim.id, note.trim() || null);
      onDone(kind === "approve"
        ? (isNew ? "Negocio creado y asignado: le enviamos un correo al propietario." : "Solicitud aprobada: el usuario ya es propietario.")
        : "Solicitud rechazada: le enviamos un correo al solicitante.");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <li className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {claim.establishment_slug ? (
            <Link to={`/lugar/${claim.establishment_slug}`} className="inline-flex items-center gap-1 font-bold hover:underline">
              {claim.establishment_name}
              <ExternalLink className="h-3.5 w-3.5 text-ink-soft" aria-hidden="true" />
            </Link>
          ) : (
            <span className="font-bold">{claim.establishment_name}</span>
          )}
          <p className="text-xs text-ink-soft">Enviada el {formatDate(claim.created_at, true)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill tone={claim.kind === "register" ? "brand" : "gray"}>{claim.kind === "register" ? "Negocio nuevo" : "Negocio existente"}</Pill>
          <Pill tone={STATUS[claim.status].tone}>{STATUS[claim.status].label}</Pill>
        </div>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-ink-soft">Solicitante</dt>
        <dd className="min-w-0 break-words">{claim.user_name} · {claim.user_email}</dd>
        <dt className="text-ink-soft">Es</dt>
        <dd>
          {ROLE[claim.applicant_role] ?? "Sin indicar"}
          {claim.applicant_position && ` · ${claim.applicant_position}`}
        </dd>
        <dt className="text-ink-soft">Teléfono</dt>
        <dd>
          <a href={telHref(claim.contact_phone)} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            {claim.contact_phone}
          </a>
        </dd>
        <dt className="text-ink-soft">Autorizó sus datos</dt>
        <dd>{claim.consent_at ? formatDate(claim.consent_at, true) : "No consta (solicitud antigua)"}</dd>
      </dl>
      {claim.proposed && <ProposedBusiness data={claim.proposed} />}
      {claim.message && <p className="mt-3 whitespace-pre-line rounded-xl bg-canvas p-3 text-sm">{claim.message}</p>}

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
      <PageHeader title="Solicitudes de negocios" description="Personas que piden registrar un negocio nuevo o administrar uno que ya está en la app. Llama, verifica y aprueba: el negocio queda verificado y a su nombre, y le llega un correo." />
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
