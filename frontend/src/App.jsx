import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import EstablishmentPage from "./pages/EstablishmentPage.jsx";
import HomePage from "./pages/HomePage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import ResultsPage from "./pages/ResultsPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="buscar" element={<ResultsPage />} />
        <Route path="lugar/:slug" element={<EstablishmentPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
