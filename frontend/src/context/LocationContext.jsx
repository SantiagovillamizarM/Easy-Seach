import { createContext, useCallback, useContext, useMemo, useState } from "react";

// Ubicación del usuario.
// Privacidad: las coordenadas viven SOLO en memoria (no localStorage, no URL) y se pierden al cerrar la pestaña.

const LocationContext = createContext(null);

const MESSAGES = {
  denied: "No diste permiso de ubicación. Puedes activarlo en la configuración del navegador o escribir un lugar.",
  unavailable: "No pudimos determinar tu ubicación. Intenta de nuevo o escribe un lugar.",
  timeout: "La ubicación tardó demasiado. Intenta de nuevo o escribe un lugar.",
  unsupported: "Tu navegador no permite obtener la ubicación. Escribe un municipio o barrio.",
};

export function LocationProvider({ children }) {
  const [coords, setCoords] = useState(null); // { latitude, longitude, accuracy }
  const [status, setStatus] = useState("idle"); // idle | requesting | granted | error
  const [error, setError] = useState(null);

  const request = useCallback(
    () =>
      new Promise((resolve) => {
        if (!("geolocation" in navigator)) {
          setStatus("error");
          setError(MESSAGES.unsupported);
          resolve(null);
          return;
        }
        setStatus("requesting");
        setError(null);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const value = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            };
            setCoords(value);
            setStatus("granted");
            resolve(value);
          },
          (err) => {
            setStatus("error");
            setError(
              err.code === err.PERMISSION_DENIED
                ? MESSAGES.denied
                : err.code === err.TIMEOUT
                  ? MESSAGES.timeout
                  : MESSAGES.unavailable,
            );
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
        );
      }),
    [],
  );

  const clear = useCallback(() => {
    setCoords(null);
    setStatus("idle");
    setError(null);
  }, []);

  const value = useMemo(() => ({ coords, status, error, request, clear }), [coords, status, error, request, clear]);
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useUserLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useUserLocation debe usarse dentro de LocationProvider");
  return ctx;
}
