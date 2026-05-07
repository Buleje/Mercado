"use client";

import { Store, ShieldCheck } from "@buleje/design-system/icons";

const LOGOS = [
  "Bodega El Amigo",
  "Minimarket Santa Rosa",
  "Bodega Don Pedro",
  "Mini Market Los Andes",
  "Bodega La Esperanza",
  "Licorería Pucallpa",
  "Farmacia San Rafael",
  "Panadería La Unión",
  "Minimarket Ucayali",
  "Bodega Central",
];

/**
 * BusinessMarquee
 * Social proof con logos en movimiento continuo (pausa al hover).
 * Usa la utility `.marquee` + `.marquee-track` de globals.css.
 */
export default function BusinessMarquee() {
  const items = [...LOGOS, ...LOGOS]; // duplicamos para loop continuo
  return (
    <div className="py-8 bg-gray-50 dark:bg-gray-900/30 border-y border-gray-100 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs font-bold uppercase tracking-wide text-gray-400 mb-5 inline-flex items-center justify-center gap-1.5 w-full">
          <ShieldCheck className="h-3.5 w-3.5 text-[var(--data-success-500)]" />
          Más de 500 bodegas confían en Buleje
        </p>

        <div className="marquee">
          <div className="marquee-track">
            {items.map((name, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-sm font-bold text-gray-600 dark:text-gray-300 whitespace-nowrap"
              >
                <Store className="h-4 w-4 text-primary" aria-hidden="true" />
                {name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
