// Contador de visitas propio y anónimo: avisa al servidor qué página se abrió.
// Sin cookies, sin servicios externos y sin datos personales; respeta "No rastrear" del navegador.

let firstView = true;

export function trackPageview(pathname, loggedIn) {
  if (pathname.startsWith("/admin")) return;
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
  // Solo la primera página trae el sitio de donde llegó (Google, Instagram…); las demás son navegación interna
  const referrer = firstView ? document.referrer || null : null;
  firstView = false;
  try {
    fetch("/api/analytics/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname, referrer, logged_in: Boolean(loggedIn) }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // contar visitas nunca debe romper la página
  }
}
