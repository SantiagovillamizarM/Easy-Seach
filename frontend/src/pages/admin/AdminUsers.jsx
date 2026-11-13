import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Empty, ErrorBox, Flash, Loading, PageHeader, Pager, Pill, formatDate, useApiData, useFlash } from "../../components/admin/ui.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { api } from "../../lib/api.js";

const LIMIT = 25;
const ROLES = { user: "Usuario", owner: "Propietario", admin: "Administrador" };

function UserRow({ person, isMe, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function change(data, message, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return false;
    setBusy(true);
    setError(null);
    try {
      await api.admin.updateUser(person.id, data);
      onDone(message);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function changeRole(e) {
    const role = e.target.value;
    const select = e.target;
    let warning = null;
    if (role === "admin") warning = `¿Dar acceso de ADMINISTRADOR a ${person.full_name}? Podrá moderar, ocultar negocios y gestionar usuarios.`;
    else if (role === "user" && person.establishments_count > 0) {
      warning = `${person.full_name} administra ${person.establishments_count} negocio(s). Al pasarlo a usuario, esos negocios quedarán sin dueño y sin sello de verificado. ¿Continuar?`;
    }
    change({ role }, `Rol actualizado a ${ROLES[role]}.`, warning).then((ok) => {
      if (!ok) select.value = person.role; // revertir el selector si se canceló o falló
    });
  }

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {person.full_name}
          {isMe && <Pill tone="brand">Tú</Pill>}
          {!person.is_active && <Pill tone="red">Desactivado</Pill>}
        </p>
        <p className="truncate text-xs text-ink-soft">
          {person.email} · Desde {formatDate(person.created_at)}
          {person.establishments_count > 0 && ` · ${person.establishments_count} negocio(s)`}
        </p>
        <ErrorBox message={error} />
      </div>
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`role-${person.id}`}>Rol de {person.full_name}</label>
        <select id={`role-${person.id}`} className="input w-auto py-1.5 text-xs" defaultValue={person.role} disabled={busy || isMe} onChange={changeRole}>
          {Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {!isMe && (
          <button
            type="button"
            className={`btn-ghost px-2.5 py-1.5 text-xs ${person.is_active ? "text-closed" : ""}`}
            disabled={busy}
            onClick={() =>
              change(
                { is_active: !person.is_active },
                person.is_active ? "Cuenta desactivada." : "Cuenta reactivada.",
                person.is_active ? `¿Desactivar la cuenta de ${person.full_name}? No podrá iniciar sesión y su sesión actual se cerrará.` : null,
              )
            }
          >
            {person.is_active ? "Desactivar" : "Reactivar"}
          </button>
        )}
      </div>
    </li>
  );
}

export default function AdminUsers() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  // "texto" y no "q": la barra de búsqueda del encabezado lee "q" de la URL
  const q = params.get("texto") ?? "";
  const role = params.get("rol") ?? "";
  const offset = Number(params.get("desde") ?? 0);
  const [text, setText] = useState(q);
  const [flash, setFlash] = useFlash();

  const setFilters = (changes, replace = false) => {
    const next = { texto: q, rol: role, ...changes };
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v));
    setParams(clean, { replace });
  };

  useEffect(() => {
    if (text === q) return undefined;
    const t = setTimeout(() => setFilters({ texto: text, desde: "" }, true), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const { data, error, loading, reload } = useApiData(
    (opts) => api.admin.users({ q, role, limit: LIMIT, offset }, opts),
    [q, role, offset],
  );

  return (
    <>
      <PageHeader title="Usuarios" description="Cambia roles o desactiva cuentas que abusen del servicio. Una cuenta desactivada no puede iniciar sesión." />
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-56 flex-1">
          <label htmlFor="users-q" className="mb-1 block text-xs font-semibold">Buscar por nombre o correo</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
            <input id="users-q" type="search" className="input py-2 pl-9" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="users-role" className="mb-1 block text-xs font-semibold">Rol</label>
          <select id="users-role" className="input py-2" value={role} onChange={(e) => setFilters({ rol: e.target.value, desde: "" })}>
            <option value="">Todos</option>
            {Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      <ErrorBox message={error} />
      {loading && !data && <Loading />}
      {data && data.items.length === 0 && <Empty>No encontramos usuarios con esos filtros.</Empty>}
      {data && data.items.length > 0 && (
        <section className="card px-5 py-1">
          <p className="border-b border-line py-3 text-sm text-ink-soft">{data.total.toLocaleString("es-CO")} usuarios</p>
          <ul className={`divide-y divide-line ${loading ? "opacity-60" : ""}`}>
            {data.items.map((p) => (
              <UserRow
                key={`${p.id}-${p.role}-${p.is_active}`}
                person={p}
                isMe={p.id === user.id}
                onDone={(message) => {
                  setFlash(message);
                  reload();
                }}
              />
            ))}
          </ul>
          <div className="pb-4">
            <Pager total={data.total} limit={LIMIT} offset={offset} onChange={(o) => setFilters({ desde: String(o) })} />
          </div>
        </section>
      )}
      <Flash message={flash} />
    </>
  );
}
