import type { UnifiedProductCardProduct } from "@/components/marketplace/UnifiedProductCard";

/**
 * Forma de un producto de `/api/marketplace/catalog` y su adaptador a la
 * tarjeta. Una sola fuente para la grilla (CatalogView) y los pasillos de la
 * home (HomeEstantes). Salió de CatalogView al partirlo (2026-10-10).
 */
export interface CatalogProduct {
  storeProductId: string;
  productId: number;
  name: string;
  /** Descripción corta (la tarjeta de la home no la muestra). */
  description?: string | null;
  /** El API la serializa como string ("22"): el adaptador la normaliza. */
  price: number | string;
  originalPrice?: number | string | null;
  image: string | null;
  unit: string | null;
  category: string | null;
  stock: number;
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeLogo: string | null;
  storeZone: string | null;
  storeRating: number;
  storeCategory: string | null;
  /** Comentarios públicos (estilo IG) del producto — Brandon 2026-06-06 */
  commentCount?: number;
  // C5 — Sponsored
  isSponsored?: boolean;
  sponsoredBoostId?: string | null;
}

export function toCatalogCardProduct(product: CatalogProduct): UnifiedProductCardProduct {
  const original = product.originalPrice != null ? Number(product.originalPrice) : undefined;
  return {
    id: product.productId,
    name: product.name,
    description: product.description ?? null,
    price: Number(product.price),
    originalPrice: original != null && Number.isFinite(original) ? original : undefined,
    image: product.image,
    storeName: product.storeName,
    storeSlug: product.storeSlug,
    storeId: product.storeId,
    storeProductId: product.storeProductId,
    storeRating: product.storeRating,
    storeLogo: product.storeLogo,
    unit: product.unit,
    category: product.category ?? undefined,
    stock: product.stock,
    commentCount: product.commentCount,
  };
}

/** Href del detalle: /marketplace/[slug]/producto/[productId]. */
export function hrefDeProducto(product: CatalogProduct): string {
  return `/marketplace/${product.storeSlug}/producto/${product.productId}`;
}

/** Agotados al fondo, partición estable (el orden del server se respeta). */
export function agotadosAlFondo<T extends { stock?: number | null }>(lista: T[]): T[] {
  const conStock: T[] = [];
  const agotados: T[] = [];
  for (const p of lista) ((p.stock ?? 0) > 0 ? conStock : agotados).push(p);
  return [...conStock, ...agotados];
}
