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

export default function TrafficNotice({ establishmentId }) {
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

  if (!canAsk || !report) return null;

  return (
    <div role="status" className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100">
        <TrafficCone className="h-5 w-5 text-amber-700" aria-hidden="true" />
      </span>
      <div className="text-sm">
        <p className="font-semibold text-ink">Hay trancón en {joinStreets(report.streets)}</p>
        <p className="text-ink-soft">
          Si vas a pedir a domicilio, tu pedido se puede demorar entre {report.delay_min} y {report.delay_max} minutos
          más de lo normal.
        </p>
        <p className="mt-1 text-xs text-ink-soft">Tráfico en vivo de TomTom, calculado con tu ubicación aproximada.</p>
      </div>
    </div>
  );
}
