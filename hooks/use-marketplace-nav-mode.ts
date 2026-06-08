"use client";

/**
 * useMarketplaceNavMode — modo del nav del marketplace.
 *
 * Brandon 2026-06-08: LAYOUT ÚNICO search-first. El modo "tiendas-only" cambiaba
 * el LAYOUT entero del nav según un flag per-browser (pastilla+links inline vs
 * buscador protagonista) → causaba flash e inconsistencia entre páginas/usuarios.
 * Se retiró: el nav es SIEMPRE el completo/search-first. Se mantiene la firma
 * para los consumidores (HeroCtas, ConditionalPromoBar/SecondaryNav, navbar,
 * footer, bottom-nav…); ahora devuelve "full" constante en SSR y cliente, así
 * que el primer paint ya es el correcto (sin FOUC) y no hay mismatch de hidratación.
 */

import type { MarketplaceNavMode } from "@/lib/nav-visibility";

export function useMarketplaceNavMode(): MarketplaceNavMode | null {
  return "full";
}
