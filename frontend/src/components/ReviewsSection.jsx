import { CheckCircle2, Clock, CornerDownRight, Flag, MessageSquare, Pencil, Store, Trash2, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { Stars, StarInput } from "./Stars.jsx";

const STATUS = {
  approved: { label: "Publicada", icon: CheckCircle2, className: "bg-open-bg text-open" },
  pending: { label: "En revisión", icon: Clock, className: "bg-amber-50 text-amber-700" },
  rejected: { label: "No publicada", icon: XCircle, className: "bg-closed-bg text-closed" },
};

function formatDate(value) {
  return new Date(value).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

function ReviewForm({ initial, onSubmit, onCancel }) {
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!rating) {
      setError("Elige una calificación de 1 a 5 estrellas.");
      return;
    }
    const text = comment.trim();
    if (text && text.length < 10) {
      setError("El comentario es muy corto (mínimo 10 caracteres) o déjalo vacío.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ rating, comment: text || null });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-line bg-canvas p-4">
      <StarInput value={rating} onChange={setRating} />
      <div>
        <label htmlFor="review-comment" className="sr-only">Comentario</label>
        <textarea
          id="review-comment"
          rows={3}
          maxLength={1000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Cuéntale a otros cómo te fue (opcional): atención, calidad, precios…"
          className="input resize-y"
        />
        <p className="mt-1 text-right text-xs text-ink-soft">{comment.length}/1000</p>
      </div>
      <p className="text-xs text-ink-soft">
        Las reseñas se revisan automáticamente. No incluyas groserías, teléfonos, enlaces ni datos personales.
      </p>
      {error && <p role="alert" className="text-sm text-closed">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={saving}>
          {initial ? "Guardar cambios" : "Publicar reseña"}
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancelar</button>
        )}
      </div>
    </form>
  );
}

function MyReview({ review, onEdit, onDelete }) {
  const status = STATUS[review.status];
  const Icon = status.icon;
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold">Tu reseña</p>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {status.label}
        </span>
      </div>
      <div className="mt-2"><Stars value={review.rating} /></div>
      {review.comment && <p className="mt-2 text-sm">{review.comment}</p>}
      {review.moderation_reason && review.status !== "approved" && (
        <p className="mt-2 text-xs text-ink-soft">{review.moderation_reason}</p>
      )}
      <div className="mt-3 flex gap-2">
        <button type="button" className="btn-ghost px-3 py-1.5" onClick={onEdit}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Editar
        </button>
        {confirm ? (
          <>
            <button type="button" className="btn bg-closed px-3 py-1.5 text-white" onClick={onDelete}>Sí, eliminar</button>
            <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => setConfirm(false)}>Cancelar</button>
          </>
        ) : (
          <button type="button" className="btn-ghost px-3 py-1.5 text-closed" onClick={() => setConfirm(true)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Eliminar
          </button>
        )}
      </div>
    </div>
  );
}

// Respuesta pública del propietario. Quien puede responder (dueño de este lugar o admin) la crea, edita o borra.
export function OwnerReply({ review, canReply, onChange }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  function startEditing() {
    setText(review.owner_reply ?? "");
    setError(null);
    setEditing(true);
  }

  async function save(e) {
    e.preventDefault();
    if (text.trim().length < 2) {
      setError("Escribe una respuesta.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onChange(await api.replyToReview(review.id, text.trim()));
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setError(null);
    try {
      await api.deleteReply(review.id);
      onChange({ ...review, owner_reply: null, owner_reply_at: null });
      setConfirm(false);
    } catch (err) {
      setError(err.message);
    }
  }

  if (editing) {
    const id = `reply-${review.id}`;
    return (
      <form onSubmit={save} className="mt-3 space-y-2 rounded-2xl border border-brand-100 bg-brand-50/50 p-3 sm:ml-6">
        <label htmlFor={id} className="text-xs font-bold">Tu respuesta pública</label>
        <textarea
          id={id}
          rows={3}
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Agradece, aclara o cuenta qué vas a mejorar. La verá todo el que visite tu perfil."
          className="input resize-y"
          autoFocus
        />
        <p className="text-xs text-ink-soft">Sin groserías, teléfonos ni enlaces: tus datos de contacto ya están en tu perfil.</p>
        {error && <p role="alert" className="text-sm text-closed">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary px-3 py-1.5" disabled={saving}>
            {review.owner_reply ? "Guardar respuesta" : "Publicar respuesta"}
          </button>
          <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => setEditing(false)}>Cancelar</button>
        </div>
      </form>
    );
  }

  if (!review.owner_reply) {
    return canReply ? (
      <button type="button" onClick={startEditing} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
        <CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />
        Responder
      </button>
    ) : null;
  }

  return (
    <div className="mt-3 rounded-2xl border-l-4 border-brand-400 bg-canvas p-3 sm:ml-6">
      <p className="flex flex-wrap items-center gap-x-2 text-xs font-bold text-brand-700">
        <Store className="h-3.5 w-3.5" aria-hidden="true" />
        Respuesta del propietario
        <span className="font-normal text-ink-soft">{formatDate(review.owner_reply_at)}</span>
      </p>
      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{review.owner_reply}</p>
      {canReply && (
        <div className="mt-2 flex items-center gap-3 text-xs">
          <button type="button" onClick={startEditing} className="inline-flex items-center gap-1 font-semibold text-ink-soft hover:text-ink">
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Editar
          </button>
          {confirm ? (
            <span className="flex items-center gap-2">
              ¿Borrar la respuesta?
              <button type="button" className="font-semibold text-closed hover:underline" onClick={remove}>Sí</button>
              <button type="button" className="text-ink-soft hover:underline" onClick={() => setConfirm(false)}>No</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} className="inline-flex items-center gap-1 font-semibold text-ink-soft hover:text-closed">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Borrar
            </button>
          )}
        </div>
      )}
      {error && !editing && <p role="alert" className="mt-2 text-xs text-closed">{error}</p>}
    </div>
  );
}

function ReportButton({ reviewId }) {
  const [state, setState] = useState("idle"); // idle | confirm | sent | error
  if (state === "sent") return <span className="text-xs text-ink-soft">Reporte enviado. ¡Gracias!</span>;
  if (state === "confirm") {
    return (
      <span className="flex items-center gap-2 text-xs">
        ¿Reportar como inapropiada?
        <button
          type="button"
          className="font-semibold text-closed hover:underline"
          onClick={() => api.reportReview(reviewId).then(() => setState("sent")).catch(() => setState("error"))}
        >
          Sí
        </button>
        <button type="button" className="text-ink-soft hover:underline" onClick={() => setState("idle")}>No</button>
      </span>
    );
  }
  return (
    <button type="button" onClick={() => setState("confirm")} className="inline-flex items-center gap-1 text-xs text-ink-soft hover:text-closed">
      <Flag className="h-3.5 w-3.5" aria-hidden="true" />
      {state === "error" ? "No se pudo reportar, reintentar" : "Reportar"}
    </button>
  );
}

export default function ReviewsSection({ establishment, onRatingChange }) {
  const { user } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(null);
  const [mine, setMine] = useState(undefined); // undefined = cargando, null = no tiene
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const isOwner = user && establishment.owner_id === user.id;
  // Responde el propietario de ESTE lugar (rol owner) o un administrador
  const canReply = Boolean(user && (user.role === "admin" || (user.role === "owner" && isOwner)));

  const load = useCallback(async () => {
    try {
      const data = await api.reviews(establishment.id, { limit: 10 });
      setPage(data);
      onRatingChange?.(data.rating_avg, data.rating_count);
    } catch (err) {
      setError(err.message);
    }
  }, [establishment.id, onRatingChange]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) {
      setMine(null);
      return;
    }
    api.myReview(establishment.id).then(setMine).catch(() => setMine(null));
  }, [user, establishment.id]);

  async function loadMore() {
    const more = await api.reviews(establishment.id, { limit: 10, offset: page.items.length });
    setPage((p) => ({ ...p, items: [...p.items, ...more.items] }));
  }

  async function save(data) {
    const saved = mine ? await api.updateReview(mine.id, data) : await api.createReview(establishment.id, data);
    setMine(saved);
    setEditing(false);
    await load();
  }

  const replaceItem = useCallback((updated) => {
    setPage((p) => ({ ...p, items: p.items.map((it) => (it.id === updated.id ? updated : it)) }));
  }, []);

  async function remove() {
    await api.deleteReview(mine.id);
    setMine(null);
    await load();
  }

  return (
    <section className="card p-5" aria-labelledby="reviews-title">
      <h2 id="reviews-title" className="mb-4 flex items-center gap-2 text-base font-bold">
        <MessageSquare className="h-4 w-4 text-brand-600" aria-hidden="true" />
        Reseñas
      </h2>

      {error && <p className="text-sm text-closed">{error}</p>}

      {page && (
        <div className="mb-5 flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="text-center sm:w-36">
            <p className="text-4xl font-extrabold">{page.rating_avg ? page.rating_avg.toFixed(1) : "–"}</p>
            {page.rating_avg && <Stars value={page.rating_avg} />}
            <p className="mt-1 text-xs text-ink-soft">
              {page.rating_count === 0
                ? "Sin calificaciones"
                : page.rating_count === 1
                  ? "1 calificación"
                  : `${page.rating_count} calificaciones`}
            </p>
          </div>
          <div className="flex-1 space-y-1">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = page.distribution[stars] ?? 0;
              const pct = page.rating_count ? (count / page.rating_count) * 100 : 0;
              return (
                <div key={stars} className="flex items-center gap-2 text-xs text-ink-soft">
                  <span className="w-3">{stars}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Zona del usuario */}
      <div className="mb-5">
        {!user && (
          <p className="rounded-2xl bg-canvas p-4 text-sm">
            <Link to={`/ingresar?next=${encodeURIComponent(location.pathname)}`} className="font-semibold text-brand-700 hover:underline">
              Inicia sesión
            </Link>{" "}
            para calificar este lugar y escribir una reseña.
          </p>
        )}
        {user && isOwner && (
          <p className="rounded-2xl bg-canvas p-4 text-sm text-ink-soft">
            Eres el propietario de este lugar: no puedes reseñarlo, pero sí responder públicamente cada reseña.
          </p>
        )}
        {user && !isOwner && mine === null && <ReviewForm onSubmit={save} />}
        {user && !isOwner && mine && !editing && (
          <MyReview review={mine} onEdit={() => setEditing(true)} onDelete={remove} />
        )}
        {user && !isOwner && mine && editing && (
          <ReviewForm initial={mine} onSubmit={save} onCancel={() => setEditing(false)} />
        )}
      </div>

      {/* Reseñas publicadas */}
      {page?.items.length === 0 && <p className="text-sm text-ink-soft">Todavía no hay reseñas escritas. ¡Sé el primero!</p>}
      <ul className="divide-y divide-line">
        {page?.items.map((r) => (
          <li key={r.id} className="py-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{r.author}</p>
              <p className="text-xs text-ink-soft">
                {formatDate(r.created_at)}
                {r.edited && " · editada"}
              </p>
            </div>
            <div className="mt-1"><Stars value={r.rating} size="h-3.5 w-3.5" /></div>
            {r.comment && <p className="mt-2 text-sm leading-relaxed">{r.comment}</p>}
            {user && mine?.id !== r.id && <div className="mt-2"><ReportButton reviewId={r.id} /></div>}
            <OwnerReply review={r} canReply={canReply} onChange={replaceItem} />
          </li>
        ))}
      </ul>
      {page && page.items.length < page.total && (
        <button type="button" className="btn-ghost mt-2" onClick={loadMore}>Ver más reseñas</button>
      )}
    </section>
  );
}
