import { useEffect, useRef, useState } from "react";

// Utilidades de movimiento sin dependencias: un único IntersectionObserver compartido
// revela los elementos con clase "reveal" cuando entran en pantalla (una sola vez).

let observer = null;

function getObserver() {
  if (observer || typeof IntersectionObserver === "undefined") return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    // Se revela un poco antes de llegar al borde inferior para que no se note el "salto"
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
  );
  return observer;
}

/** Activa los estilos de revelado. Llamarlo una vez al arrancar la app. */
export function enableMotion() {
  // Sin IntersectionObserver no se oculta nada: el contenido queda siempre visible
  if (typeof IntersectionObserver !== "undefined") {
    document.documentElement.classList.add("js-motion");
  }
}

/** Devuelve una ref para un elemento con clase "reveal". */
export function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const obs = getObserver();
    if (!el) return undefined;
    if (!obs) {
      el.classList.add("is-visible");
      return undefined;
    }
    obs.observe(el);
    return () => obs.unobserve(el);
  }, []);
  return ref;
}

/**
 * true mientras un elemento oscuro marcado con `data-dark-hero` está detrás del encabezado.
 * Así el encabezado sigue oscuro sobre el hero y solo pasa a claro al llegar al contenido claro.
 */
export function useOverDarkHero(enabled, headerHeight = 72) {
  const [over, setOver] = useState(enabled);
  useEffect(() => {
    if (!enabled) {
      setOver(false);
      return undefined;
    }
    const hero = document.querySelector("[data-dark-hero]");
    if (!hero || typeof IntersectionObserver === "undefined") {
      setOver(true);
      return undefined;
    }
    // Solo cuenta la franja superior de la ventana, donde está el encabezado
    const obs = new IntersectionObserver(([entry]) => setOver(entry.isIntersecting), {
      rootMargin: `0px 0px -${Math.max(window.innerHeight - headerHeight, 0)}px 0px`,
    });
    obs.observe(hero);
    return () => obs.disconnect();
  }, [enabled, headerHeight]);
  return over;
}

/** true cuando la página se ha desplazado más de `offset` píxeles. */
export function useScrolled(offset = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > offset);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [offset]);
  return scrolled;
}
