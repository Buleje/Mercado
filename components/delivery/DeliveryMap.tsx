"use client";

import { useEffect, useRef, useState } from "react";
import { Navigation, MapPin } from "lucide-react";

interface DeliveryMapProps {
  destLat: number;
  destLng: number;
  destLabel?: string;
  className?: string;
}

// Lazy-loaded internamente para evitar problemas de SSR con Leaflet
// Este componente siempre debe cargarse con next/dynamic ssr:false

export default function DeliveryMap({
  destLat,
  destLng,
  destLabel = "Destino",
  className = "",
}: DeliveryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState(false);

  // Construir URLs para abrir en apps de mapas
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`;
  const wazeUrl = `https://waze.com/ul?ll=${destLat},${destLng}&navigate=yes`;

  useEffect(() => {
    // Solicitar ubicación del repartidor
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => setLocationError(true),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    let mounted = true;

    // Leaflet solo corre en el browser
    async function initMap() {
      // Importación dinámica — nunca se ejecuta en SSR
      const L = (await import("leaflet")).default;

      // Icono por defecto de Leaflet (fix para Next.js)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      if (!mounted || !mapContainerRef.current) return;

      // Destruir mapa anterior si existe
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView([destLat, destLng], 15);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      // Marcador de destino (color naranja)
      const destIcon = L.divIcon({
        className: "",
        html: `<div style="
          width:32px; height:32px;
          background:#f4a261;
          border:3px solid white;
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          box-shadow:0 2px 6px rgba(0,0,0,0.3);
        "></div>`,
        iconAnchor: [12, 30],
        popupAnchor: [4, -30],
      });

      L.marker([destLat, destLng], { icon: destIcon })
        .addTo(map)
        .bindPopup(destLabel)
        .openPopup();

      // Marcador de ubicación del repartidor (color teal)
      if (userPos) {
        const riderIcon = L.divIcon({
          className: "",
          html: `<div style="
            width:16px; height:16px;
            background:#00B4A6;
            border:3px solid white;
            border-radius:50%;
            box-shadow:0 0 0 4px rgba(0,180,166,0.25);
          "></div>`,
          iconAnchor: [8, 8],
        });

        L.marker([userPos.lat, userPos.lng], { icon: riderIcon })
          .addTo(map)
          .bindPopup("Tu posicion");

        // Ajustar vista para mostrar ambos puntos
        const bounds = L.latLngBounds(
          [destLat, destLng],
          [userPos.lat, userPos.lng]
        );
        map.fitBounds(bounds, { padding: [40, 40] });
      }

      mapInstanceRef.current = map;
    }

    initMap();

    return () => {
      mounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [destLat, destLng, destLabel, userPos]);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Contenedor del mapa */}
      <div
        ref={mapContainerRef}
        className="w-full h-52 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 z-0"
        style={{ minHeight: "208px" }}
      />

      {locationError && (
        <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
          No se pudo obtener tu ubicacion para mostrarla en el mapa
        </p>
      )}

      {/* Botones para abrir en app externa */}
      <div className="grid grid-cols-2 gap-2">
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="
            flex items-center justify-center gap-2
            min-h-[48px] rounded-xl
            bg-blue-600 hover:bg-blue-700
            text-white font-bold text-sm
            active:scale-95 transition-all
          "
        >
          <Navigation className="h-4 w-4" />
          Google Maps
        </a>
        <a
          href={wazeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="
            flex items-center justify-center gap-2
            min-h-[48px] rounded-xl
            bg-[#33CCFF] hover:bg-sky-500
            text-white font-bold text-sm
            active:scale-95 transition-all
          "
        >
          <MapPin className="h-4 w-4" />
          Waze
        </a>
      </div>
    </div>
  );
}
