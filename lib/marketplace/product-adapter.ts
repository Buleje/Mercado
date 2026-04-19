/**
 * product-adapter.ts — Normaliza las distintas shapes de producto del
 * marketplace hacia la shape canonica `ProductCardProduct` del DS (Ola 7).
 *
 * Tres shapes conviven hoy en marketplace:
 *   1) UnifiedProductCardProduct (legacy ProductCard) — id numerico
 *   2) CatalogProduct (CatalogView.tsx) — storeProductId + productId
 *   3) TopProduct / RecoProduct / CompareProduct — shapes mixtas mock
 *
 * El adapter acepta una shape permisiva y aplica defaults seguros. La meta
 * es que cualquier sitio del marketplace pueda pasarle su objeto tal cual
 * y obtener una shape consumible por `ProductCardHero/Grid/Compact` del DS.
 *
 * NO hace fetch, NO toca el server — pura transformacion de forma.
 */

import type { ProductCardProduct, ProductCardBadge } from "@buleje/design-system";

// Shape permisiva para aceptar cualquier fuente del marketplace.
export type RawMarketplaceProduct = {
  id?: string | number;
  productId?: string | number;
  storeProductId?: string;
  name?: string;
  price?: number;
  originalPrice?: number;
  previousPrice?: number;
  image?: string | null;
  thumbnail?: string | null;
  category?: string | null;
  unit?: string | null;
  badge?: string;
  badges?: string[];
  stock?: number;
  rating?: number;
  avgRating?: number;
  storeRating?: number;
  reviewCount?: number;
  storeSlug?: string;
  storeName?: string;
  store?: { slug?: string; name?: string; rating?: number };
  href?: string;
  discount?: number;
};

/** Valores aceptados por el DS ProductCardBadge. */
const VALID_BADGES: ReadonlySet<ProductCardBadge> = new Set<ProductCardBadge>([
  "oferta",
  "nuevo",
  "agotado",
  "socio",
  "top",
]);

/** Normaliza badge heuristico → uno de los 5 aceptados por el DS. */
function normalizeBadge(
  raw: string | undefined,
  badges: string[] | undefined,
  stock?: number,
): ProductCardBadge | undefined {
  if (stock === 0) return "agotado";
  const candidate = raw ?? badges?.[0];
  if (!candidate) return undefined;
  const lower = candidate.toLowerCase();
  if (VALID_BADGES.has(lower as ProductCardBadge)) {
    return lower as ProductCardBadge;
  }
  if (lower.includes("oferta") || lower.includes("offer") || lower.includes("sale")) {
    return "oferta";
  }
  if (lower.includes("nuevo") || lower.includes("new")) return "nuevo";
  if (lower.includes("socio") || lower.includes("premium")) return "socio";
  if (lower.includes("top") || lower.includes("best") || lower.includes("popular")) {
    return "top";
  }
  return undefined;
}

/**
 * Normaliza un producto arbitrario del marketplace hacia la shape canonica DS.
 *
 * @example
 *   const card = toProductCardShape(rawStoreProduct);
 *   <ProductCardGrid product={card} />
 */
export function toProductCardShape(
  raw: RawMarketplaceProduct,
): ProductCardProduct {
  const id = raw.id ?? raw.productId ?? raw.storeProductId ?? "";
  const name = raw.name ?? "";
  const price = Number(raw.price ?? 0);
  const originalPrice = raw.originalPrice ?? raw.previousPrice;
  const image = raw.image ?? raw.thumbnail ?? null;
  const storeSlug = raw.storeSlug ?? raw.store?.slug;
  const storeName = raw.storeName ?? raw.store?.name;
  const rating =
    raw.rating ?? raw.avgRating ?? raw.storeRating ?? raw.store?.rating;

  const href =
    raw.href ??
    (storeSlug && id ? `/marketplace/${storeSlug}?p=${id}` : undefined);

  let discountPct = raw.discount;
  if (!discountPct && originalPrice && originalPrice > price && price > 0) {
    discountPct = Math.round(((originalPrice - price) / originalPrice) * 100);
  }

  return {
    id,
    name,
    price,
    originalPrice,
    image,
    category: raw.category ?? undefined,
    unit: raw.unit ?? undefined,
    badge: normalizeBadge(raw.badge, raw.badges, raw.stock),
    stock: raw.stock,
    rating,
    reviewCount: raw.reviewCount,
    storeSlug,
    storeName,
    href,
    discountPct,
  };
}

/**
 * Formatea precio en soles peruanos con el patron usado por el marketplace.
 */
export function formatPEN(n: number): string {
  return `S/${n.toFixed(2)}`;
}
