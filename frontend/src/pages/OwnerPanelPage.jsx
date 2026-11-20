import { BadgeCheck, CheckCircle2, Circle, Clock, ExternalLink, MessageSquare, Pencil, Search, Store, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import HoursBadge from "../components/HoursBadge.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";

const CLAIM_STATUS = {
  pending: { label: "En revisión", icon: Clock, className: "bg-amber-50 text-amber-800" },
  approved: { label: "Aprobada", icon: CheckCircle2, className: "bg-open-bg text-open" },
  rejected: { label: "No aprobada", icon: XCircle, className: "bg-closed-bg text-closed" },
};

// Qué le falta al perfil para estar completo (ayuda a que el negocio aparezca mejor en las búsquedas)
function checklist(est) {
  return [
    { done: est.has_description, label: "Descripción" },
    { done: est.has_hours, label: "Horario" },
    { done: est.offerings_count > 0, label: "Productos o servicios" },
    { done: est.photos_count > 0, label: "Fotos" },
  ];
}

function EstablishmentCard({ est }) {
  const items = checklist(est);
  const done = items.filter((i) => i.done).length;
  return (
    <article className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-brand-700">{est.categories.map((c) => c.name).join(" · ") || "Sin categoría"}</p>
          <h2 className="mt-0.5 flex items-center gap-1.5 text-lg font-bold">
            <span className="truncate">{est.name}</span>
            {est.is_verified && <BadgeCheck className="h-4 w-4 shrink-0 text-brand-600" aria-label="Verificado" />}
          </h2>
          <p className="text-sm text-ink-soft">{[est.address, est.municipality].filter(Boolean).join(", ")}</p>
        </div>
        <HoursBadge status={est.hours_status} />
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-xs font-semibold">
          <span>Perfil completo</span>
          <span>{done} de {items.length}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done}>
          <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          {items.map((i) => (
            <li key={i.label} className={`flex items-center gap-1.5 ${i.done ? "text-ink" : "text-ink-soft"}`}>
              {i.done ? (
                <CheckCircle2 className="h-4 w-4 text-open" aria-hidden="true" />
              ) : (
                <Circle className="h-4 w-4" aria-hidden="true" />
              )}
              {i.label}
              <span className="sr-only">{i.done ? "(completo)" : "(pendiente)"}</span>
            </li>
          ))}
        </ul>
      </div>

      {est.unanswered_reviews > 0 && (
        <Link
          to={`/panel/lugar/${est.id}?tab=resenas`}
          className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
        >
          <MessageSquare className="h-4 w-4 shrink-0" aria-hidden="true" />
          {est.unanswered_reviews === 1 ? "1 reseña sin responder" : `${est.unanswered_reviews} reseñas sin responder`}
          <span className="ml-auto text-xs font-bold text-amber-800">Responder →</span>
        </Link>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Link to={`/panel/lugar/${est.id}`} className="btn-primary">
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Editar negocio
        </Link>
        <Link to={`/lugar/${est.slug}`} className="btn-ghost">
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Ver perfil público
        </Link>
      </div>
    </article>
  );
}

export default function OwnerPanelPage() {
  const { user, updateUser } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = "Panel comercial · Easy Search";
    const controller = new AbortController();
    const opts = { signal: controller.signal };
    // El rol pudo cambiar (p. ej. un admin aprobó la solicitud): se refresca desde el servidor
    api
      .me(opts)
      .then(async (me) => {
        updateUser(me);
        const [establishments, claims] = await Promise.all([
          me.role === "owner" || me.role === "admin" ? api.ownerEstablishments(opts) : Promise.resolve([]),
          api.myClaims(opts),
        ]);
        setData({ establishments, claims });
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message);
      });
    return () => controller.abort();
  }, [updateUser]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
        <Store className="h-6 w-6 text-brand-600" aria-hidden="true" />
        Panel comercial
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Hola, {user.full_name.split(" ")[0]}. Mantén tu información al día para aparecer mejor en las búsquedas.
      </p>

      {error && <p role="alert" className="mt-6 rounded-xl bg-closed-bg p-3 text-sm text-closed">{error}</p>}

      {!data && !error && (
        <div className="mt-6 space-y-4" aria-hidden="true">
          <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      )}

      {data && (
        <>
          <section className="mt-6 space-y-4" aria-label="Mis negocios">
            {data.establishments.map((est) => (
              <EstablishmentCard key={est.id} est={est} />
            ))}
            {data.establishments.length === 0 && (
              <div className="card p-6 text-center">
                <p className="font-bold">Todavía no administras ningún negocio</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
                  Busca tu negocio, abre su perfil y pulsa <strong>“Solicitar administración”</strong>. Cuando lo verifiquemos,
                  aparecerá aquí para que lo edites.
                </p>
                <Link to="/" className="btn-primary mt-4">
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Buscar mi negocio
                </Link>
              </div>
            )}
          </section>

          {data.claims.length > 0 && (
            <section className="card mt-6 p-5">
              <h2 className="mb-3 font-bold">Mis solicitudes</h2>
              <ul className="divide-y divide-line">
                {data.claims.map((c) => {
                  const st = CLAIM_STATUS[c.status] ?? CLAIM_STATUS.pending;
                  return (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div className="min-w-0">
                        <Link to={`/lugar/${c.establishment_slug}`} className="font-semibold hover:underline">
                          {c.establishment_name}
                        </Link>
                        <p className="text-xs text-ink-soft">
                          Enviada el {new Date(c.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
                          {c.status === "rejected" && c.review_note && ` · ${c.review_note}`}
                        </p>
                      </div>
                      <span className={`chip border-transparent ${st.className}`}>
                        <st.icon className="h-3.5 w-3.5" aria-hidden="true" />
                        {st.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
