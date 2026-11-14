import { CheckCircle2, MessageSquare } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { OwnerReply } from "../ReviewsSection.jsx";
import { Stars } from "../Stars.jsx";

const PAGE = 20;

function formatDate(value) {
  return new Date(value).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

// Pestaña "Reseñas" del panel: lo que dicen los clientes y la respuesta pública del negocio.
// Una reseña respondida se queda en la lista (con su respuesta) hasta cambiar de filtro: así el dueño ve lo que hizo.
export default function ReviewsReplies({ establishment }) {
  const [pendingOnly, setPendingOnly] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(
    (opts) =>
      api
        .ownerReviews(establishment.id, { pending: pendingOnly, limit: PAGE }, opts)
        .then(setData)
        .catch((err) => {
          if (err.name !== "AbortError") setError(err.message);
        }),
    [establishment.id, pendingOnly],
  );

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);
    load({ signal: controller.signal });
    return () => controller.abort();
  }, [load]);

  async function loadMore() {
    const more = await api.ownerReviews(establishment.id, { pending: pendingOnly, limit: PAGE, offset: data.items.length });
    setData((d) => ({ ...d, items: [...d.items, ...more.items] }));
  }

  const replaceItem = useCallback((updated) => {
    setData((d) => {
      const before = d.items.find((it) => it.id === updated.id);
      const delta = Boolean(before?.owner_reply) === Boolean(updated.owner_reply) ? 0 : updated.owner_reply ? -1 : 1;
      return { ...d, unanswered: d.unanswered + delta, items: d.items.map((it) => (it.id === updated.id ? updated : it)) };
    });
  }, []);

  const filters = [
    { value: true, label: "Sin responder", count: data?.unanswered },
    { value: false, label: "Todas" },
  ];

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Reseñas de tus clientes</h2>
          <p className="text-sm text-ink-soft">
            Tus respuestas son públicas: las ve todo el que visita tu perfil. Agradece, aclara o cuenta qué vas a mejorar.
          </p>
        </div>
        <div className="flex gap-1 rounded-xl border border-line bg-white p-1" role="group" aria-label="Filtrar reseñas">
          {filters.map((f) => (
            <button
              key={f.label}
              type="button"
              aria-pressed={pendingOnly === f.value}
              onClick={() => setPendingOnly(f.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                pendingOnly === f.value ? "bg-brand-600 text-white" : "text-ink-soft hover:bg-brand-50 hover:text-ink"
              }`}
            >
              {f.label}
              {f.count > 0 && (
                <span className={`ml-1.5 rounded-full px-1.5 text-xs ${pendingOnly === f.value ? "bg-white/25" : "bg-amber-100 text-amber-800"}`}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-closed">{error}</p>}

      {!data && !error && (
        <div className="mt-5 space-y-3" aria-hidden="true">
          {[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      )}

      {data && data.items.length === 0 && (
        <div className="mt-6 flex flex-col items-center gap-2 py-6 text-center">
          {pendingOnly ? (
            <>
              <CheckCircle2 className="h-8 w-8 text-open" aria-hidden="true" />
              <p className="font-semibold">Estás al día</p>
              <p className="text-sm text-ink-soft">No tienes reseñas por responder.</p>
            </>
          ) : (
            <>
              <MessageSquare className="h-8 w-8 text-ink-soft" aria-hidden="true" />
              <p className="font-semibold">Todavía no tienes reseñas publicadas</p>
              <p className="text-sm text-ink-soft">Cuando un cliente califique tu negocio, aparecerá aquí.</p>
            </>
          )}
        </div>
      )}

      {data && data.items.length > 0 && (
        <ul className="mt-5 divide-y divide-line">
          {data.items.map((r) => (
            <li key={r.id} className="py-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{r.author}</p>
                <p className="text-xs text-ink-soft">
                  {formatDate(r.created_at)}
                  {r.edited && " · editada"}
                </p>
              </div>
              <div className="mt-1"><Stars value={r.rating} size="h-3.5 w-3.5" /></div>
              {r.comment ? (
                <p className="mt-2 text-sm leading-relaxed">{r.comment}</p>
              ) : (
                <p className="mt-2 text-sm italic text-ink-soft">Solo dejó la calificación, sin comentario.</p>
              )}
              <OwnerReply review={r} canReply onChange={replaceItem} />
            </li>
          ))}
        </ul>
      )}

      {data && data.items.length < data.total && (
        <button type="button" className="btn-ghost mt-2" onClick={loadMore}>Ver más reseñas</button>
      )}
    </section>
  );
}
