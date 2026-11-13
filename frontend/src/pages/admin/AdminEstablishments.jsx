import { BadgeCheck, CalendarClock, Eye, EyeOff, FileText, Image, Pencil, Search, Tag, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Empty, ErrorBox, Flash, Loading, PageHeader, Pager, Pill, useApiData, useFlash } from "../../components/admin/ui.jsx";
import { api } from "../../lib/api.js";
import { notifyAdminChange } from "./AdminLayout.jsx";

const LIMIT = 25;
const STATUS = {
  active: { label: "Activo", tone: "green" },
  hidden: { label: "Oculto", tone: "gray" },
  duplicate: { label: "Duplicado", tone: "amber" },
};

// Íconos de qué datos tiene el negocio (con texto para lectores de pantalla)
function DataIcons({ est }) {
  const items = [
    { ok: est.has_description, icon: FileText, label: "descripción" },
    { ok: est.has_hours, icon: CalendarClock, label: "horario" },
    { ok: est.offerings_count > 0, icon: Tag, label: "productos" },
    { ok: est.photos_count > 0, icon: Image, label: "fotos" },
  ];
  return (
    <span className="flex items-center gap-1.5">
      {items.map(({ ok, icon: Icon, label }) => (
        <span key={label} title={`${ok ? "Tiene" : "Sin"} ${label}`}>
          <Icon className={`h-4 w-4 ${ok ? "text-open" : "text-slate-300"}`} aria-hidden="true" />
          <span className="sr-only">{ok ? "Tiene" : "Sin"} {label}.</span>
        </span>
      ))}
    </span>
  );
}

function Row({ est, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function act(fn, message, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone(message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const st = STATUS[est.status];
  return (
    <li className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {est.status === "active" ? (
            <Link to={`/lugar/${est.slug}`} className="font-semibold hover:underline">{est.name}</Link>
          ) : (
            <span className="font-semibold text-ink-soft">{est.name}</span>
          )}
          {est.is_verified && <BadgeCheck className="h-4 w-4 text-brand-600" aria-label="Verificado" />}
          <Pill tone={st.tone}>{st.label}</Pill>
          {est.source !== "osm" && <Pill tone="brand">{est.source === "owner" ? "Editado por el dueño" : "Editado"}</Pill>}
        </div>
        <p className="truncate text-xs text-ink-soft">
          #{est.id} · {[est.categories.map((c) => c.name).join(", ") || "Sin categoría", est.municipality].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
          <DataIcons est={est} />
          <span>{est.owner ? `Dueño: ${est.owner.name} (${est.owner.email})` : "Sin dueño"}</span>
          {est.duplicate_of_id && <span>Duplicado de #{est.duplicate_of_id}</span>}
        </div>
        <ErrorBox message={error} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Link to={`/panel/lugar/${est.id}`} className="btn-ghost px-2.5 py-1.5 text-xs">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Editar
        </Link>
        {est.status === "active" ? (
          <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" disabled={busy}
            onClick={() => act(() => api.admin.updateEstablishment(est.id, { status: "hidden" }), `"${est.name}" ya no aparece en las búsquedas.`,
              `¿Ocultar "${est.name}"? Dejará de aparecer en búsquedas, favoritos y su página pública.`)}>
            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
            Ocultar
          </button>
        ) : (
          <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" disabled={busy}
            onClick={() => act(() => api.admin.updateEstablishment(est.id, { status: "active" }), `"${est.name}" vuelve a estar visible.`)}>
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            Reactivar
          </button>
        )}
        <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" disabled={busy}
          onClick={() => act(() => api.admin.updateEstablishment(est.id, { is_verified: !est.is_verified }),
            est.is_verified ? "Sello de verificado retirado." : "Negocio marcado como verificado.")}>
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {est.is_verified ? "Quitar verificado" : "Verificar"}
        </button>
        {est.owner && (
          <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs text-closed" disabled={busy}
            onClick={() => act(() => api.admin.removeOwner(est.id), "Propietario desvinculado.",
              `¿Desvincular a ${est.owner.name}? Ya no podrá editar "${est.name}" y el negocio perderá el sello de verificado.`)}>
            <UserX className="h-3.5 w-3.5" aria-hidden="true" />
            Quitar dueño
          </button>
        )}
      </div>
    </li>
  );
}

export default function AdminEstablishments() {
  const [params, setParams] = useSearchParams();
  // "texto" y no "q": la barra de búsqueda del encabezado lee "q" de la URL
  const q = params.get("texto") ?? "";
  const status = params.get("estado") ?? "all";
  const owner = params.get("dueno") ?? "";
  const offset = Number(params.get("desde") ?? 0);
  const [text, setText] = useState(q);
  const [flash, setFlash] = useFlash();

  // El texto se aplica 350 ms después de dejar de escribir (no una petición por tecla)
  useEffect(() => {
    if (text === q) return undefined;
    const t = setTimeout(() => update({ q: text }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  function update(changes) {
    const next = { q, estado: status, dueno: owner, ...changes };
    const clean = {};
    if (next.q) clean.texto = next.q;
    if (next.estado && next.estado !== "all") clean.estado = next.estado;
    if (next.dueno) clean.dueno = next.dueno;
    if (changes.desde) clean.desde = changes.desde; // cambiar un filtro vuelve a la primera página
    setParams(clean, { replace: "q" in changes });
  }

  const { data, error, loading, reload } = useApiData(
    (opts) => api.admin.establishments({ q, status, owner, limit: LIMIT, offset }, opts),
    [q, status, owner, offset],
  );

  return (
    <>
      <PageHeader title="Negocios" description="Busca, edita, oculta o verifica cualquier establecimiento. Ocultar no borra nada: se puede reactivar." />

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-56 flex-1">
          <label htmlFor="est-q" className="mb-1 block text-xs font-semibold">Buscar por nombre o número</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
            <input id="est-q" type="search" className="input py-2 pl-9" placeholder="Ej: terpel, panadería, 1024" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="est-status" className="mb-1 block text-xs font-semibold">Estado</label>
          <select id="est-status" className="input py-2" value={status} onChange={(e) => update({ estado: e.target.value })}>
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="hidden">Ocultos</option>
            <option value="duplicate">Duplicados</option>
          </select>
        </div>
        <div>
          <label htmlFor="est-owner" className="mb-1 block text-xs font-semibold">Propietario</label>
          <select id="est-owner" className="input py-2" value={owner} onChange={(e) => update({ dueno: e.target.value })}>
            <option value="">Todos</option>
            <option value="with">Con dueño</option>
            <option value="without">Sin dueño</option>
          </select>
        </div>
      </div>

      <ErrorBox message={error} />
      {loading && !data && <Loading />}
      {data && data.items.length === 0 && <Empty>No encontramos negocios con esos filtros.</Empty>}
      {data && data.items.length > 0 && (
        <section className="card px-5 py-1">
          <p className="border-b border-line py-3 text-sm text-ink-soft">{data.total.toLocaleString("es-CO")} negocios</p>
          <ul className={`divide-y divide-line ${loading ? "opacity-60" : ""}`}>
            {data.items.map((est) => (
              <Row
                key={est.id}
                est={est}
                onDone={(message) => {
                  setFlash(message);
                  notifyAdminChange();
                  reload();
                }}
              />
            ))}
          </ul>
          <div className="pb-4">
            <Pager total={data.total} limit={LIMIT} offset={offset} onChange={(o) => update({ desde: String(o) })} />
          </div>
        </section>
      )}
      <Flash message={flash} />
    </>
  );
}
