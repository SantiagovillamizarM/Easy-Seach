// Piezas de las respuestas del asistente (estado, fuentes con su similitud y calificación).
// El chat (AssistantChat.jsx) las usa dentro de cada mensaje.
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Loader2, SearchX, Star } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { StarInput, Stars } from "./Stars.jsx";

const ESTADOS = {
  RESPONDIDA: { label: "Respondida", icon: CheckCircle2, className: "bg-open-bg text-open" },
  SIN_RESULTADOS: { label: "Sin resultados", icon: SearchX, className: "bg-muted text-ink-soft" },
  ERROR: { label: "Error", icon: AlertTriangle, className: "bg-closed-bg text-closed" },
  PENDIENTE: { label: "Pendiente", icon: Clock, className: "bg-warn-bg text-warn" },
};

/** Similitud coseno con 3 decimales: es el valor real que calculó pgvector (verificable). */
export function formatSimilitud(valor) {
  return Number(valor).toLocaleString("es-CO", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export function EstadoBadge({ estado }) {
  const info = ESTADOS[estado] ?? ESTADOS.PENDIENTE;
  const Icon = info.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${info.className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {info.label}
    </span>
  );
}

export function Fuentes({ fuentes, umbral }) {
  return (
    <div className="mt-5">
      <h3 className="text-xs font-bold uppercase tracking-wide text-ink-soft">
        Fuentes ({fuentes.length}) · negocios registrados en Easy Search
      </h3>
      <ol className="mt-2 divide-y divide-line rounded-xl border border-line">
        {fuentes.map((f) => {
          const superaPor = f.similitud - umbral;
          return (
            <li key={`${f.posicion}-${f.nombre}`} className="flex items-center gap-3 px-3 py-2.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                {f.posicion}
              </span>
              <div className="min-w-0 flex-1">
                {f.slug ? (
                  <Link to={`/lugar/${f.slug}`} className="inline-flex items-center gap-1 font-semibold hover:text-brand-700 hover:underline">
                    {f.nombre}
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </Link>
                ) : (
                  <span className="font-semibold">{f.nombre}</span>
                )}
                <p className="text-xs text-ink-soft">supera el mínimo ({formatSimilitud(umbral)}) por {formatSimilitud(superaPor)}</p>
              </div>
              <span className="shrink-0 text-right text-xs text-ink-soft">
                similitud
                <span className="block font-mono text-sm font-semibold text-ink">{formatSimilitud(f.similitud)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function Calificar({ consulta, onActualizada }) {
  const actual = consulta.respuesta?.calificacion;
  const [editando, setEditando] = useState(!actual);
  const [puntuacion, setPuntuacion] = useState(actual?.puntuacion ?? 0);
  const [comentario, setComentario] = useState(actual?.comentario ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  if (!editando && actual) {
    return (
      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-canvas px-3 py-2.5 text-sm">
        <span className="text-ink-soft">Tu calificación:</span>
        <Stars value={actual.puntuacion} />
        {actual.comentario && <span className="italic text-ink-soft">“{actual.comentario}”</span>}
        <button type="button" className="ml-auto text-xs font-semibold text-brand-700 hover:underline" onClick={() => setEditando(true)}>
          Cambiar
        </button>
      </div>
    );
  }

  async function guardar(e) {
    e.preventDefault();
    if (!puntuacion) return;
    setGuardando(true);
    setError(null);
    try {
      const actualizada = await api.asistente.calificar(consulta.id, puntuacion, comentario.trim());
      onActualizada(actualizada);
      setEditando(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="mt-5 rounded-xl border border-dashed border-line p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Star className="h-4 w-4 text-star" aria-hidden="true" />
        ¿Qué tan útil fue esta respuesta?
      </p>
      <div className="mt-2">
        <StarInput value={puntuacion} onChange={setPuntuacion} name={`calificacion-${consulta.id}`} />
      </div>
      {puntuacion > 0 && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor={`comentario-${consulta.id}`}>Comentario (opcional)</label>
          <input
            id={`comentario-${consulta.id}`}
            className="input"
            maxLength={500}
            placeholder="Comentario opcional"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
          <button type="submit" className="btn-primary shrink-0" disabled={guardando}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Guardar calificación
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-closed">{error}</p>}
    </form>
  );
}
