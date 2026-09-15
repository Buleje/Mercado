export interface PurchaseProduct {
  id: number;
  name: string;
  category: string;
  costPrice?: number | null;
  price: number;
  image: string;
  stock?: number | null;
  stockMin?: number | null;
  stockMax?: number | null;
  unit: string;
  barcode?: string | null;
  active?: boolean;
}

export interface PurchaseSupplier {
  id: string;
  name: string;
  phone?: string | null;
  ruc?: string | null;
}

export interface PurchaseCartItem {
  product: PurchaseProduct;
  quantity: number;
}

export type PaymentMethod = "contado" | "credito_7" | "credito_15" | "credito_30" | "transferencia";

export type PurchaseSortBy = "stock" | "price" | "name";

export type PurchaseViewMode = "grid" | "list";

/** Calcula cantidad sugerida para reposición */
export function calculateSuggestedQty(product: Pick<PurchaseProduct, "stock" | "stockMin" | "stockMax">): number {
  const targetStock = product.stockMax ?? (((product.stockMin ?? 0) * 3) || 10);
  return Math.max(1, targetStock - (product.stock ?? 0));
}

/**
 * Verifica si un producto necesita reposición.
 *
 * FIX 2026-07-08 (reporte QA Compras): antes `(stock ?? 0) <= (stockMin ?? 0)`
 * marcaba como "a reponer" TODO producto sin control de stock (stock/min null →
 * `0 <= 0` = true) — ej. servicios/gastos como "Aserrado de madera" que ni
 * rastrean inventario. Eso contradecía la pestaña Sugerencias, que solo
 * considera productos con `stockMin > 0`. Ahora exige un mínimo REAL configurado
 * y un stock rastreado en/por debajo de él → ambas superficies coinciden.
 */
export function needsReorder(product: Pick<PurchaseProduct, "stock" | "stockMin">): boolean {
  const min = product.stockMin ?? 0;
  return min > 0 && product.stock != null && product.stock <= min;
}
