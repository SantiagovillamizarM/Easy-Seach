import { Bot } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useOverDarkHero, useScrolled } from "../lib/motion.js";
import ErrorBoundary from "./ErrorBoundary.jsx";
import Logo from "./Logo.jsx";
import SearchBar from "./SearchBar.jsx";
import UserMenu from "./UserMenu.jsx";

// Páginas que empiezan con un fondo nocturno (data-dark-hero)
const DARK_HERO_ROUTES = ["/", "/ingresar", "/registro", "/recuperar", "/verificar", "/correos/baja"];

function Header() {
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  const isResults = pathname === "/buscar";
  // Al bajar, el encabezado se compacta y gana fondo y sombra para separarse del contenido
  const scrolled = useScrolled();
  // En páginas con hero nocturno, el encabezado sigue oscuro mientras el hero está detrás (sin franja blanca)
  const hasDarkHero = DARK_HERO_ROUTES.includes(pathname);
  const overHero = useOverDarkHero(hasDarkHero);
  const dark = hasDarkHero && (overHero || !scrolled);
  const headerRef = useRef(null);

  // Publica la altura del encabezado (sin compactar) en --header-h: los heros nocturnos la usan para
  // subir por detrás del encabezado transparente y que el cielo empiece desde el borde de la pantalla
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;
    const publicar = () => {
      // Solo arriba del todo: al bajar el encabezado se compacta y no queremos mover el contenido
      if (window.scrollY <= 8) document.documentElement.style.setProperty("--header-h", `${el.offsetHeight}px`);
    };
    publicar();
    const ro = new ResizeObserver(publicar);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <header
      ref={headerRef}
      className={`site-nav sticky top-0 z-[1000] border-b transition-[background-color,border-color,box-shadow] duration-300 ease-[var(--ease-out-soft)] ${
        dark
          ? scrolled
            ? "border-white/10 bg-night/80 shadow-[0_4px_24px_rgb(0_0_0/0.25)] backdrop-blur-md"
            : "border-transparent bg-transparent"
          : scrolled
            ? "site-nav-light border-line/80 shadow-[0_4px_20px_rgb(11_18_36/0.09)] backdrop-blur-md"
            : "site-nav-light border-line/70 backdrop-blur-md"
      }`}
    >
      <div
        className={`mx-auto flex max-w-7xl items-center gap-4 px-4 transition-[padding] duration-300 ease-[var(--ease-out-soft)] ${
          scrolled ? "py-2" : "py-3.5"
        }`}
      >
        <Logo inverted={dark} />
        {!isHome ? (
          <div className={`hidden flex-1 md:block ${isResults ? "min-w-0" : ""}`}>
            <SearchBar compact />
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <Link
          to="/asistente"
          aria-label="Asistente"
          aria-current={pathname === "/asistente" ? "page" : undefined}
          className={`site-assistant-link ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors md:ml-0 ${
            pathname === "/asistente"
              ? "border-brand-200 bg-brand-100 text-brand-700"
              : dark
                ? "border-white/15 bg-white/5 text-white/90 hover:bg-white/10 hover:text-white"
                : "border-brand-100 bg-brand-50 text-brand-700 hover:bg-brand-100"
          }`}
        >
          <Bot className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Asistente</span>
        </Link>
        <div>
          <UserMenu dark={dark} />
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
      <main className={`flex-1 ${pathname === "/" ? "" : "app-workspace"}`}>
        {/* Si una página falla, el encabezado sigue funcionando y al navegar se recupera */}
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}
