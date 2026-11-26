import { Suspense, lazy, useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import RequireAuth from "./components/RequireAuth.jsx";
import ThemedPage from "./components/ThemedPage.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { prefetchAdmin } from "./lib/prefetchAdmin.js";
import HomePage from "./pages/HomePage.jsx";

// Solo el inicio viaja en el paquete principal: el resto de páginas se descarga al visitarlas
// (o antes, en segundo plano, ver PREFETCH). Así la primera carga pesa mucho menos.
const loadAuth = () => import("./pages/AuthPages.jsx");
const loadResults = () => import("./pages/ResultsPage.jsx");
const LoginPage = lazy(() => loadAuth().then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => loadAuth().then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => loadAuth().then((m) => ({ default: m.ForgotPasswordPage })));
const ResultsPage = lazy(loadResults);
const AssistantPage = lazy(() => import("./pages/AssistantPage.jsx"));
const EstablishmentPage = lazy(() => import("./pages/EstablishmentPage.jsx"));
const FavoritesPage = lazy(() => import("./pages/FavoritesPage.jsx"));
const HistoryPage = lazy(() => import("./pages/HistoryPage.jsx"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage.jsx"));
const OwnerEditorPage = lazy(() => import("./pages/OwnerEditorPage.jsx"));
const OwnerPanelPage = lazy(() => import("./pages/OwnerPanelPage.jsx"));
const RegisterBusinessPage = lazy(() => import("./pages/RegisterBusinessPage.jsx"));
const ProfilePage = lazy(() => import("./pages/ProfilePage.jsx"));
const UnsubscribePage = lazy(() => import("./pages/UnsubscribePage.jsx"));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage.jsx"));

// Las páginas a las que más se salta desde el inicio se descargan cuando el navegador queda libre,
// para que al navegar no haya espera
const PREFETCH = [loadAuth, loadResults];

// Panel administrativo: se descarga solo cuando un administrador entra (no pesa para los demás usuarios)
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout.jsx"));
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview.jsx"));
// (para administradores se precargan en segundo plano: ver prefetchAdmin)
const AdminReviews = lazy(() => import("./pages/admin/AdminReviews.jsx"));
const AdminClaims = lazy(() => import("./pages/admin/AdminClaims.jsx"));
const AdminEstablishments = lazy(() => import("./pages/admin/AdminEstablishments.jsx"));
const AdminDuplicates = lazy(() => import("./pages/admin/AdminDuplicates.jsx"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers.jsx"));
const AdminSearchStats = lazy(() => import("./pages/admin/AdminSearchStats.jsx"));
const AdminCategories = lazy(() => import("./pages/admin/AdminCategories.jsx"));

const adminPage = (Page) => (
  // Sin texto de "Cargando…": el espacio se reserva y la sección aparece con un fundido suave
  <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>
    <Page />
  </Suspense>
);

export default function App() {
  // Administradores: el panel se precarga cuando el navegador queda libre (entrar al panel es instantáneo)
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  useEffect(() => {
    if (!isAdmin) return undefined;
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(prefetchAdmin, { timeout: 5000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(prefetchAdmin, 2000);
    return () => clearTimeout(id);
  }, [isAdmin]);

  useEffect(() => {
    const prefetch = () => PREFETCH.forEach((load) => load().catch(() => {}));
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(prefetch, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(prefetch, 1500);
    return () => clearTimeout(id);
  }, []);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        {/* Buscar exige cuenta con correo confirmado: protege la cuota de la IA frente a robots */}
        <Route path="buscar" element={<RequireAuth verified guestAllowed><ResultsPage /></RequireAuth>} />
        <Route path="verificar" element={<RequireAuth><VerifyEmailPage /></RequireAuth>} />
        {/* Asistente con IA (Spring Boot + n8n): exige correo confirmado, igual que en el servidor */}
        <Route path="asistente" element={<RequireAuth verified><ThemedPage><AssistantPage /></ThemedPage></RequireAuth>} />
        {/* Páginas con modo claro/oscuro: van envueltas en ThemedPage */}
        <Route path="lugar/:slug" element={<ThemedPage><EstablishmentPage /></ThemedPage>} />
        <Route path="ingresar" element={<LoginPage />} />
        <Route path="registro" element={<RegisterPage />} />
        <Route path="recuperar" element={<ForgotPasswordPage />} />
        <Route path="correos/baja" element={<UnsubscribePage />} />
        <Route path="perfil" element={<RequireAuth><ThemedPage><ProfilePage /></ThemedPage></RequireAuth>} />
        <Route path="favoritos" element={<RequireAuth><ThemedPage><FavoritesPage /></ThemedPage></RequireAuth>} />
        <Route path="historial" element={<RequireAuth><ThemedPage><HistoryPage /></ThemedPage></RequireAuth>} />
        <Route path="panel" element={<RequireAuth><ThemedPage><OwnerPanelPage /></ThemedPage></RequireAuth>} />
        {/* Registrar un negocio nuevo: la solicitud llega al panel de administración para verificarla */}
        <Route path="registrar-negocio" element={<RequireAuth verified><ThemedPage><RegisterBusinessPage /></ThemedPage></RequireAuth>} />
        <Route path="panel/lugar/:id" element={<RequireAuth><ThemedPage><OwnerEditorPage /></ThemedPage></RequireAuth>} />
        <Route path="admin" element={<RequireAuth><ThemedPage variant="admin">{adminPage(AdminLayout)}</ThemedPage></RequireAuth>}>
          <Route index element={adminPage(AdminOverview)} />
          <Route path="resenas" element={adminPage(AdminReviews)} />
          <Route path="solicitudes" element={adminPage(AdminClaims)} />
          <Route path="negocios" element={adminPage(AdminEstablishments)} />
          <Route path="duplicados" element={adminPage(AdminDuplicates)} />
          <Route path="usuarios" element={adminPage(AdminUsers)} />
          <Route path="busquedas" element={adminPage(AdminSearchStats)} />
          <Route path="categorias" element={adminPage(AdminCategories)} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
