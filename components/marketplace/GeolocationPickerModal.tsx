"use client";

/**
 * GeolocationPickerModal — modal de ubicación para el registro de tiendas.
 *
 * Flujo (auto-inicia al abrir, sin paso "idle"):
 *   loading → pide GPS y muestra spinner "ubicando tu negocio…"
 *   map     → mapa con pin draggable en tu posición; movés para ajustar
 *   error   → permiso/GPS falló; reintentar o ubicar manualmente en el mapa
 *
 * Al confirmar llama onConfirm(lat, lon); el formulario hace el reverse-geocode
 * → ubigeo y rellena departamento/provincia/distrito/dirección.
 *
 * Reusa components/LeafletMap (pin draggable + reverse-geocode Nominatim).
 */

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, m as motion } from "framer-motion";
import {
  X,
  MapPin,
  Check,
  Navigation,
  Loader2,
  AlertCircle,
} from "@buleje/design-system/icons";

const LeafletMap = dynamic(() => import("../LeafletMap"), { ssr: false });

type Step = "loading" | "map" | "error";

// Centro por defecto si el GPS falla: Ciudad Constitución (Pasco, Selva Central).
const DEFAULT_CENTER = { lat: -9.8549, lon: -75.0213 };

export interface GeolocationPickerModalProps {
  open: boolean;
  onClose: () => void;
  /** Coords finales cuando el dueño confirma. El padre hace ubigeo + autollenado. */
  onConfirm: (lat: number, lon: number) => Promise<void> | void;
  /** Título del modal. Default "Ubicar mi negocio" (marketplace); otros contextos
      (ej. EUDR forestal) pasan uno propio como "Ubicar la parcela". */
  title?: string;
}

