"use client";

/**
 * LothCampoBar — MODO CAMPO del mapa: el mismo mapa, pero parado en el monte.
 *
 * Sigue la posición del dispositivo (`watchPosition`), la muestra con su radio
 * de precisión real y responde la única pregunta que importa ahí: **¿estoy
 * dentro del área autorizada?** Además deja marcar una referencia exactamente
 * donde estás parado, sin tipear coordenadas.
 *
 * La coordenada se muestra en UTM porque es la que se anota en la libreta.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Locate, MapPin, Navigation } from "@buleje/design-system/icons";
import { pointInPolygon, type LatLng } from "@/lib/forestal/loth-geo";
import { formatMeters, toUtm } from "@/lib/forestal/loth-utm";

export interface PosicionCampo {
  lat: number;
  lng: number;
  accuracy: number;
}

interface Props {
  activo: boolean;
  posicion: PosicionCampo | null;
  parcela: LatLng[];
  declarada: boolean;
  onToggle: () => void;
  onPosicion: (p: PosicionCampo | null) => void;
  onMarcarAqui: (p: LatLng) => void;
  /** Centrar el mapa en la posición actual. */
  onCentrar: (p: LatLng) => void;
}

export default function LothCampoBar({
  activo,
  posicion,
  parcela,
  declarada,
  onToggle,
  onPosicion,
  onMarcarAqui,
  onCentrar,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [primeraFija, setPrimeraFija] = useState(false);

  const handlePos = useCallback(
    (pos: GeolocationPosition) => {
      onPosicion({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? 0 });
      setError(null);
      setPrimeraFija(true);
    },
    [onPosicion],
  );

  useEffect(() => {
    if (!activo) {
      onPosicion(null);
      setPrimeraFija(false);
      return;
    }
    if (!navigator.geolocation) {
      setError("Este dispositivo no tiene geolocalización.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      handlePos,
      (err) => setError(`GPS: ${err.message}`),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 2_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [activo, handlePos, onPosicion]);

  // Centrar una sola vez, en la primera fija: después el usuario manda.
  useEffect(() => {
    if (activo && primeraFija && posicion) onCentrar([posicion.lat, posicion.lng]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primeraFija]);

  const dentro = posicion && declarada ? pointInPolygon([posicion.lat, posicion.lng], parcela) : null;
  const utm = posicion ? toUtm(posicion.lat, posicion.lng) : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={activo}
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg border-2 px-3 text-xs font-bold transition ${
          activo
            ? "border-transparent bg-[#2563eb] text-white"
            : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
        }`}
      >
        <Navigation className="h-3.5 w-3.5" /> {activo ? "Siguiendo tu GPS" : "Modo campo"}
      </button>

      {activo && posicion && utm && (
        <>
          <span className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">
            {utm.zone}
            {utm.band} · E {formatMeters(utm.easting, 0)} · N {formatMeters(utm.northing, 0)}
            <span className="font-sans font-semibold text-[var(--text-tertiary)]">±{Math.round(posicion.accuracy)} m</span>
          </span>
          {dentro !== null && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                dentro
                  ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                  : "bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
              }`}
            >
              {dentro ? <MapPin className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {dentro ? "Dentro del área autorizada" : "FUERA del área autorizada"}
            </span>
          )}
          <button
            type="button"
            onClick={() => onCentrar([posicion.lat, posicion.lng])}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
          >
            <Locate className="h-3.5 w-3.5" /> Centrar
          </button>
          <button
            type="button"
            onClick={() => onMarcarAqui([posicion.lat, posicion.lng])}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2563eb] px-3 text-xs font-bold text-white hover:opacity-90"
          >
            <MapPin className="h-3.5 w-3.5" /> Marcar acá
          </button>
        </>
      )}

      {activo && !posicion && !error && (
        <span className="text-xs font-semibold text-[var(--text-tertiary)]">Buscando satélites…</span>
      )}
      {error && (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <AlertTriangle className="h-3.5 w-3.5" /> {error}
        </span>
      )}
    </div>
  );
}
