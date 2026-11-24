import { TrafficCone } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useUserLocation } from "../context/LocationContext.jsx";
import { api } from "../lib/api.js";

// "Hay trancón en la Carrera 27: si vas a pedir a domicilio, puede demorar 10–15 minutos más".
// Solo aparece si hay trancón de verdad; si no hay, si no hay ubicación o si el servicio falla, no se muestra nada.
// Privacidad: el servidor redondea la ubicación a ~200 m antes de consultar el tráfico y no la guarda.

function joinStreets(streets) {
  if (streets.length === 0) return "el camino entre este lugar y tu zona";
  return streets.length === 1 ? streets[0] : `${streets[0]} y ${streets[1]}`;
}

export default function TrafficNotice({ establishmentId, onReport }) {
  const { user } = useAuth();
  const { coords } = useUserLocation();
  const [report, setReport] = useState(null);
  const latitude = coords?.latitude;
  const longitude = coords?.longitude;
  const canAsk = Boolean(user?.email_verified && latitude != null);

  useEffect(() => {
    if (!canAsk) return undefined;
    const controller = new AbortController();
    api
      .traffic(establishmentId, { latitude, longitude }, { signal: controller.signal })
      .then((data) => setReport(data.report))
      .catch(() => setReport(null)); // un aviso opcional nunca debe mostrar errores
    return () => controller.abort();
  }, [canAsk, establishmentId, latitude, longitude]);

  // La página dibuja en el mapa la ruta y los tramos con trancón
  const shownReport = canAsk ? report : null;
  useEffect(() => {
    onReport?.(shownReport);
  }, [onReport, shownReport]);

  if (!shownReport) return null;
  const marked = shownReport.jams?.length > 0;

  return (
    <div role="status" className="mt-4 flex items-start gap-3 rounded-2xl border border-warn-line bg-warn-bg p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-warn-soft">
        <TrafficCone className="h-5 w-5 text-warn" aria-hidden="true" />
      </span>
      <div className="text-sm">
        <p className="font-semibold text-ink">Hay trancón en {joinStreets(shownReport.streets)}</p>
        <p className="text-ink-soft">
          Si vas a pedir a domicilio, tu pedido se puede demorar entre {shownReport.delay_min} y {shownReport.delay_max} minutos
          más de lo normal.
        </p>
        {marked && (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-closed">
            <span className="inline-block h-1 w-5 rounded-full bg-closed" aria-hidden="true" />
            Lo marcamos en rojo en el mapa, con el nombre de la vía.
          </p>
        )}
        <p className="mt-1 text-xs text-ink-soft">Tráfico en vivo de TomTom, calculado con tu ubicación aproximada.</p>
      </div>
    </div>
  );
}