export default function GeolocationPickerModal({
  open,
  onClose,
  onConfirm,
  title = "Ubicar mi negocio",
}: GeolocationPickerModalProps) {
  const [step, setStep] = useState<Step>("loading");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [address, setAddress] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const locate = useCallback(() => {
    setStep("loading");
    setErrorMsg("");
    if (!("geolocation" in navigator)) {
      setStep("error");
      setErrorMsg("Tu navegador no soporta ubicación GPS.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lon: longitude });
        setStep("map");
        try {
          const r = await fetch(
            `/api/marketplace/reverse-geocode?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`,
          );
          if (r.ok) {
            const data = await r.json();
            setAddress((data.direccion as string | undefined) ?? (data.displayName as string | undefined) ?? "");
          }
        } catch {
          /* fire-and-forget — la dirección final la calcula el form al confirmar */
        }
      },
      (err) => {
        if (err.code === 1) {
          setErrorMsg("Bloqueaste la ubicación. Tocá el candado de la barra del navegador → permisos → ubicación. O ubicá tu negocio manualmente en el mapa.");
        } else if (err.code === 2) {
          setErrorMsg("Ubicación no disponible. Revisá tu GPS. Podés ubicar tu negocio manualmente en el mapa.");
        } else if (err.code === 3) {
          setErrorMsg("Tardó demasiado. Reintentá o ubicá tu negocio manualmente en el mapa.");
        } else {
          setErrorMsg("No pudimos identificar tu ubicación. Ubicá tu negocio manualmente en el mapa.");
        }
        setStep("error");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }, []);

  // Auto-iniciar la ubicación al abrir; resetear al cerrar.
  useEffect(() => {
    if (open) {
      setCoords(null);
      setAddress("");
      setSubmitting(false);
      locate();
    }
  }, [open, locate]);

  const handlePick = useCallback((newLat: number, newLon: number, addr: string) => {
    setCoords({ lat: newLat, lon: newLon });
    if (addr) setAddress(addr);
  }, []);

  const handleManual = useCallback(() => {
    setCoords(DEFAULT_CENTER);
    setStep("map");
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!coords) return;
    setSubmitting(true);
    try {
      await onConfirm(coords.lat, coords.lon);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [coords, onConfirm, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="geo-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-6 backdrop-blur-md bg-slate-950/65"
          style={{ zIndex: 2147483647 }}
          onClick={onClose}
        >
          <motion.div
            key="geo-panel"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full sm:max-w-2xl max-h-[92svh] flex flex-col rounded-t-3xl sm:rounded-[28px] bg-[var(--surface-raised)] overflow-hidden"
            style={{ boxShadow: "0 30px 70px -15px rgba(0,0,0,0.45)" }}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 sm:py-5 border-b border-[var(--rule-soft)] bg-linear-to-b from-[var(--accent-soft)]/40 to-transparent">
              <div className="flex items-start gap-3 min-w-0">
                <span className="h-11 w-11 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-md bg-linear-to-br from-[var(--accent-600,var(--accent))] to-[var(--accent)]">
                  <MapPin className="h-5 w-5" strokeWidth={2.25} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg font-extrabold text-[var(--text-primary)] tracking-tight leading-tight">
                    {title}
                  </h3>
                  <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] leading-snug mt-0.5">
                    {step === "loading" && "Buscando tu posición exacta…"}
                    {step === "map" && "Mové el pin hasta la puerta exacta de tu tienda."}
                    {step === "error" && "No pudimos usar tu GPS."}
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

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {step === "loading" && (
                <div className="flex flex-col items-center justify-center min-h-[300px] px-6 gap-4">
                  <div className="relative h-16 w-16">
                    <span className="absolute inset-0 rounded-full bg-[var(--accent-soft)] animate-ping" />
                    <span className="relative h-16 w-16 rounded-full bg-[var(--accent-soft)] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
                    </span>
                  </div>
                  <div className="text-center">
                    <p className="text-base font-extrabold text-[var(--text-primary)]">
                      Ubicando tu negocio
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-tertiary)] max-w-sm">
                      Aceptá el permiso de ubicación si el navegador te lo pide.
                    </p>
                  </div>
                </div>
              )}

              {step === "error" && (
                <div className="px-5 sm:px-8 py-10 flex flex-col items-center text-center gap-4">
                  <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--data-error-50)] text-[var(--data-error-500)]">
                    <AlertCircle className="h-7 w-7" strokeWidth={2} />
                  </span>
                  <div className="max-w-md">
                    <p className="text-lg font-extrabold text-[var(--text-primary)]">No pudimos ubicarte</p>
                    <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">{errorMsg}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2.5 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={locate}
                      className="inline-flex items-center justify-center gap-2 rounded-full h-12 px-5 text-sm font-extrabold text-white bg-[var(--accent)] hover:brightness-110 transition-all"
                    >
                      <Navigation className="h-4 w-4" strokeWidth={2.25} />
                      Reintentar GPS
                    </button>
                    <button
                      type="button"
                      onClick={handleManual}
                      className="inline-flex items-center justify-center gap-2 rounded-full h-12 px-5 text-sm font-bold text-[var(--text-primary)] border-2 border-[var(--rule-base)] hover:border-[var(--accent)]/40 transition-all"
                    >
                      <MapPin className="h-4 w-4" strokeWidth={2.25} />
                      Ubicar en el mapa
                    </button>
                  </div>
                </div>
              )}

              {step === "map" && coords && (
                <>
                  <div className="relative h-[340px] sm:h-[420px]">
                    <LeafletMap lat={coords.lat} lon={coords.lon} zoom={17} height={420} onPick={handlePick} />
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-raised)] shadow-lg px-3.5 py-1.5 text-xs font-bold text-[var(--text-primary)] border border-[var(--rule-soft)]">
                      <MapPin className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={2.5} />
                      Arrastrá el pin para ajustar
                    </div>
                  </div>
                  {address && (
                    <div className="px-5 sm:px-6 py-4 border-t border-[var(--rule-soft)]">
                      <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[0.18em] text-[var(--accent)] mb-1.5">
                        Dirección detectada
                      </p>
                      <p className="text-sm font-bold text-[var(--text-primary)] leading-snug break-words">
                        {address}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {step === "map" && (
              <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-raised)] px-5 sm:px-6 py-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="flex-1 h-12 rounded-2xl border-2 border-[var(--rule-base)] text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:bg-[var(--surface-sunken)] transition-all disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={submitting || !coords}
                  className="flex-[1.6] h-12 rounded-2xl text-white font-extrabold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 bg-linear-to-br from-[var(--accent-600,var(--accent))] to-[var(--accent)] hover:brightness-110 shadow-[0_8px_20px_-8px_var(--accent)]"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={2.5} />}
                  Usar esta ubicación
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
