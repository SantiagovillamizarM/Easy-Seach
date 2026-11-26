import { BarChart3, Copy, LayoutDashboard, MessageSquareWarning, ShieldAlert, Store, Tags, UserCog, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { api } from "../../lib/api.js";
import { prefetchAdminSections } from "../../lib/prefetchAdmin.js";

const SECTIONS = [
  { to: "/admin", label: "Resumen", icon: LayoutDashboard, end: true },
  { to: "/admin/resenas", label: "Reseñas", icon: MessageSquareWarning, badge: (p) => p.reviews + p.reports },
  { to: "/admin/solicitudes", label: "Solicitudes", icon: UserCog, badge: (p) => p.claims },
  { to: "/admin/negocios", label: "Negocios", icon: Store },
  { to: "/admin/duplicados", label: "Duplicados", icon: Copy, badge: (p) => p.duplicates },
  { to: "/admin/usuarios", label: "Usuarios", icon: Users },
  { to: "/admin/busquedas", label: "Búsquedas", icon: BarChart3 },
  { to: "/admin/categorias", label: "Categorías", icon: Tags },
];

const IDLE_MS = 2 * 60 * 1000; // minutos sin actividad antes de que se active el protector de pantalla

export default function AdminLayout() {
  const { user, updateUser } = useAuth();
  const [pending, setPending] = useState(null);
  const [roleChecked, setRoleChecked] = useState(false);

  // Se confirma el rol con el servidor (el guardado en el navegador podría estar desactualizado).
  // La seguridad real está en el backend: todas las rutas /api/admin exigen rol admin.
  useEffect(() => {
    api
      .me()
      .then((me) => updateUser(me))
      .catch(() => {})
      .finally(() => setRoleChecked(true));
  }, [updateUser]);

  // Todas las secciones se descargan en segundo plano al entrar: cambiar de sección no espera nada
  useEffect(() => {
    if (user?.role !== "admin") return undefined;
    const id = "requestIdleCallback" in window
      ? window.requestIdleCallback(prefetchAdminSections, { timeout: 2000 })
      : setTimeout(prefetchAdminSections, 800);
    return () => ("cancelIdleCallback" in window ? window.cancelIdleCallback(id) : clearTimeout(id));
  }, [user?.role]);

  // Contadores de tareas pendientes para la barra lateral; se refrescan al volver a la pestaña
  useEffect(() => {
    if (user?.role !== "admin") return undefined;
    const load = () => api.admin.overview().then((o) => setPending(o.pending)).catch(() => {});
    load();
    const onFocus = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("easysearch:admin-changed", load);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("easysearch:admin-changed", load);
    };
  }, [user?.role]);

  useEffect(() => {
    document.title = "Panel administrativo · Easy Search";
  }, []);

  // Protector de pantalla: tras un rato sin actividad todo se desvanece y queda solo el agujero negro de fondo.
  // Cualquier movimiento, toque, scroll o tecla lo devuelve. (Los estilos están en theme.css: data-admin-idle)
  useEffect(() => {
    if (user?.role !== "admin") return undefined;
    const root = document.documentElement;
    let timer;
    const wake = () => {
      if (root.hasAttribute("data-admin-idle")) root.removeAttribute("data-admin-idle");
      clearTimeout(timer);
      timer = setTimeout(() => root.setAttribute("data-admin-idle", ""), IDLE_MS);
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"];
    events.forEach((name) => window.addEventListener(name, wake, { passive: true }));
    wake();
    return () => {
      clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, wake));
      root.removeAttribute("data-admin-idle");
    };
  }, [user?.role]);

  if (user.role !== "admin") {
    if (!roleChecked) return null;
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-closed" aria-hidden="true" />
        <p className="mt-3 text-lg font-bold">Esta sección es solo para administradores.</p>
        <Link to="/" className="btn-primary mt-6">Volver al inicio</Link>
      </div>
    );
  }

  return (
    <div className="admin-enter mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Secciones del panel administrativo" className="card p-2 lg:sticky lg:top-24 lg:self-start">
        <p className="mb-2 hidden px-3 text-xs font-bold uppercase tracking-wide text-ink-soft lg:block">Administración</p>
        <ul className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1">
          {SECTIONS.map(({ to, label, icon: Icon, end, badge }) => {
            const count = pending && badge ? badge(pending) : 0;
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  viewTransition
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                      isActive ? "bg-brand-600 text-canvas" : "text-ink-soft hover:bg-white hover:text-ink"
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                  {count > 0 && (
                    <span className="ml-auto rounded-full bg-neutral-700 px-1.5 text-xs font-bold text-white">
                      {count > 99 ? "99+" : count}
                      <span className="sr-only"> pendientes</span>
                    </span>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
      {/* El cambio de sección lo suaviza la transición del navegador (viewTransition en el menú lateral) */}
      <div className="admin-section min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

/** Avisa a la barra lateral que cambió algo pendiente (p. ej. se aprobó una reseña). */
export function notifyAdminChange() {
  window.dispatchEvent(new Event("easysearch:admin-changed"));
}
