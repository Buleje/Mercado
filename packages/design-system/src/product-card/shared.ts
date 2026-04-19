/**
 * product-card/shared — helpers puros reutilizados por las 3 cards.
 */
import type { ProductCardProduct } from "./types";

/** Computa href default: override > storeSlug > fallback a /marketplace. */
export function resolveHref(p: ProductCardProduct): string {
  if (p.href) return p.href;
  if (p.storeSlug) return `/marketplace/${p.storeSlug}`;
  return "/marketplace";
}

/** Computa % descuento redondeado. Respeta `discountPct` si viene explicito. */
export function resolveDiscount(p: ProductCardProduct): number | null {
  if (typeof p.discountPct === "number" && p.discountPct > 0) {
    return Math.round(p.discountPct);
  }
  if (p.originalPrice != null && p.originalPrice > p.price) {
    const pct = ((p.originalPrice - p.price) / p.originalPrice) * 100;
    return Math.round(pct);
  }
  return null;
}

/** Formatter de moneda PEN. Memoizable por consumidor si hace falta. */
const PEN = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
export function formatPEN(n: number): string {
  return PEN.format(n);
}

/** True si el producto esta agotado (stock 0 o badge explicito). */
export function isOutOfStock(p: ProductCardProduct): boolean {
  return p.stock === 0 || p.badge === "agotado";
}
