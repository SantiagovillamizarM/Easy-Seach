import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { Link } from "react-router-dom";

// Centro por defecto: área metropolitana de Bucaramanga
const DEFAULT_CENTER = [7.07, -73.11];

function numberedIcon(n, active) {
  return L.divIcon({
    className: "",
    html: `<div class="es-marker${active ? " is-active" : ""}"><span>${n}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28],
  });
}

const userIcon = L.divIcon({ className: "", html: '<div class="es-user-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    let needsFit = true;

    function fitVisibleMap() {
      if (!container.clientWidth || !container.clientHeight) {
        needsFit = true;
        return;
      }
      map.invalidateSize({ pan: false, debounceMoveend: true });
      if (!needsFit) return;
      needsFit = false;
      if (points.length === 1) map.setView(points[0], 16, { animate: false });
      if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16, animate: false });
    }

    fitVisibleMap();
    const observer = new ResizeObserver(fitVisibleMap);
    observer.observe(container);
    return () => observer.disconnect();
  }, [map, points]);
  return null;
}

// Trancón en la ruta (página del lugar): la ruta en azul suave y cada tramo con trancón en rojo, con una
// etiqueta fija que dice en qué vía está y cuánto demora
function TrafficLayer({ traffic }) {
  return (
    <>
      {traffic.route?.length > 1 && (
        <Polyline positions={traffic.route} pathOptions={{ color: "#6366f1", weight: 5, opacity: 0.45, lineCap: "round" }} />
      )}
      {traffic.jams?.map((jam, i) => (
        <Polyline
          key={i}
          positions={jam.points}
          pathOptions={{ color: "#dc2626", weight: 7, opacity: 0.95, lineCap: "round", className: "es-jam-line" }}
        >
          <Tooltip permanent direction="top" offset={[0, -6]} className="es-jam-label">
            Trancón{jam.street ? `: ${jam.street}` : ""} · +{jam.delay_minutes} min
          </Tooltip>
        </Polyline>
      ))}
    </>
  );
}

export default function ResultsMap({ results, userCoords, activeId, onSelect, traffic = null, className = "" }) {
  const points = useMemo(() => {
    const list = results.map((r) => [r.latitude, r.longitude]);
    if (userCoords) list.push([userCoords.latitude, userCoords.longitude]);
    // Con trancón, el encuadre incluye toda la ruta para que se vea dónde está
    if (traffic?.route?.length) list.push(...traffic.route);
    return list;
  }, [results, userCoords, traffic]);

  return (
    <MapContainer center={DEFAULT_CENTER} zoom={12} scrollWheelZoom className={`h-full w-full ${className}`}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} />
      {traffic && <TrafficLayer traffic={traffic} />}
      {userCoords && (
        <Marker position={[userCoords.latitude, userCoords.longitude]} icon={userIcon}>
          <Popup>Tu ubicación</Popup>
        </Marker>
      )}
      {results.map((r, i) => (
        <Marker
          key={r.id}
          position={[r.latitude, r.longitude]}
          icon={numberedIcon(i + 1, r.id === activeId)}
          title={r.name}
          alt={r.name}
          zIndexOffset={r.id === activeId ? 1000 : 0}
          eventHandlers={{ click: () => onSelect?.(r.id) }}
        >
          <Popup>
            <Link to={`/lugar/${r.slug}`} className="font-semibold">{r.name}</Link>
            <br />
            <span className="text-xs">{r.hours_status?.label}</span>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
