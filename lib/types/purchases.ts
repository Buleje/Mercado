import { stockMinimoDe } from "@/lib/inventario/stock-minimo";
import { esServicio } from "@/lib/compras/naturaleza";

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
  /** `Product.taxType`: gravado | exonerado | inafecto. Vacío = gravado (lleva IGV). */
  taxType?: string | null;
  /** `Product.type`: "product" | "service". Un servicio no se repone por stock (C01). */
  type?: string | null;
  /** `Product.pricingUnit` de un servicio: fijo | hora | dia | m3. «hora»/«dia» = alquiler. */
  pricingUnit?: string | null;
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

/** De dónde sale la meta de stock de Comprar: la explicación que antes era sólo «Meta: 30». */
export type OrigenMeta = "maximo" | "triple-del-minimo" | "fija";

export interface MetaDeReposicion {
  /** Hasta cuánto rellenar. */
  meta: number;
  origen: OrigenMeta;
  /** El mínimo con que se calculó (el propio o el del negocio). */
  minimo: number;
}

/**
 * La meta de Comprar: el stock máximo si lo tiene; si no, el triple del
 * mínimo; sin mínimo, 10. NO mira cuánto se vendió (eso es Sugerencias).
 */
export function metaDeReposicion(
  product: Pick<PurchaseProduct, "stockMin" | "stockMax">,
  minimoGlobal = 0,
): MetaDeReposicion {
  const minimo = stockMinimoDe(product, minimoGlobal);
  if (product.stockMax != null) return { meta: product.stockMax, origen: "maximo", minimo };
  if (minimo > 0) return { meta: minimo * 3, origen: "triple-del-minimo", minimo };
  return { meta: 10, origen: "fija", minimo };
}

/**
 * Calcula cantidad sugerida para reposición. Un servicio o alquiler no tiene
 * stock que rellenar: se sugiere 1 (lo que suma un escaneo o «+1»).
 */
export function calculateSuggestedQty(
  product: Pick<PurchaseProduct, "stock" | "stockMin" | "stockMax" | "type">,
  /** `Settings.globalMinStock` (minimoGlobalDe). Sin él, como antes: 0. */
  minimoGlobal = 0,
): number {
  if (esServicio(product)) return 1;
  const { meta } = metaDeReposicion(product, minimoGlobal);
  return Math.max(1, meta - (product.stock ?? 0));
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
export function needsReorder(
  product: Pick<PurchaseProduct, "stock" | "stockMin" | "type">,
  /** `Settings.globalMinStock` (minimoGlobalDe) para los que no tienen mínimo
   *  propio — así Compras coincide con el cierre y las alertas. Sin él: 0. */
  minimoGlobal = 0,
): boolean {
  // Un servicio no se repone por saldo físico (C25): en Blas el aserrado, con
  // stock 0 y mínimo 10, salía «a reponer».
  if (esServicio(product)) return false;
  const min = stockMinimoDe(product, minimoGlobal);
  return min > 0 && product.stock != null && product.stock <= min;
}
