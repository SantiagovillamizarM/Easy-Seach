import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ResultCard, { ResultCardSkeleton } from "../components/ResultCard.jsx";
import { useFavorites } from "../context/FavoritesContext.jsx";
import { api } from "../lib/api.js";

export default function FavoritesPage() {
  const { ids } = useFavorites();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = "Mis favoritos · Easy Search";
    const controller = new AbortController();
    api
      .favorites({ signal: controller.signal })
      .then(setItems)
      .catch((err) => err.name !== "AbortError" && setError(err.message));
    return () => controller.abort();
  }, []);

  // Al quitar un corazón, la tarjeta desaparece de la lista sin recargar
  const visible = items?.filter((i) => ids.has(i.id)) ?? null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
        <Heart className="h-6 w-6 fill-rose-500 text-rose-500" aria-hidden="true" />
        Mis favoritos
      </h1>
      <p className="mt-1 text-sm text-ink-soft">Los lugares que guardaste para volver a encontrarlos rápido.</p>

      <div className="mt-6 space-y-3">
        {error && <p className="text-closed">{error}</p>}
        {!error && visible === null && [0, 1, 2].map((i) => <ResultCardSkeleton key={i} />)}
        {visible?.length === 0 && (
          <div className="card flex flex-col items-center gap-2 p-10 text-center">
            <Heart className="h-8 w-8 text-ink-soft" aria-hidden="true" />
            <p className="font-semibold">Todavía no tienes favoritos</p>
            <p className="max-w-sm text-sm text-ink-soft">Toca el corazón en cualquier resultado para guardarlo aquí.</p>
            <Link to="/" className="btn-primary mt-3">Buscar lugares</Link>
          </div>
        )}
        {visible?.map((item) => (
          <ResultCard key={item.id} result={item} />
        ))}
      </div>
    </div>
  );
}
