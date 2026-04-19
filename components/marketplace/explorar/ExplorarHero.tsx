"use client";

/**
 * ExplorarHero — Hero compacto con kicker + H1 + buscador + trust strip integrado.
 * Estilo minimalista Holded: fondo surface-canvas, sin fotos, sin colores saturados.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Compass, Truck, Store, ShieldCheck } from "@buleje/design-system/icons";

export default function ExplorarHero() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/marketplace?buscar=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <section className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-gray-400 mb-3">
            <Compass className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            Explorar &middot; Todo el catalogo
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.025em] text-gray-900 dark:text-white leading-[1.05]">
            Todo lo que tu barrio vende,{" "}
            <span className="text-gray-400 dark:text-gray-500">a un clic</span>
          </h1>
          <p className="mt-4 text-base sm:text-lg text-gray-500 dark:text-gray-400 leading-relaxed max-w-2xl">
            Recorre bodegas, descubre ofertas, encuentra lo que necesitas por categoria u ocasion. Tu tienda de confianza te lleva a casa.
          </p>

          <form
            onSubmit={handleSubmit}
            role="search"
            aria-label="Buscar en todo el catalogo"
            className="mt-6 sm:mt-8 max-w-2xl"
          >
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-gray-400 pointer-events-none" aria-hidden="true" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar tiendas, productos o categorias..."
                aria-label="Buscar tiendas, productos o categorias"
                className="w-full rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 pl-11 pr-28 py-3.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:border-gray-300 dark:focus:border-gray-700 transition-all"
              />
              <button
                type="submit"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
              >
                Buscar
              </button>
            </div>
          </form>

          {/* Trust strip — 4 chips minimalistas */}
          <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[length:var(--ts-2xs)] text-gray-500 dark:text-gray-400">
            <li className="inline-flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Delivery en 25 min
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Store className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Bodegas verificadas
            </li>
            <li className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Pago con Yape y efectivo
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Cobertura en toda Pucallpa
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
