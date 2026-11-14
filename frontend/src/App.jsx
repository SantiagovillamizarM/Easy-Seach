import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import RequireAuth from "./components/RequireAuth.jsx";
import { ForgotPasswordPage, LoginPage, RegisterPage } from "./pages/AuthPages.jsx";
import EstablishmentPage from "./pages/EstablishmentPage.jsx";
import FavoritesPage from "./pages/FavoritesPage.jsx";
import HistoryPage from "./pages/HistoryPage.jsx";
import HomePage from "./pages/HomePage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import OwnerEditorPage from "./pages/OwnerEditorPage.jsx";
import OwnerPanelPage from "./pages/OwnerPanelPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import ResultsPage from "./pages/ResultsPage.jsx";
import UnsubscribePage from "./pages/UnsubscribePage.jsx";
import VerifyEmailPage from "./pages/VerifyEmailPage.jsx";

// Panel administrativo: se descarga solo cuando un administrador entra (no pesa para los demás usuarios)
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout.jsx"));
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview.jsx"));
const AdminReviews = lazy(() => import("./pages/admin/AdminReviews.jsx"));
const AdminClaims = lazy(() => import("./pages/admin/AdminClaims.jsx"));
const AdminEstablishments = lazy(() => import("./pages/admin/AdminEstablishments.jsx"));
const AdminDuplicates = lazy(() => import("./pages/admin/AdminDuplicates.jsx"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers.jsx"));
const AdminSearchStats = lazy(() => import("./pages/admin/AdminSearchStats.jsx"));
const AdminCategories = lazy(() => import("./pages/admin/AdminCategories.jsx"));

const adminPage = (Page) => (
  <Suspense fallback={<p className="py-10 text-sm text-ink-soft">Cargando…</p>}>
    <Page />
  </Suspense>
);

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        {/* Buscar exige cuenta con correo confirmado: protege la cuota de la IA frente a robots */}
        <Route path="buscar" element={<RequireAuth verified guestAllowed><ResultsPage /></RequireAuth>} />
        <Route path="verificar" element={<RequireAuth><VerifyEmailPage /></RequireAuth>} />
        <Route path="lugar/:slug" element={<EstablishmentPage />} />
        <Route path="ingresar" element={<LoginPage />} />
        <Route path="registro" element={<RegisterPage />} />
        <Route path="recuperar" element={<ForgotPasswordPage />} />
        <Route path="correos/baja" element={<UnsubscribePage />} />
        <Route path="perfil" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="favoritos" element={<RequireAuth><FavoritesPage /></RequireAuth>} />
        <Route path="historial" element={<RequireAuth><HistoryPage /></RequireAuth>} />
        <Route path="panel" element={<RequireAuth><OwnerPanelPage /></RequireAuth>} />
        <Route path="panel/lugar/:id" element={<RequireAuth><OwnerEditorPage /></RequireAuth>} />
        <Route path="admin" element={<RequireAuth>{adminPage(AdminLayout)}</RequireAuth>}>
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
