import type { UnifiedProductCardProduct } from "@/components/marketplace/UnifiedProductCard";

/**
 * Un producto tal como lo devuelven los endpoints públicos del marketplace
 * (`/api/marketplace/catalog`, `/catalog/sections`, `getTopToday`). Cada uno
 * trae la tienda distinto (plano `storeSlug` o anidado `store.slug`), por eso
 * se normaliza en un solo lugar para las secciones de la home.
 */
export type ProductoCrudo = Record<string, unknown>;

const texto = (v: unknown): string => (v == null ? "" : String(v));
const numero = (v: unknown): number | undefined => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export function aProductoDeCatalogo(raw: ProductoCrudo): UnifiedProductCardProduct {
  const store = (raw.store ?? {}) as Record<string, unknown>;
  const images = Array.isArray(raw.images) ? (raw.images as unknown[]) : [];
  const price = numero(raw.price) ?? 0;
  // Precio anterior solo si el dato existe: un descuento declarado o un
  // `originalPrice` mayor. Nunca se inventa un «−X %».
  const descuento = numero(raw.discountPercent);
  const original = numero(raw.originalPrice);
  const originalPrice =
    original != null && original > price
      ? original
      : descuento != null && descuento > 0 && descuento < 100
        ? Math.round((price / (1 - descuento / 100)) * 100) / 100
        : undefined;
  const imagen = raw.image ?? images[0];
  return {
    id: numero(raw.productId ?? raw.id) ?? 0,
    name: texto(raw.name),
    price,
    originalPrice,
    discount: descuento != null && descuento > 0 ? descuento : undefined,
    image: typeof imagen === "string" && imagen ? imagen : null,
    unit: typeof raw.unit === "string" ? raw.unit : null,
    category: texto(raw.category) || undefined,
    stock: numero(raw.stock),
    storeName: texto(raw.storeName ?? store.name),
    storeSlug: texto(raw.storeSlug ?? store.slug),
    storeId: texto(raw.storeId ?? store.id),
    storeProductId: texto(raw.storeProductId),
    storeLogo: typeof (raw.storeLogo ?? store.logo) === "string" ? String(raw.storeLogo ?? store.logo) : null,
    storeRating: numero(raw.storeRating ?? store.rating ?? raw.avgRating) ?? 0,
    storeCategory: typeof raw.storeCategory === "string" ? raw.storeCategory : null,
    commentCount: numero(raw.commentCount),
  };
}
