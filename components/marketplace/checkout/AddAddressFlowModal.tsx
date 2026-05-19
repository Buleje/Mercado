"use client";

/**
 * AddAddressFlowModal — modal de 2 pasos para registrar una nueva dirección
 * usando el GPS + mapa.
 *
 * Brandon, mayo 14 2026: el cliente con direcciones guardadas no debe llenar
 * calle/dep/prov/distrito a mano. Tocar "Poner direccion diferente" en el
 * picker abre este modal:
 *
 *   Step 1 (idle):     Botón grande "Poner ubicación actual"
 *   Step 2 (loading):  Spinner mientras navigator.geolocation responde
 *   Step 3 (map):      Mapa con pin draggable + confirmar
 *
 * Al confirmar, llama onConfirm(lat, lon, address) — el padre persiste la
 * dirección via reverse-geocode y la suma a savedAddresses. La próxima vez
 * que entre a /checkout/entrega aparecerá como segunda opción a marcar.
 */

import { useState, useCallback } from "react";
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

const LeafletMap = dynamic(() => import("../../LeafletMap"), { ssr: false });

type Step = "idle" | "loading" | "map" | "error";

export interface AddAddressFlowModalProps {
  open: boolean;
  onClose: () => void;
  /** Callback con coords finales + dirección textual cuando el cliente confirma. */
  onConfirm: (lat: number, lon: number, address: string) => Promise<void> | void;
}

