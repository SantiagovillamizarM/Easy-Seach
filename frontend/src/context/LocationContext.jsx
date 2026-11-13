import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// Ubicación del usuario.
//
// Se pregunta UNA vez: lo que se recuerda en el navegador es la DECISIÓN ("on" / "off"), nunca las coordenadas.
// Privacidad: las coordenadas viven solo en memoria, viajan en el cuerpo de la búsqueda y nunca se guardan
// (ni en localStorage, ni en la URL, ni en el historial del servidor, ni se envían a la IA).

const LocationContext = createContext(null);
const PREF_KEY = "easysearch.location";        // "on" | "off"  (sin valor = nunca se ha preguntado)
const HINT_KEY = "easysearch.locationHintSeen"; // la sugerencia tras la primera búsqueda ya se mostró

const MESSAGES = {
  denied: "No diste permiso de ubicación. Puedes activarlo en la configuración del navegador o escribir un lugar.",
  unavailable: "No pudimos determinar tu ubicación. Intenta de nuevo o escribe un lugar.",
  timeout: "La ubicación tardó demasiado. Intenta de nuevo o escribe un lugar.",
  unsupported: "Tu navegador no permite obtener la ubicación. Escribe un municipio o barrio.",
};

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // navegación privada o almacenamiento bloqueado
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // sin almacenamiento: la preferencia dura solo mientras la pestaña esté abierta
  }
}

function getPosition(options) {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      reject,
      options,
    ),
  );
}

export function LocationProvider({ children }) {
  const [coords, setCoords] = useState(null); // { latitude, longitude, accuracy }
  const [pref, setPref] = useState(() => readStorage(PREF_KEY));
  // auto = obteniendo la ubicación sola al abrir la app (la búsqueda espera para no hacerse dos veces)
  const [status, setStatus] = useState(() => (readStorage(PREF_KEY) === "on" ? "auto" : "idle"));
  const [error, setError] = useState(null);
  const [hintSeen, setHintSeen] = useState(() => readStorage(HINT_KEY) === "1");

  const savePref = useCallback((value) => {
    writeStorage(PREF_KEY, value);
    setPref(value);
  }, []);

  // Al abrir la app: si el usuario ya aceptó y el navegador conserva el permiso, se ubica sin preguntar.
  useEffect(() => {
    if (status !== "auto") return;
    let cancelled = false;
    (async () => {
      try {
        if (!("geolocation" in navigator)) throw new Error("unsupported");
        // Solo si el permiso sigue concedido: nunca aparece una ventana de permiso sin que el usuario lo pida
        const permission = await navigator.permissions?.query({ name: "geolocation" }).catch(() => null);
        if (permission && permission.state !== "granted") {
          if (permission.state === "denied") savePref("off");
          throw new Error("not-granted");
        }
        // Una posición de hasta 5 minutos sirve: responde rápido y no hace esperar a la búsqueda
        const value = await getPosition({ enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
        if (!cancelled) {
          setCoords(value);
          setStatus("granted");
        }
      } catch {
        if (!cancelled) setStatus("idle"); // sin ubicación: la búsqueda sigue normalmente
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, savePref]);

  const request = useCallback(async () => {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setError(MESSAGES.unsupported);
      return null;
    }
    setStatus("requesting");
    setError(null);
    try {
      const value = await getPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
      setCoords(value);
      setStatus("granted");
      savePref("on"); // se recuerda la decisión: la próxima visita no vuelve a preguntar
      return value;
    } catch (err) {
      setStatus("error");
      if (err.code === err.PERMISSION_DENIED) savePref("off");
      setError(
        err.code === err.PERMISSION_DENIED ? MESSAGES.denied : err.code === err.TIMEOUT ? MESSAGES.timeout : MESSAGES.unavailable,
      );
      return null;
    }
  }, [savePref]);

  // "Dejar de usar mi ubicación": también se recuerda
  const clear = useCallback(() => {
    setCoords(null);
    setStatus("idle");
    setError(null);
    savePref("off");
  }, [savePref]);

  const dismissHint = useCallback(() => {
    writeStorage(HINT_KEY, "1");
    setHintSeen(true);
  }, []);

  const value = useMemo(
    () => ({
      coords,
      status,
      error,
      request,
      clear,
      pref,
      // La sugerencia se muestra una sola vez y solo a quien nunca ha decidido
      showHint: !coords && !hintSeen && pref === null && status !== "auto",
      dismissHint,
    }),
    [coords, status, error, request, clear, pref, hintSeen, dismissHint],
  );
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useUserLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useUserLocation debe usarse dentro de LocationProvider");
  return ctx;
}
