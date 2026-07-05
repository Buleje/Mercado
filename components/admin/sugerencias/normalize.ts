/**
 * components/admin/sugerencias/normalize.ts
 *
 * Normaliza las respuestas de /api/products, /api/sales y /api/purchases al shape
 * que esperan los tabs de Sugerencias IA.
 *
 * Por qué existe (bug 2026-07-05, verificado contra el API real):
 *  - `/api/products`  → array PLANO con `costPrice` (no `{ products }` ni `cost`).
 *  - `/api/sales`     → array PLANO de ventas crudas con `items[]` anidados
 *                       (no viene agrupado por producto).
 *  - `/api/purchases` → array PLANO de órdenes de compra con `items[]` anidados.
 * El código original leía `.products` / `.items` / `.purchases` sobre esos arrays,
 * obtenía `undefined ?? [] → []` y caía SIEMPRE al fallback de datos demo.
 */

export interface NormProduct {
  id: string | number;
  name: string;
  stock: number;
  stockMin: number;
  stockMax?: number;
  price: number;
  cost?: number;
  category: string;
  unit?: string;
  imageUrl?: string;
  image?: string;
}

export interface NormSale {
  productId: string | number;
  quantity: number;
}

export interface NormPurchase {
  productId: string | number;
  supplierName?: string;
  unitCost: number;
}

/** Devuelve el array, ya sea plano o envuelto en `{ [key]: [...] }`. */
function asArray(raw: unknown, key: string): unknown[] {
  if (Array.isArray(raw)) return raw;
  const v = (raw as Record<string, unknown> | null)?.[key];
  return Array.isArray(v) ? v : [];
}

export function normalizeProducts(raw: unknown): NormProduct[] {
  return asArray(raw, "products").map((r) => {
    const p = r as Record<string, unknown>;
    return {
      id: (p.id as string | number) ?? "",
      name: String(p.name ?? ""),
      stock: Number(p.stock ?? 0),
      stockMin: Number(p.stockMin ?? 0),
      stockMax: p.stockMax != null ? Number(p.stockMax) : undefined,
      price: Number(p.price ?? 0),
      cost:
        p.cost != null
          ? Number(p.cost)
          : p.costPrice != null
            ? Number(p.costPrice)
            : undefined,
      category: String(p.category ?? ""),
      unit: p.unit != null ? String(p.unit) : undefined,
      imageUrl: p.imageUrl != null ? String(p.imageUrl) : undefined,
      image: p.image != null ? String(p.image) : undefined,
    };
  });
}

interface RawSaleItem {
  productId?: string | number;
  quantity?: number;
}
interface RawSale {
  items?: RawSaleItem[];
}

/** Aplana los `items[]` de las ventas crudas y suma la cantidad por producto. */
export function aggregateSalesByProduct(raw: unknown): NormSale[] {
  const agg = new Map<string, number>();
  for (const s of asArray(raw, "items") as RawSale[]) {
    for (const it of s.items ?? []) {
      if (it.productId == null) continue;
      const k = String(it.productId);
      agg.set(k, (agg.get(k) ?? 0) + (Number(it.quantity) || 0));
    }
  }
  return Array.from(agg, ([productId, quantity]) => ({ productId, quantity }));
}

interface RawPurchaseItem {
  productId?: string | number;
  unitCost?: number;
}
interface RawPurchaseOrder {
  supplierName?: string;
  items?: RawPurchaseItem[];
}

/** Aplana los `items[]` de las órdenes de compra a una fila por (producto, proveedor). */
export function aggregatePurchasesByProduct(raw: unknown): NormPurchase[] {
  const out: NormPurchase[] = [];
  for (const po of asArray(raw, "purchases") as RawPurchaseOrder[]) {
    for (const it of po.items ?? []) {
      if (it.productId == null) continue;
      out.push({
        productId: it.productId,
        supplierName: po.supplierName,
        unitCost: Number(it.unitCost) || 0,
      });
    }
  }
  return out;
}

/** Fecha `YYYY-MM-DD` de hace `days` días, en hora local (para el filtro ?from=). */
export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}
