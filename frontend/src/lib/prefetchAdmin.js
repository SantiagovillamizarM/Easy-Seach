// Precarga del panel administrativo: descarga en segundo plano el código del panel, del resumen y del agujero
// negro (los mismos archivos que usan las rutas diferidas, así que no se descargan dos veces). Así, al entrar,
// no hay esperas ni cosas apareciendo de golpe. Solo se usa para administradores.
let started = false;

export function prefetchAdmin() {
  if (started) return;
  started = true;
  [
    () => import("../pages/admin/AdminLayout.jsx"),
    () => import("../pages/admin/AdminOverview.jsx"),
    () => import("../components/admin/blackhole/BlackHole.jsx"),
  ].forEach((load) => load().catch(() => { started = false; }));
}

// Todas las secciones del panel: se precargan al entrar al panel, para que cambiar de sección sea inmediato
let sectionsStarted = false;
export function prefetchAdminSections() {
  if (sectionsStarted) return;
  sectionsStarted = true;
  [
    () => import("../pages/admin/AdminReviews.jsx"),
    () => import("../pages/admin/AdminClaims.jsx"),
    () => import("../pages/admin/AdminEstablishments.jsx"),
    () => import("../pages/admin/AdminDuplicates.jsx"),
    () => import("../pages/admin/AdminUsers.jsx"),
    () => import("../pages/admin/AdminSearchStats.jsx"),
    () => import("../pages/admin/AdminCategories.jsx"),
  ].forEach((load) => load().catch(() => { sectionsStarted = false; }));
}
