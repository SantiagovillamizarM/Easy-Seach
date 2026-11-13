import { Outlet, useLocation } from "react-router-dom";
import ErrorBoundary from "./ErrorBoundary.jsx";
import Logo from "./Logo.jsx";
import SearchBar from "./SearchBar.jsx";
import UserMenu from "./UserMenu.jsx";

function Header() {
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  return (
    <header className="sticky top-0 z-[1000] border-b border-line/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Logo />
        {!isHome ? (
          <div className="hidden flex-1 md:block">
            <SearchBar compact />
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <div className="ml-auto md:ml-0">
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
    <footer className="border-t border-line bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-ink-soft sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} Easy Search · Búsqueda inteligente en el área metropolitana de Bucaramanga</p>
        <p>
          Datos de lugares ©{" "}
          <a className="underline hover:text-ink" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
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
