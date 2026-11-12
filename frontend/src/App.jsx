import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import RequireAuth from "./components/RequireAuth.jsx";
import { LoginPage, RegisterPage } from "./pages/AuthPages.jsx";
import EstablishmentPage from "./pages/EstablishmentPage.jsx";
import FavoritesPage from "./pages/FavoritesPage.jsx";
import HistoryPage from "./pages/HistoryPage.jsx";
import HomePage from "./pages/HomePage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import OwnerEditorPage from "./pages/OwnerEditorPage.jsx";
import OwnerPanelPage from "./pages/OwnerPanelPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import ResultsPage from "./pages/ResultsPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="buscar" element={<ResultsPage />} />
        <Route path="lugar/:slug" element={<EstablishmentPage />} />
        <Route path="ingresar" element={<LoginPage />} />
        <Route path="registro" element={<RegisterPage />} />
        <Route path="perfil" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="favoritos" element={<RequireAuth><FavoritesPage /></RequireAuth>} />
        <Route path="historial" element={<RequireAuth><HistoryPage /></RequireAuth>} />
        <Route path="panel" element={<RequireAuth><OwnerPanelPage /></RequireAuth>} />
        <Route path="panel/lugar/:id" element={<RequireAuth><OwnerEditorPage /></RequireAuth>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
