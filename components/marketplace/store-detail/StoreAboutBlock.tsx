/**
 * StoreAboutBlock — historia editorial de la bodega.
 *
 * Kicker "SOBRE LA TIENDA" + H2 + párrafo + mini-gallery de 3 ilustraciones.
 * Cero fotos stock — solo ilustraciones DS.
 */

import {
  DoniaElena,
  BodegueroCelebrando,
  CuadernoFiadoReal,
} from "@/components/ui-system/illustrations";

interface StoreAboutBlockProps {
  storeName: string;
  aboutCopy?: string | null;
  /** Año de apertura de la tienda, si se conoce */
  foundedYear?: number | null;
  zone?: string | null;
}

export default function StoreAboutBlock({
  storeName,
  aboutCopy,
  foundedYear,
  zone,
}: StoreAboutBlockProps) {
  const since = foundedYear ? `desde ${foundedYear}` : "";
  const defaultCopy = `Atendemos a las familias de ${zone ?? "Ciudad Constitución"} con los mejores precios y productos frescos diarios${since ? " " + since : ""}. Pagás con Yape o al recibir. Tus compras llegan en 25 minutos a tu puerta.`;

  return (
    <div className="space-y-6">
      {/* Kicker */}
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-gray-400 dark:text-gray-500">
        Sobre la tienda
      </p>

      {/* H2 */}
      <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-tight">
        Una bodega del barrio{foundedYear ? ` desde ${foundedYear}` : ""}
      </h2>

      {/* Copy */}
      <p className="text-base text-gray-600 dark:text-gray-400 leading-relaxed max-w-prose">
        {aboutCopy ?? defaultCopy}
      </p>

      {/* Mini-gallery — 3 ilustraciones en fila */}
      <div
        className="flex gap-4 pt-2"
        role="img"
        aria-label={`Ilustraciones de ${storeName}`}
      >
        <div className="flex-1 flex items-center justify-center rounded-xl border border-gray-100 dark:border-gray-800 bg-[var(--surface-alt)] dark:bg-gray-900 py-5 text-gray-500 dark:text-gray-400">
          <DoniaElena size={80} strokeWidth={1.5} />
        </div>
        <div className="flex-1 flex items-center justify-center rounded-xl border border-gray-100 dark:border-gray-800 bg-[var(--surface-alt)] dark:bg-gray-900 py-5 text-gray-500 dark:text-gray-400">
          <BodegueroCelebrando size={80} strokeWidth={1.5} />
        </div>
        <div className="flex-1 flex items-center justify-center rounded-xl border border-gray-100 dark:border-gray-800 bg-[var(--surface-alt)] dark:bg-gray-900 py-5 text-gray-500 dark:text-gray-400">
          <CuadernoFiadoReal size={80} strokeWidth={1.5} />
        </div>
      </div>
    </div>
  );
}