export default function AddAddressFlowModal({
  open,
  onClose,
  onConfirm,
}: AddAddressFlowModalProps) {
  const [step, setStep] = useState<Step>("idle");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [address, setAddress] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setStep("idle");
    setCoords(null);
    setAddress("");
    setErrorMsg("");
    setSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleGetGps = useCallback(async () => {
    if (!("geolocation" in navigator)) {
      setStep("error");
      setErrorMsg("Tu navegador no soporta ubicación GPS.");
      return;
    }

    setStep("loading");
    setErrorMsg("");

    // Permission API check para dar mensajes precisos cuando esta bloqueado.
    if ("permissions" in navigator) {
      try {
        const res = await navigator.permissions.query({ name: "geolocation" as PermissionName });
        if (res.state === "denied") {
          setStep("error");
          setErrorMsg(
            "El permiso de ubicación está bloqueado. Tocá el candado 🔒 en la barra del navegador → Permisos → permití ubicación → recargá.",
          );
          return;
        }
      } catch {
        /* sin permissions API → seguimos al getCurrentPosition */
      }
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lon: longitude });
        // Reverse-geocode previo para pre-llenar el address del pin.
        try {
          const r = await fetch(
            `/api/marketplace/reverse-geocode?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`,
          );
          if (r.ok) {
            const data = await r.json();
            setAddress((data.displayName as string | undefined) ?? "");
          }
        } catch {
          /* fire-and-forget */
        }
        setStep("map");
      },
      (err) => {
        setStep("error");
        if (err.code === 1) {
          setErrorMsg("Bloqueaste la ubicación. Tocá el candado 🔒 → permisos → ubicación.");
        } else if (err.code === 2) {
          setErrorMsg("Ubicación no disponible. Revisá tu GPS o conexión.");
        } else if (err.code === 3) {
          setErrorMsg("Tiempo agotado. Intentá de nuevo.");
        } else {
          setErrorMsg("No pudimos identificar tu ubicación.");
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }, []);

  const handlePick = useCallback((newLat: number, newLon: number, addr: string) => {
    setCoords({ lat: newLat, lon: newLon });
    if (addr) setAddress(addr);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!coords) return;
    setSubmitting(true);
    try {
      await onConfirm(
        coords.lat,
        coords.lon,
        address || `GPS: ${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`,
      );
      reset();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [coords, address, onConfirm, reset, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="add-address-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-6 backdrop-blur-md bg-slate-950/65"
          style={{ zIndex: 2147483647 }}
          onClick={handleClose}
        >
          <motion.div
            key="add-address-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Agregar dirección nueva"
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
                    Agregar otra dirección
                  </h3>
                  <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] leading-snug mt-0.5">
                    {step === "idle" && "Usamos tu GPS para ubicarte sin escribir nada."}
                    {step === "loading" && "Buscando tu posición exacta…"}
                    {step === "map" && "Mové el pin si el lugar exacto está un poco al lado."}
                    {step === "error" && "Tuvimos un problema."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Cerrar"
                className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-sunken)] hover:bg-[var(--rule-base)] text-[var(--text-primary)] transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {step === "idle" && (
                <div className="px-5 sm:px-8 py-8 sm:py-12 flex flex-col items-center text-center gap-6">
                  <span className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] shadow-[0_8px_28px_-8px_var(--accent)]">
                    <Navigation className="h-9 w-9" strokeWidth={2} />
                  </span>
                  <div>
                    <p className="text-xl sm:text-2xl font-black tracking-tight text-[var(--text-primary)]">
                      Poner mi ubicación actual
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-md leading-relaxed">
                      Tocá el botón y aceptá el permiso del navegador. Te mostramos un mapa para
                      ajustar el pin a tu puerta exacta.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleGetGps}
                    className="group inline-flex items-center justify-center gap-2.5 rounded-full h-14 px-7 text-base font-extrabold text-white bg-[var(--accent-600,var(--accent))] hover:bg-[var(--accent)]/90 hover:gap-3 active:scale-[0.98] transition-all shadow-[0_10px_28px_-10px_var(--accent)]"
                  >
                    <Navigation className="h-5 w-5" strokeWidth={2.25} />
                    Poner ubicación actual
                  </button>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] uppercase tracking-wider font-bold">
                    Privacidad · solo usamos tu GPS para esta entrega
                  </p>
                </div>
              )}

              {step === "loading" && (
                <div className="flex flex-col items-center justify-center min-h-[260px] px-6 gap-4">
                  <div className="h-16 w-16 rounded-full bg-[var(--accent-soft)] flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
                  </div>
                  <div className="text-center">
                    <p className="text-base font-extrabold text-[var(--text-primary)]">
                      Obteniendo tu ubicación
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-tertiary)] max-w-sm">
                      Aceptá el permiso del navegador si te lo pide.
                    </p>
                  </div>
                </div>
              )}

              {step === "error" && (
                <div className="px-5 sm:px-8 py-8 flex flex-col items-center text-center gap-4">
                  <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--data-error-50,#fef2f2)] text-[var(--data-error-500,#ef4444)]">
                    <AlertCircle className="h-7 w-7" strokeWidth={2} />
                  </span>
                  <div className="max-w-md">
                    <p className="text-lg font-extrabold text-[var(--text-primary)]">
                      No pudimos ubicarte
                    </p>
                    <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                      {errorMsg}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleGetGps}
                    className="inline-flex items-center justify-center gap-2 rounded-full h-12 px-5 text-sm font-extrabold text-white bg-[var(--accent-600,var(--accent))] hover:bg-[var(--accent)]/90 transition-colors"
                  >
                    <Navigation className="h-4 w-4" strokeWidth={2.25} />
                    Reintentar
                  </button>
                </div>
              )}

              {step === "map" && coords && (
                <>
                  <div className="relative h-[360px] sm:h-[440px]">
                    <LeafletMap
                      lat={coords.lat}
                      lon={coords.lon}
                      zoom={17}
                      height={440}
                      onPick={handlePick}
                    />
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-raised)] shadow-lg px-3.5 py-1.5 text-xs font-bold text-[var(--text-primary)] border border-[var(--rule-soft)]">
                      <MapPin className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={2.5} />
                      Mové el pin para ajustar
                    </div>
                  </div>

                  <div className="px-5 sm:px-6 py-4 space-y-3 border-t border-[var(--rule-soft)]">
                    <div>
                      <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[0.18em] text-[var(--accent)] mb-1.5">
                        Dirección detectada
                      </p>
                      <p className="text-sm font-bold text-[var(--text-primary)] leading-snug break-words">
                        {address || `GPS: ${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            {step === "map" && (
              <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-raised)] px-5 sm:px-6 py-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={submitting}
                  className="flex-1 h-12 rounded-2xl border-2 border-[var(--rule-base)] text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:bg-[var(--surface-sunken)] transition-all disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={submitting || !coords}
                  className="flex-1 h-12 rounded-2xl text-white font-extrabold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed bg-linear-to-br from-[var(--accent-600,var(--accent))] to-[var(--accent)] hover:brightness-110 shadow-[0_8px_20px_-8px_var(--accent)]"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  )}
                  Guardar dirección
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
