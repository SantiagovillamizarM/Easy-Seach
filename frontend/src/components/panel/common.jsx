import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useCallback, useState } from "react";

// Piezas compartidas por las pestañas del editor del panel comercial.

/** Mensaje de éxito o error debajo de un formulario. */
export function Notice({ ok, error }) {
  if (error) {
    return <p role="alert" className="rounded-xl bg-closed-bg px-3 py-2 text-sm text-closed">{error}</p>;
  }
  if (ok) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl bg-open-bg px-3 py-2 text-sm text-open">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        {ok}
      </p>
    );
  }
  return null;
}

export function SaveButton({ loading, disabled, children = "Guardar cambios", className = "" }) {
  return (
    <button type="submit" className={`btn-primary ${className}`} disabled={loading || disabled}>
      {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

/**
 * Ejecuta una acción contra la API y guarda el estado (cargando / error / éxito).
 * Uso: const { state, run } = useAction();  run(() => api.algo(), "Guardado.")
 */
export function useAction() {
  const [state, setState] = useState({ loading: false, error: null, ok: null });
  const run = useCallback(async (fn, okMessage) => {
    setState({ loading: true, error: null, ok: null });
    try {
      const result = await fn();
      setState({ loading: false, error: null, ok: okMessage ?? null });
      return result;
    } catch (err) {
      setState({ loading: false, error: err.message, ok: null });
      return undefined;
    }
  }, []);
  const fail = useCallback((message) => setState({ loading: false, error: message, ok: null }), []);
  return { state, run, fail };
}

/** Campo de formulario con etiqueta: input normal o textarea (multiline). */
export function PanelField({ id, label, hint, multiline, className = "", ...props }) {
  const Tag = multiline ? "textarea" : "input";
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">{label}</label>
      <Tag id={id} className="input" aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}
