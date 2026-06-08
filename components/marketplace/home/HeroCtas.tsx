"use client";

/**
 * HeroCtas — buscador protagonista + atajos del hero de la home (B2C).
 *
 * Brandon 2026-06-08: la home arranca SHOP-FIRST (estilo Mercado Libre/Temu).
 * El BUSCADOR es la acción #1 del hero (antes solo vivía en el navbar). Debajo,
 * dos atajos secundarios: "Ver todas las tiendas" y "Ofertas del día".
 *  - "Ofertas del día" SOLO fuera del "modo tienda" (tiendas-only). Mientras el
 *    modo no resuelve (SSR/hidratación) se trata como tiendas-only → no parpadea.
 */

import Link from "next/link";
import { Store, ArrowUpRight, Sparkles } from "@buleje/design-system/icons";
import { useMarketplaceNavMode } from "@/hooks/use-marketplace-nav-mode";
import SearchAutocompleteInput from "@/components/marketplace/buscar/SearchAutocompleteInput";

export default function HeroCtas() {
  const mode = useMarketplaceNavMode();
  const showOfertas = mode !== null && mode !== "tiendas-only";

  return (
    <>
      {/* ── Buscador protagonista con autocomplete EN VIVO (acción #1 de la
          home). Sugiere productos/tiendas/categorías mientras tipeás +
          historial de búsquedas. Reusa SearchAutocompleteInput. ── */}
      <div className="mt-7 sm:mt-9 mx-auto w-full max-w-2xl text-left">
        <SearchAutocompleteInput
          size="lg"
          showSubmitButton
          placeholder="Busca productos, tiendas o categorías…"
        />
      </div>

      {/* ── Atajos secundarios (el buscador es la acción #1) ── */}
      <div className="mt-4 sm:mt-5 flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-center gap-3 sm:flex-wrap">
        <Link
          href="/tiendas"
          aria-label="Ver todas las tiendas"
          className="group inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 h-[52px] text-base font-extrabold text-[var(--text-primary)] shadow-sm transition-all hover:border-[var(--accent)] hover:text-[var(--accent)] hover:shadow-md"
        >
          <Store className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          Ver todas las tiendas
          <ArrowUpRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            strokeWidth={2.75}
            aria-hidden
          />
        </Link>

        {showOfertas && (
          <Link
            href="/marketplace/ofertas"
            className="inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 h-[52px] text-base font-extrabold text-[var(--text-primary)] shadow-sm transition-all hover:border-[var(--accent)] hover:text-[var(--accent)] hover:shadow-md"
          >
            <Sparkles className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            Ofertas del día
          </Link>
        )}
      </div>
    </>
  );
}
