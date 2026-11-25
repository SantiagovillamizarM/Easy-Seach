import L from "leaflet";
import { Crosshair, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

// Elegir en el mapa dónde queda un negocio: se toca el mapa o se arrastra el pin.
// "Usar mi ubicación" sirve cuando la persona está en el local.

const DEFAULT_CENTER = [7.07, -73.11]; // área metropolitana de Bucaramanga
// Mismos límites que valida el servidor (Bucaramanga, Floridablanca, Girón y Piedecuesta con margen)
export const METRO_BOUNDS = { lat: [6.8, 7.3], lng: [-73.35, -72.9] };

export function insideMetro(point) {
  return Boolean(point) && point.latitude >= METRO_BOUNDS.lat[0] && point.latitude <= METRO_BOUNDS.lat[1]
    && point.longitude >= METRO_BOUNDS.lng[0] && point.longitude <= METRO_BOUNDS.lng[1];
}

const pinIcon = L.divIcon({
  className: "",
  html: '<div class="es-marker is-active"><span>✓</span></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
});

function ClickToPlace({ onChange }) {
  useMapEvents({ click: (e) => onChange({ latitude: e.latlng.lat, longitude: e.latlng.lng }) });
  return null;
}

// Mueve el mapa cuando cambia el foco (municipio elegido o "mi ubicación"), no cada vez que se mueve el pin
function Focus({ focus }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.setView([focus.latitude, focus.longitude], focus.zoom ?? 15, { animate: true });
  }, [map, focus]);
  return null;
}

const GEO_ERRORS = {
  1: "No diste permiso de ubicación. Marca el punto tocando el mapa.",
  2: "No pudimos saber dónde estás. Marca el punto tocando el mapa.",
  3: "La ubicación tardó demasiado. Intenta de nuevo o toca el mapa.",
};

// `focus` lo controla la página (p. ej. al elegir el municipio); `onFocus` lo mueve al usar "mi ubicación"
export default function LocationPicker({ value, onChange, focus, onFocus, id }) {
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(null);

  function locateMe() {
    if (!navigator.geolocation) {
      setGeoError("Tu navegador no permite obtener la ubicación. Marca el punto tocando el mapa.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setLocating(false);
        onChange(point);
        onFocus?.({ ...point, zoom: 17 });
      },
      (err) => {
        setLocating(false);
        setGeoError(GEO_ERRORS[err.code] ?? GEO_ERRORS[2]);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  return (
    <div className="space-y-2">
      <div id={id} className="h-72 overflow-hidden rounded-2xl border border-line sm:h-80">
        <MapContainer center={DEFAULT_CENTER} zoom={12} scrollWheelZoom={false} className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToPlace onChange={onChange} />
          <Focus focus={focus} />
          {value && (
            <Marker
              position={[value.latitude, value.longitude]}
              icon={pinIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const p = e.target.getLatLng();
                  onChange({ latitude: p.lat, longitude: p.lng });
                },
              }}
            />
          )}
        </MapContainer>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
        <span>
          {value
            ? `Punto marcado: ${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}. Arrastra el pin para ajustarlo.`
            : "Toca el mapa en el lugar exacto del negocio."}
        </span>
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={locateMe} disabled={locating}>
          {locating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />}
          Estoy en el negocio: usar mi ubicación
        </button>
      </div>
      {geoError && <p role="alert" className="text-xs text-closed">{geoError}</p>}
    </div>
  );
}
