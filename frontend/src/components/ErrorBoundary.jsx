import { Component } from "react";

// Atrapa errores al dibujar la interfaz: en lugar de una página en blanco se muestra un mensaje
// con opciones para seguir. (En React esto solo se puede hacer con un componente de clase.)
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Queda en la consola del navegador para poder diagnosticarlo (no se envía a ningún servicio externo)
    console.error("Error en la interfaz:", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Al navegar a otra página (cambia resetKey) se intenta de nuevo
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // Tras publicar una versión nueva, un archivo viejo de la app puede ya no existir: basta recargar
    const outdated = /dynamically imported module|Importing a module script failed|Loading chunk/i.test(String(error?.message));
    return (
      <div role="alert" className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-4xl" aria-hidden="true">😵</p>
        <h1 className="mt-3 text-xl font-extrabold">
          {outdated ? "Hay una versión nueva de Easy Search" : "Algo salió mal al mostrar esta página"}
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {outdated
            ? "Recarga la página para usar la versión más reciente."
            : "No es tu culpa. Puedes recargar la página o volver al inicio; si el problema sigue, inténtalo más tarde."}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>Recargar</button>
          {/* <a> y no <Link>: funciona aunque el error haya ocurrido fuera del enrutador */}
          <a href="/" className="btn-ghost">Ir al inicio</a>
        </div>
      </div>
    );
  }
}
