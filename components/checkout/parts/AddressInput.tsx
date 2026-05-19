"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { MapPin, Navigation, Loader2, Home } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { AddressState, UiState } from "../types";
import { LocationConfirmModal } from "./LocationConfirmModal";

const LeafletMap = dynamic(() => import("../../LeafletMap"), { ssr: false });

/**
 * AddressInput — sección completa de captura de dirección:
 *  - input simple o detallado (calle/num/tipo)
 *  - botón "Usar mi GPS"
 *  - mapa interactivo opcional
 *  - input de referencia con sugerencias
 *
 * Es controlado: las mutaciones se hacen via callbacks expuestos.
 */

export type AddressInputProps = {
  address: AddressState;
  ui: Pick<UiState, "loadingGeo" | "geoError" | "showMap" | "refSuggestions" | "showRefSuggestions">;
  onLocationChange: (location: string) => void;
  onReferenceChange: (reference: string) => void;
  onToggleDetailed: () => void;
  onStreetTypeChange: (type: string) => void;
  onStreetNameChange: (name: string) => void;
  onStreetNumberChange: (number: string) => void;
  onMapPick: (lat: number, lon: number, addr: string) => void;
  onToggleMap: () => void;
  onRequestGeo: () => void;
  onSelectSuggestion: (s: string) => void;
};

