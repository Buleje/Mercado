import type { PurchaseCartItem } from "@/lib/types/purchases";

export interface ActivePromo {
  id: string;
  nombre: string;
  tipo: string;
  valor: number;
  categorias: string[];
  fechaInicio: string;
  fechaFin: string;
  activa: boolean;
  /** Condición de aplicación: "min_monto:50" / "min_cantidad:3" o JSON {minPurchase}. */
  condicion?: string | null;
}

// ─── Helpers para promos 2×1 y 3×2 ──────────────────────────────────────────

export function computeEffectiveQty(qty: number, tipo: string): number {
  if (tipo === "2x1") return Math.ceil(qty / 2);           // paga 1 por cada 2
  if (tipo === "3x2") return Math.floor(qty / 3) * 2 + Math.min(qty % 3, 2); // paga 2 por cada 3
  return qty;
}

export function freeUnits(qty: number, tipo: string): number {
  return qty - computeEffectiveQty(qty, tipo);
}

export function itemMatchesPromo(item: PurchaseCartItem, promo: ActivePromo): boolean {
  if (!promo.categorias.length) return true;
  return promo.categorias.includes(item.product.category ?? "");
}

/** La promo es de las que regalan unidades (2×1, 3×2). */
export function esPromoDeUnidades(promo: ActivePromo | null): promo is ActivePromo {
  return promo != null && (promo.tipo === "2x1" || promo.tipo === "3x2");
}

// Enforcement de `condicion` (audit Promociones): antes el POS NUNCA evaluaba el
// mínimo → "min_monto:50" se aplicaba con S/10. Soporta los 2 formatos que
// escriben las rutas: texto "min_monto:50" / "min_cantidad:3" y JSON {minPurchase}.
export function parsePromoCondicion(condicion?: string | null): { minMonto: number; minCantidad: number } {
  if (!condicion) return { minMonto: 0, minCantidad: 0 };
  const s = condicion.trim();
  if (s.startsWith("{")) {
    try {
      const o = JSON.parse(s) as Record<string, unknown>;
      return {
        minMonto: Number(o.minPurchase ?? o.minMonto ?? 0) || 0,
        minCantidad: Number(o.minQty ?? o.minCantidad ?? 0) || 0,
      };
    } catch { /* cae al parser de texto */ }
  }
  const montoM = s.match(/min[_-]?monto\s*[:=]\s*(\d+(?:\.\d+)?)/i);
  const cantM = s.match(/min[_-]?cantidad\s*[:=]\s*(\d+)/i);
  return {
    minMonto: montoM ? parseFloat(montoM[1]) : 0,
    minCantidad: cantM ? parseInt(cantM[1], 10) : 0,
  };
}

/** La promo solo surte efecto si el carrito cumple el mínimo de monto y/o cantidad. */
export function promoMeetsCondition(promo: ActivePromo, baseSubtotal: number, totalQty: number): boolean {
  const { minMonto, minCantidad } = parsePromoCondicion(promo.condicion);
  if (minMonto > 0 && baseSubtotal < minMonto) return false;
  if (minCantidad > 0 && totalQty < minCantidad) return false;
  return true;
}
