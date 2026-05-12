"use client";

/**
 * LocationConfirmModal — modal con mapa interactivo para que el cliente
 * ajuste su ubicación GPS exacta.
 *
 * Flujo:
 *   1. Cliente toca "Usar mi ubicación GPS" → loading via navigator.geolocation
 *   2. Al obtener coords, se abre este modal con el pin sobre la posición real
 *   3. Cliente puede mover el pin (mapa draggable) para ajustar precisión
 *   4. Al confirmar, se guardan { lat, lon, address } en el address state
 *
 * UI ONLY — el padre maneja el estado de address con dispatch. No toca
 * lógica de orden, totales, reservas ni providers.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, m as motion } from "framer-motion";
import { X, MapPin, Check, Navigation, Loader2 } from "@buleje/design-system/icons";

const LeafletMap = dynamic(() => import("../../LeafletMap"), { ssr: false });

export interface LocationConfirmModalProps {
  open: boolean;
  onClose: () => void;
  /** Coordenadas iniciales (las que el GPS retornó) */
  initialLat: number;
  initialLon: number;
  /** Dirección inicial (si la hay desde reverse-geocoding) */
  initialAddress?: string;
  /** Loading mientras se obtiene la geolocalización */
  loading?: boolean;
  /** Cuando el cliente confirma — recibe coords finales + dirección */
  onConfirm: (lat: number, lon: number, address: string) => void;
}

export function LocationConfirmModal({
  open,
  onClose,
  initialLat,
  initialLon,
  initialAddress,
  loading = false,
  onConfirm,
}: LocationConfirmModalProps) {
  const [lat, setLat] = useState(initialLat);
  const [lon, setLon] = useState(initialLon);
  const [address, setAddress] = useState(initialAddress ?? "");

  // Reset cuando cambian las coords iniciales (nueva geolocalización)
  useEffect(() => {
    setLat(initialLat);
    setLon(initialLon);
    setAddress(initialAddress ?? "");
  }, [initialLat, initialLon, initialAddress, open]);

  const handlePick = (newLat: number, newLon: number, addr: string) => {
    setLat(newLat);
    setLon(newLon);
    setAddress(addr);
  };

  const handleConfirm = () => {
    onConfirm(lat, lon, address || `GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="location-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-6 backdrop-blur-md bg-slate-950/65"
          style={{ zIndex: 2147483647 }}
          onClick={onClose}
        >
          <motion.div
            key="location-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar ubicación"
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full sm:max-w-2xl max-h-[92svh] flex flex-col rounded-t-3xl sm:rounded-[28px] bg-[var(--surface-raised)] overflow-hidden"
            style={{ boxShadow: "0 30px 70px -15px rgba(0,0,0,0.45)" }}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-[var(--rule-soft)] bg-gradient-to-b from-[color-mix(in_oklch,var(--color-primary,#00B4A6)_4%,transparent)] to-transparent">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className="h-11 w-11 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-md"
                  style={{
                    background: "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                  }}
                >
                  <Navigation className="h-5 w-5" strokeWidth={2.25} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-extrabold text-[var(--text-primary)] tracking-tight leading-tight">
                    Confirma tu ubicación
                  </h3>
                  <p className="text-xs text-muted leading-snug mt-0.5">
                    Arrastra el pin para ajustar la precisión exacta de tu casa.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-sunken)] hover:bg-[var(--rule-base)] text-[var(--text-primary)] transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            {/* Body con mapa */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-80 gap-4 px-6">
                  <div
                    className="h-16 w-16 rounded-full flex items-center justify-center"
                    style={{ background: "color-mix(in oklch, var(--color-primary, #00B4A6) 12%, transparent)" }}
                  >
                    <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary,#00B4A6)]" />
                  </div>
                  <div className="text-center">
                    <p className="text-base font-extrabold text-[var(--text-primary)] tracking-tight">
                      Obteniendo tu ubicación
                    </p>
                    <p className="text-sm text-muted mt-1 leading-relaxed max-w-sm">
                      Estamos consultando tu GPS. Si el navegador lo pide, aceptá el permiso.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Mapa */}
                  <div className="relative h-[420px] sm:h-[460px]">
                    <LeafletMap
                      lat={lat}
                      lon={lon}
                      zoom={17}
                      height={460}
                      onPick={handlePick}
                    />
                    {/* Hint flotante */}
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-raised)] shadow-lg px-3.5 py-1.5 text-xs font-bold text-[var(--text-primary)] border border-[var(--rule-soft)]">
                      <MapPin className="h-3.5 w-3.5 text-[var(--color-primary,#00B4A6)]" strokeWidth={2.5} />
                      Mové el pin para ajustar
                    </div>
                  </div>

                  {/* Info de coordenadas */}
                  <div className="px-6 py-4 space-y-3 border-t border-[var(--rule-soft)]">
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--color-primary,#00B4A6)] mb-1.5">
                        Dirección detectada
                      </p>
                      <p className="text-sm font-bold text-[var(--text-primary)] leading-snug">
                        {address || `GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)}`}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Latitud</p>
                        <p className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">{lat.toFixed(6)}</p>
                      </div>
                      <div className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Longitud</p>
                        <p className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">{lon.toFixed(6)}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer con CTAs */}
            <div className="border-t border-[var(--rule-soft)] bg-white/95 dark:bg-[var(--surface-raised)]/95 backdrop-blur-md px-6 py-4 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 h-12 rounded-2xl border-2 border-[var(--rule-base)] text-sm font-bold text-[var(--text-primary)] hover:border-[var(--color-primary,#00B4A6)]/40 hover:bg-[var(--surface-sunken)] transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 h-12 rounded-2xl text-white font-extrabold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                  boxShadow: "0 8px 20px color-mix(in oklch, var(--color-primary, #00B4A6) 30%, transparent)",
                }}
              >
                <Check className="h-4 w-4" strokeWidth={2.5} />
                Confirmar ubicación
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
