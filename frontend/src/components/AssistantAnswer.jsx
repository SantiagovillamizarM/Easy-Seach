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
function formatSimilitud(valor) {
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

function Fuentes({ fuentes, umbral }) {
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

function Calificar({ consulta, onActualizada }) {
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

/** Una consulta al asistente con su respuesta, pasos, fuentes y calificación. */
export default function AssistantAnswer({ consulta, onActualizada, destacada = false }) {
  const r = consulta.respuesta;
  const fecha = new Date(consulta.creadaEn);
  return (
    <article className={`card p-5 ${destacada ? "ring-2 ring-brand-100" : ""}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 flex-1 text-base font-bold">{consulta.pregunta}</h2>
        <EstadoBadge estado={consulta.estado} />
      </header>
      <p className="mt-1 text-xs text-ink-soft">
        {fecha.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
        {consulta.duracionMs != null && ` · respondida en ${(consulta.duracionMs / 1000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} s`}
      </p>

      {consulta.estado === "ERROR" && (
        <p className="mt-4 rounded-xl bg-closed-bg px-3 py-2.5 text-sm text-closed">
          {consulta.detalleError || "El asistente no está disponible en este momento."} Intenta de nuevo en unos minutos.
        </p>
      )}

      {r && (
        <>
          <p className="mt-4 leading-relaxed">{r.texto}</p>

          {consulta.estado === "SIN_RESULTADOS" && (
            <p className="mt-2 text-xs text-ink-soft">
              Ningún negocio registrado respondía tu pregunta con suficiente similitud
              {consulta.mejorSimilitud != null && ` (la más alta fue ${formatSimilitud(consulta.mejorSimilitud)}; el mínimo es ${formatSimilitud(consulta.umbral)})`}.
              Preferimos decírtelo antes que inventar una respuesta.
            </p>
          )}

          {r.pasos.length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Pasos recomendados</h3>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">
                {r.pasos.map((paso, i) => <li key={i}>{paso}</li>)}
              </ol>
            </div>
          )}

          {r.fuentes.length > 0 && <Fuentes fuentes={r.fuentes} umbral={consulta.umbral} />}

          {onActualizada && <Calificar key={consulta.id} consulta={consulta} onActualizada={onActualizada} />}
        </>
      )}
    </article>
  );
}