export function AddressInput({
  address,
  ui,
  onLocationChange,
  onReferenceChange,
  onToggleDetailed,
  onStreetTypeChange,
  onStreetNameChange,
  onStreetNumberChange,
  onMapPick,
  onToggleMap,
  onRequestGeo,
  onSelectSuggestion,
}: AddressInputProps) {
  // Modal de confirmación de ubicación — se abre tras el GPS retorne coords.
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  // Detecta cuando el GPS terminó (loadingGeo pasa de true → false con coords nuevas)
  // Si hay mapLat/mapLon válidos, abre el modal automáticamente.
  useEffect(() => {
    if (!ui.loadingGeo && address.mapLat && address.mapLon && address.mapLat !== 0) {
      // Abrir solo si fue iniciado por el botón GPS (no en saved addresses)
      if (locationModalOpen === false && address.useNewAddress) {
        setLocationModalOpen(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.loadingGeo, address.mapLat, address.mapLon]);

  const handleRequestGeoFromButton = () => {
    setLocationModalOpen(true); // Abre el modal en estado loading
    onRequestGeo();
  };

  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-4 space-y-4 lg:space-y-0">
      {/* Columna izquierda: Dirección */}
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
              Dirección *
            </label>
            <button
              type="button"
              onClick={onToggleDetailed}
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
            >
              {address.detailed ? "Dirección simple" : "Dirección detallada"}
            </button>
          </div>

          {address.detailed ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={address.streetType}
                  onChange={(e) => onStreetTypeChange(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl border-2 border-gray-200 text-gray-900 dark:text-[var(--text-primary)] dark:bg-transparent focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
                >
                  <option value="Calle">Calle</option>
                  <option value="Avenida">Avenida</option>
                  <option value="Jirón">Jirón</option>
                  <option value="Pasaje">Pasaje</option>
                  <option value="Jr.">Jr.</option>
                  <option value="Av.">Av.</option>
                  <option value="Psje.">Psje.</option>
                  <option value="Mz.">Manzana</option>
                  <option value="Lote">Lote</option>
                </select>
                <input
                  required
                  value={address.streetNumber}
                  onChange={(e) => onStreetNumberChange(e.target.value)}
                  placeholder="N° / Lote"
                  className="w-full px-3 py-3 rounded-xl border-2 border-gray-200 text-gray-900 dark:text-[var(--text-primary)] dark:bg-transparent placeholder:text-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
                />
              </div>
              <input
                required
                value={address.streetName}
                onChange={(e) => onStreetNameChange(e.target.value)}
                placeholder="Nombre de la vía (ej: Ucayali, San Martín)"
                className="w-full px-3 py-3 rounded-xl border-2 border-gray-200 text-gray-900 dark:text-[var(--text-primary)] dark:bg-transparent placeholder:text-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
              />
              {address.location && (
                <div className="px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-[length:var(--ts-2xs)] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">
                    Vista previa:
                  </p>
                  <p className="text-sm font-semibold text-primary">
                    {address.location}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="relative">
              <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                required
                value={address.location}
                onChange={(e) => onLocationChange(e.target.value)}
                placeholder="Ej: Jr. Ucayali 450"
                data-testid="location-input"
                className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 text-gray-900 dark:text-[var(--text-primary)] dark:bg-transparent placeholder:text-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
              />
            </div>
          )}

          <button
            type="button"
            onClick={handleRequestGeoFromButton}
            disabled={ui.loadingGeo}
            data-testid="request-geo"
            className="group relative mt-2 w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl border-2 border-primary bg-linear-to-r from-primary to-primary-dark text-white text-sm font-bold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 active:scale-[0.97] transition-all duration-[var(--dur-base)] disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
          >
            {!ui.loadingGeo && (
              <span className="absolute inset-0 bg-white/20 animate-[pulse_2s_ease-in-out_infinite]" />
            )}
            {!ui.loadingGeo && (
              <span className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/30 to-transparent group-hover:translate-x-full transition-transform duration-[var(--dur-slower)]" />
            )}
            <span className={cn("relative z-10", !ui.loadingGeo && "animate-bounce")}>
              {ui.loadingGeo ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Navigation className="h-5 w-5" />
              )}
            </span>
            <span className="relative z-10 flex flex-col items-start">
              <span className="text-base font-extrabold">
                {ui.loadingGeo ? "Obteniendo ubicación..." : "Usar mi ubicación GPS"}
              </span>
              {!ui.loadingGeo && (
                <span className="text-[length:var(--ts-2xs)] font-medium text-white/80 uppercase tracking-wide">
                  Preciso y rápido
                </span>
              )}
            </span>
          </button>
          {ui.geoError && (
            <p className="mt-1.5 text-xs text-[var(--data-error-500)] flex items-start gap-1.5">
              <span className="shrink-0 mt-0.5">!</span>
              {ui.geoError}
            </p>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={onToggleMap}
            className="text-xs font-semibold text-primary hover:underline mb-2 flex items-center gap-1"
          >
            <MapPin className="h-3 w-3" />
            {ui.showMap ? "Ocultar mapa" : "Ver / ajustar en mapa"}
          </button>
          {ui.showMap && (
            <div className="rounded-xl overflow-hidden" style={{ height: 200 }}>
              <LeafletMap
                lat={address.mapLat}
                lon={address.mapLon}
                zoom={15}
                height={200}
                onPick={onMapPick}
              />
            </div>
          )}
        </div>
      </div>

      {/* Columna derecha: Referencia */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
            Referencia *
          </label>
          <div className="relative">
            <Home className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              required
              value={address.reference}
              onChange={(e) => onReferenceChange(e.target.value)}
              placeholder="Ej: Casa azul frente al parque"
              data-testid="reference-input"
              className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 text-gray-900 placeholder:text-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
            />
          </div>
          {ui.showRefSuggestions && ui.refSuggestions.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-[length:var(--ts-2xs)] font-semibold text-gray-400 uppercase tracking-wider">
                Sugerencias de referencia:
              </p>
              {ui.refSuggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSelectSuggestion(s)}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg bg-primary/5 text-primary font-medium hover:bg-primary/10 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de confirmación de ubicación GPS — se abre al usar GPS */}
      <LocationConfirmModal
        open={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        initialLat={address.mapLat || -8.3791}
        initialLon={address.mapLon || -74.5539}
        initialAddress={address.location}
        loading={ui.loadingGeo}
        onConfirm={onMapPick}
      />
    </div>
  );
}
