import { Heart } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useFavorites } from "../context/FavoritesContext.jsx";

// Corazón para guardar un establecimiento. Sin sesión, lleva al login y luego regresa.
export default function FavoriteButton({ establishmentId, name, withLabel = false, className = "" }) {
  const { user } = useAuth();
  const { isFavorite, toggle } = useFavorites();
  const navigate = useNavigate();
  const location = useLocation();
  const active = isFavorite(establishmentId);

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      navigate(`/ingresar?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    toggle(establishmentId);
  }

  const label = active ? `Quitar ${name} de favoritos` : `Guardar ${name} en favoritos`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={user ? label : "Inicia sesión para guardar favoritos"}
      className={`relative z-10 inline-flex items-center justify-center gap-1.5 border text-sm font-semibold transition ${withLabel ? "rounded-xl px-2.5 py-2" : "favorite-orbit h-10 w-10 rounded-full"} ${
        active
          ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
          : "border-line bg-white text-ink-soft hover:border-rose-200 hover:text-rose-600"
      } ${className}`}
    >
      <Heart className={`favorite-heart h-4 w-4 ${active ? "fill-current" : ""}`} aria-hidden="true" />
      {withLabel && (active ? "Guardado" : "Guardar")}
    </button>
  );
}
