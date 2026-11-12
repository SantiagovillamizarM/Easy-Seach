import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// Enlaces del menú. Los bloques siguientes agregan Favoritos e Historial.
export const ACCOUNT_LINKS = [{ to: "/perfil", label: "Mi perfil", icon: UserRound }];

export default function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Cerrar al hacer clic fuera o al cambiar de página
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) {
    const next = location.pathname === "/" ? "" : `?next=${encodeURIComponent(location.pathname + location.search)}`;
    return (
      <div className="flex shrink-0 items-center gap-2">
        <Link to={`/ingresar${next}`} className="btn-ghost px-3 py-2">Ingresar</Link>
        <Link to={`/registro${next}`} className="btn-primary hidden px-3 py-2 sm:inline-flex">Crear cuenta</Link>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-xl border border-line bg-white py-1 pl-1 pr-2 hover:border-brand-200"
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
          {user.full_name.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-32 truncate text-sm font-semibold sm:block">{user.full_name.split(" ")[0]}</span>
        <ChevronDown className="h-4 w-4 text-ink-soft" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 z-[1200] mt-2 w-56 p-1.5">
          <p className="truncate px-3 py-2 text-xs text-ink-soft">{user.email}</p>
          {ACCOUNT_LINKS.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} role="menuitem" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-brand-50">
              <Icon className="h-4 w-4 text-ink-soft" aria-hidden="true" />
              {label}
            </Link>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              logout();
              navigate("/");
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-closed hover:bg-closed-bg"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
