/**
 * @buleje/design-system/product-card — Shared types for ProductCard primitives.
 *
 * 3 tamanos canonicos: Hero, Grid, Compact. Todos consumen la misma shape de
 * producto + set de actions opcionales. Asi el mismo row de data alimenta las
 * 3 cards segun contexto (featured, grid catalogo, carousel compact).
 */

export type ProductCardBadge = "oferta" | "nuevo" | "agotado" | "socio" | "top";

export interface ProductCardProduct {
  id: string | number;
  name: string;
  price: number;
  /** Precio antes de descuento. Si `> price`, se renderiza tachado + chip %. */
  originalPrice?: number;
  image: string | null;
  imageAlt?: string;
  category?: string;
  /** Ej: "x 1kg", "x 6 unidades", "por paquete". */
  unit?: string;
  badge?: ProductCardBadge;
  /** Stock disponible. Si 0, la card se marca como agotada. */
  stock?: number;
  /** 0-5, acepta decimales. */
  rating?: number;
  reviewCount?: number;
  storeSlug?: string;
  storeName?: string;
  /** Override del link computado. Default: `/marketplace/${storeSlug}` o `/marketplace`. */
  href?: string;
  /** Override del % descuento. Si falta, se computa de originalPrice vs price. */
  discountPct?: number;
}

export interface ProductCardActions {
  onAddToCart?: (p: ProductCardProduct) => void;
  onQuickView?: (p: ProductCardProduct) => void;
  onAddToFavorites?: (p: ProductCardProduct) => void;
  onCompare?: (p: ProductCardProduct) => void;
  /**
   * Cantidad actual de este producto en el carrito del cliente.
   * Si > 0, la card muestra un badge contador sobre el botón de agregar.
   * El caller debe consultar el carrito y pasar el valor — la card es pura.
   */
  quantityInCart?: number;
}
