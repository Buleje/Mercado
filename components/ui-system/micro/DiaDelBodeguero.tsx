"use client";

import { useEffect, useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import { X, Sparkles } from "lucide-react";
import { DoniaElena } from "../illustrations/pucallpa-locals";

/**
 * DiaDelBodeguero — banner especial el 20 de agosto (Día del Bodeguero Peruano).
 *
 * Aparece automáticamente en esa fecha una sola vez por usuario.
 * Celebración auténtica con Doña Elena + mensaje personalizado.
 *
 * Research: illustration.app Feb 2026 — "día especial ambient" transmite
 * relevancia cultural que no se puede fingir.
 */

const BODEGUERO_DAY_MONTH = 7; // 0-indexed: Agosto = 7
const BODEGUERO_DAY_DATE = 20;
const STORAGE_KEY = "buleje-bodeguero-day-2026";

export function DiaDelBodeguero() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const today = new Date();
    const isDay = today.getMonth() === BODEGUERO_DAY_MONTH && today.getDate() === BODEGUERO_DAY_DATE;
    const alreadySeen = localStorage.getItem(STORAGE_KEY) === "true";

    if (isDay && !alreadySeen) {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, "true");
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <m.div
          className="fixed bottom-6 right-6 z-50 max-w-sm"
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className="rounded-2xl shadow-[var(--shadow-xl)] p-5 border-2 overflow-hidden relative"
            style={{
              background: "linear-gradient(135deg, var(--cushma-cream, #F0E4CC) 0%, #FAFAF7 100%)",
              borderColor: "var(--shipibo-red, #A84333)",
            }}
          >
            <button
              type="button"
              onClick={dismiss}
              className="absolute top-3 right-3 p-1 rounded-full hover:bg-black/5 transition-colors"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={1.75} />
            </button>

            <div className="flex items-start gap-3">
              <div
                className="shrink-0"
                style={{ color: "var(--shipibo-red, #A84333)" }}
              >
                <DoniaElena size={80} strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0 pr-4">
                <p
                  className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] mb-1"
                  style={{ color: "var(--amazon-earth, #8B5A3C)" }}
                >
                  <Sparkles className="inline h-2.5 w-2.5 -mt-0.5 mr-1" strokeWidth={2} aria-hidden />
                  20 de Agosto
                </p>
                <h3 className="text-base font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
                  Feliz Día del Bodeguero Peruano
                </h3>
                <p className="mt-2 text-xs text-[var(--text-secondary)] leading-relaxed">
                  Hoy celebramos a los casi 500 mil bodegueros que son el corazón de cada barrio del Perú. Gracias por confiar en Buleje.
                </p>
                <div className="mt-3">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)]"
                    style={{
                      background: "var(--shipibo-red, #A84333)",
                      color: "#fff",
                    }}
                  >
                    Bodegueros Unidos
                  </span>
                </div>
              </div>
            </div>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
