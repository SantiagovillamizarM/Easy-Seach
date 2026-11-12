import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
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
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 16);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
  }, [map, points]);
  return null;
}

export default function ResultsMap({ results, userCoords, activeId, onSelect, className = "" }) {
  const points = useMemo(() => {
    const list = results.map((r) => [r.latitude, r.longitude]);
    if (userCoords) list.push([userCoords.latitude, userCoords.longitude]);
    return list;
  }, [results, userCoords]);

  return (
    <MapContainer center={DEFAULT_CENTER} zoom={12} scrollWheelZoom className={`h-full w-full ${className}`}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} />
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
