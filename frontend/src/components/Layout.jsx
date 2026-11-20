import { Bot } from "lucide-react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useScrolled } from "../lib/motion.js";
import ErrorBoundary from "./ErrorBoundary.jsx";
import Logo from "./Logo.jsx";
import SearchBar from "./SearchBar.jsx";
import UserMenu from "./UserMenu.jsx";

function Header() {
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  // Al bajar, el encabezado se compacta y gana fondo y sombra para separarse del contenido
  const scrolled = useScrolled();
  return (
    <header
      className={`sticky top-0 z-[1000] border-b backdrop-blur transition-[background-color,border-color,box-shadow] duration-300 ease-[var(--ease-out-soft)] ${
        scrolled ? "border-line/80 bg-white/90 shadow-[0_4px_20px_rgb(11_18_36/0.06)]" : "border-transparent bg-white/60"
      }`}
    >
      <div
        className={`mx-auto flex max-w-7xl items-center gap-4 px-4 transition-[padding] duration-300 ease-[var(--ease-out-soft)] ${
          scrolled ? "py-2" : "py-3.5"
        }`}
      >
        <Logo />
        {!isHome ? (
          <div className="hidden flex-1 md:block">
            <SearchBar compact />
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <Link
          to="/asistente"
          className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold md:ml-0 ${
            pathname === "/asistente" ? "bg-brand-50 text-brand-700" : "text-ink-soft hover:bg-brand-50 hover:text-brand-700"
          }`}
        >
          <Bot className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Asistente</span>
        </Link>
        <div>
          <UserMenu />
        </div>
      </div>
      {!isHome && (
        <div className="px-4 pb-3 md:hidden">
          <SearchBar compact />
        </div>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="bg-night text-white/65">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-xs sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} Easy Search · Búsqueda inteligente en el área metropolitana de Bucaramanga</p>
        <p>
          Datos de lugares ©{" "}
          <a className="underline decoration-white/30 underline-offset-2 hover:text-white" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            colaboradores de OpenStreetMap
          </a>{" "}
          (ODbL)
        </p>
      </div>
    </footer>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        {/* Si una página falla, el encabezado sigue funcionando y al navegar se recupera */}
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}
