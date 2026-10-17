"use client";

import { useState } from "react";
import { X, Check, AlertTriangle, Sparkles } from "@buleje/design-system/icons";

const BEFORE_ITEMS = [
  { text: "Apuntas ventas en un cuaderno", icon: <X className="h-3.5 w-3.5" /> },
  { text: "No sabes que producto se vence", icon: <X className="h-3.5 w-3.5" /> },
  { text: "Calculas fiados de memoria", icon: <X className="h-3.5 w-3.5" /> },
  { text: "No sabes cuanto vendiste hoy", icon: <X className="h-3.5 w-3.5" /> },
  { text: "Pierdes productos por merma", icon: <X className="h-3.5 w-3.5" /> },
  { text: "Tus clientes no pueden pedir online", icon: <X className="h-3.5 w-3.5" /> },
];

const AFTER_ITEMS = [
  { text: "Cada venta se registra al instante", icon: <Check className="h-3.5 w-3.5" /> },
  { text: "Alertas automaticas de vencimiento", icon: <Check className="h-3.5 w-3.5" /> },
  { text: "Fiados con historial y recordatorio", icon: <Check className="h-3.5 w-3.5" /> },
  { text: "Dashboard con ventas en tiempo real", icon: <Check className="h-3.5 w-3.5" /> },
  { text: "FEFO reduce merma un 40%", icon: <Check className="h-3.5 w-3.5" /> },
  { text: "Tienda online con delivery y Yape", icon: <Check className="h-3.5 w-3.5" /> },
];

export default function SaasBeforeAfter() {
  const [sliderPos, setSliderPos] = useState(50);

  return (
    <section className="py-20 sm:py-28 bg-gray-50 dark:bg-gray-900/50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/30 text-[var(--data-warning-600)] dark:text-amber-400 text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-4">
            <AlertTriangle className="h-3 w-3" /> Antes vs Despues
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white">
            Deja el cuaderno. Digitaliza tu bodega.
          </h2>
        </div>

        {/* Slider comparador */}
        <div className="relative rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-xl">
          <div className="grid grid-cols-2 min-h-[400px]">
            {/* ANTES */}
            <div
              className="bg-linear-to-br from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/20 p-6 sm:p-10 flex flex-col justify-center"
              style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)`, position: "absolute", inset: 0, zIndex: 1 }}
            >
              <div className="max-w-xs">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--data-error-500)] mb-4">Sin sistema</p>
                <div className="space-y-3">
                  {BEFORE_ITEMS.map((item) => (
                    <div key={item.text} className="flex items-center gap-2.5">
                      <div className="h-6 w-6 rounded-full bg-red-100 dark:bg-red-900/40 text-[var(--data-error-500)] flex items-center justify-center shrink-0">
                        {item.icon}
                      </div>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* DESPUES */}
            <div className="bg-linear-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 p-6 sm:p-10 flex flex-col justify-center col-start-1 col-end-3">
              <div className="max-w-xs ml-auto">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-4 w-4 text-[var(--data-success-500)]" />
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--data-success-600)]">Con Buleje ERP</p>
                </div>
                <div className="space-y-3">
                  {AFTER_ITEMS.map((item) => (
                    <div key={item.text} className="flex items-center gap-2.5">
                      <div className="h-6 w-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-[var(--data-success-600)] flex items-center justify-center shrink-0">
                        {item.icon}
                      </div>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Slider handle */}
          <div
            className="absolute top-0 bottom-0 z-10 w-1 bg-white shadow-lg cursor-ew-resize"
            style={{ left: `${sliderPos}%` }}
          >
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-10 w-10 rounded-full bg-white shadow-xl border-2 border-[var(--accent)] flex items-center justify-center">
              <svg className="h-4 w-4 text-[var(--accent-dark)] dark:text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
              </svg>
            </div>
          </div>

          {/* Input range invisible */}
          <input
            type="range"
            min={10}
            max={90}
            value={sliderPos}
            onChange={(e) => setSliderPos(Number(e.target.value))}
            className="absolute inset-0 z-20 w-full h-full opacity-0 cursor-ew-resize"
            aria-label="Comparar antes y despues"
          />
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Arrastra el slider para comparar
        </p>
      </div>
    </section>
  );
}
