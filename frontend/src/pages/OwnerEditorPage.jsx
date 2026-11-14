import { ArrowLeft, CalendarClock, ExternalLink, Image, Info, MessageSquare, Tag } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import HoursEditor from "../components/panel/HoursEditor.jsx";
import InfoForm from "../components/panel/InfoForm.jsx";
import OfferingsEditor from "../components/panel/OfferingsEditor.jsx";
import PhotosEditor from "../components/panel/PhotosEditor.jsx";
import ReviewsReplies from "../components/panel/ReviewsReplies.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";

const TABS = [
  { key: "info", label: "Información", icon: Info, Component: InfoForm },
  { key: "horario", label: "Horario", icon: CalendarClock, Component: HoursEditor },
  { key: "productos", label: "Productos y servicios", icon: Tag, Component: OfferingsEditor },
  { key: "fotos", label: "Fotos", icon: Image, Component: PhotosEditor },
  { key: "resenas", label: "Reseñas", icon: MessageSquare, Component: ReviewsReplies },
];

export default function OwnerEditorPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [est, setEst] = useState(null);
  const [error, setError] = useState(null);
  const active = TABS.find((t) => t.key === params.get("tab")) ?? TABS[0];

  // Después de cada cambio se vuelven a pedir los datos: así lo que se ve es exactamente lo guardado
  const reload = useCallback(
    (opts) =>
      api
        .ownerEstablishment(id, opts)
        .then((data) => {
          setEst(data);
          document.title = `Editar ${data.name} · Easy Search`;
        })
        .catch((err) => {
          if (err.name !== "AbortError") setError(err);
        }),
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    setEst(null);
    setError(null);
    reload({ signal: controller.signal });
    return () => controller.abort();
  }, [reload]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-lg font-bold">
          {error.status === 403 ? "No tienes permiso para editar este negocio." : error.status === 404 || error.status === 422 ? "Este negocio no existe." : error.message}
        </p>
        <Link to="/panel" className="btn-primary mt-6">Ir a mi panel</Link>
      </div>
    );
  }

  if (!est) {
    return (
      <div className="mx-auto max-w-4xl animate-pulse px-4 py-8" aria-hidden="true">
        <div className="h-8 w-1/2 rounded bg-slate-100" />
        <div className="mt-6 h-12 rounded-xl bg-slate-100" />
        <div className="mt-6 h-72 rounded-2xl bg-slate-100" />
      </div>
    );
  }

  const ActiveComponent = active.Component;
  const adminEditing = user?.role === "admin" && est.owner_id !== user.id;
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Link to={adminEditing ? "/admin/negocios" : "/panel"} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {adminEditing ? "Negocios (administración)" : "Mi panel"}
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-brand-700">Editando</p>
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{est.name}</h1>
        </div>
        <Link to={`/lugar/${est.slug}`} className="btn-ghost px-3 py-2 text-sm">
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Ver perfil público
        </Link>
      </div>

      <div role="tablist" aria-label="Secciones del negocio" className="mt-5 grid grid-cols-2 gap-1 rounded-xl border border-line bg-white p-1 sm:flex">
        {TABS.map((t) => {
          const selected = t.key === active.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={selected}
              aria-controls="panel-tab"
              onClick={() => setParams(t.key === "info" ? {} : { tab: t.key }, { replace: true })}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition last:col-span-2 sm:justify-start ${
                selected ? "bg-brand-600 text-white" : "text-ink-soft hover:bg-brand-50 hover:text-ink"
              }`}
            >
              <t.icon className="h-4 w-4" aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div id="panel-tab" role="tabpanel" aria-labelledby={`tab-${active.key}`} className="mt-6">
        <ActiveComponent establishment={est} onSaved={() => reload()} />
      </div>
    </div>
  );
}
