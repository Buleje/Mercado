import type { PurchaseCartItem, PurchaseProduct } from "@/lib/types/purchases";
import { afectacionDe, TASA_IGV } from "@/lib/sunat/lineas-comprobante";

/**
 * El costo de una compra es lo que le pagas al proveedor. Antes la canasta
 * valorizaba con `costPrice ?? price`: sin costo cargado (50 de 102 productos
 * activos de main el 09-10) usaba el precio de VENTA, y esa cifra quedaba
 * guardada en la orden como costo. Acá el costo nunca cae al precio de venta:
 * si no hay uno conocido, la casilla queda vacía y la orden no sale.
 */
export interface CompraItem extends PurchaseCartItem {
  /**
   * Costo unitario escrito (o leído de la factura).
   * `undefined` = no se tocó: vale el sugerido. `null` = se borró: falta.
   */
  unitCost?: number | null;
}

/** Último costo pagado por producto (productId → S/), de las órdenes de compra. */
export type HistorialCostos = Record<number, number>;

function positivo(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** El de la última compra; si nunca se compró, el costo cargado en el producto. */
export function costoSugerido(producto: PurchaseProduct, historial: HistorialCostos): number | null {
  return positivo(historial[producto.id]) ?? positivo(producto.costPrice);
}

/** Costo con el que se valoriza el ítem, o `null` si falta. */
export function costoDe(item: CompraItem, historial: HistorialCostos): number | null {
  if (item.unitCost === null) return null;
  if (item.unitCost !== undefined) return positivo(item.unitCost);
  return costoSugerido(item.product, historial);
}

/** De dónde sale el costo de una línea (auditoría Compras C03: «usar un valor previo requiere identificar su origen»). */
export type FuenteCosto = "ultima-compra" | "ficha" | "escrito" | "falta";

export function fuenteDelCosto(item: CompraItem, historial: HistorialCostos): FuenteCosto {
  if (item.unitCost === null) return "falta";
  if (item.unitCost !== undefined) return positivo(item.unitCost) != null ? "escrito" : "falta";
  if (positivo(historial[item.product.id]) != null) return "ultima-compra";
  return positivo(item.product.costPrice) != null ? "ficha" : "falta";
}

/** Rótulo corto y explicación de cada fuente, para la línea de la canasta. */
export const FUENTES_COSTO: Record<Exclude<FuenteCosto, "falta">, { corto: string; ayuda: string }> = {
  "ultima-compra": { corto: "última compra", ayuda: "Lo que pagaste en tu última orden de compra de este producto. Revísalo si el proveedor subió el precio." },
  ficha: { corto: "de la ficha", ayuda: "El costo cargado en la ficha del producto: nunca lo compraste por aquí. Revísalo con la factura." },
  escrito: { corto: "escrito", ayuda: "El costo que escribiste o que se leyó de la factura." },
};

/**
 * IGV contenido en la compra (ADR-377: el costo ya lo incluye, se desglosa, no
 * se suma). Sólo lo gravado lleva IGV: exonerado e inafecto van aparte. El
 * descuento se reparte en proporción. Es preview: el servidor recalcula.
 */
export interface DesgloseIgv {
  /** Valor de venta de lo gravado, sin IGV. */
  base: number;
  igv: number;
  /** Exonerado + inafecto: sin IGV. */
  noGravado: number;
}

export function desgloseIgv(
  lineas: ReadonlyArray<{ monto: number; taxType?: string | null }>,
  total: number,
  tasa = TASA_IGV,
): DesgloseIgv {
  const subtotal = lineas.reduce((s, l) => s + l.monto, 0);
  if (!(subtotal > 0) || !(total > 0)) return { base: 0, igv: 0, noGravado: 0 };
  const gravado = lineas.reduce((s, l) => (afectacionDe(l.taxType) === "gravado" ? s + l.monto : s), 0) * (total / subtotal);
  const base = gravado / (1 + tasa);
  return { base, igv: gravado - base, noGravado: total - gravado };
}

export function itemsSinCosto(items: CompraItem[], historial: HistorialCostos): CompraItem[] {
  return items.filter((i) => costoDe(i, historial) == null);
}

/** La canasta con el costo efectivo puesto en `costPrice`, para piezas que leen ese campo (PDF). */
export function conCostoEfectivo(items: CompraItem[], historial: HistorialCostos): CompraItem[] {
  return items.map((i) => ({ ...i, product: { ...i.product, costPrice: costoDe(i, historial) ?? 0 } }));
}

/**
 * Último costo pagado por producto a partir de `/api/purchases` (vienen de la
 * más nueva a la más vieja: el primero que aparece es el último pagado).
 */
export function historialDesdeOrdenes(ordenes: unknown): HistorialCostos {
  const lista = Array.isArray(ordenes) ? ordenes : [];
  const historial: HistorialCostos = {};
  for (const po of lista) {
    const items = (po as { items?: unknown })?.items;
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      const { productId, unitCost } = (it ?? {}) as { productId?: unknown; unitCost?: unknown };
      const id = Number(productId);
      const costo = positivo(unitCost);
      if (Number.isInteger(id) && costo != null && historial[id] === undefined) historial[id] = costo;
    }
  }
  return historial;
}

/**
 * El historial con los costos de la orden que acabas de crear: la siguiente
 * orden sugiere lo que recién pagaste, no lo de la compra anterior.
 */
export function historialConCompra(
  historial: HistorialCostos,
  enviados: ReadonlyArray<{ productId: number; unitCost: number }>,
): HistorialCostos {
  const nuevo: HistorialCostos = { ...historial };
  for (const { productId, unitCost } of enviados) {
    const costo = positivo(unitCost);
    if (Number.isInteger(productId) && costo != null) nuevo[productId] = costo;
  }
  return nuevo;
}
