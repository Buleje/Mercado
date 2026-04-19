/**
 * @buleje/design-system/product-card — 3 primitivos canonicos para cards de producto.
 *
 * | Primitivo              | Tamano               | Uso                                           |
 * | ---------------------- | -------------------- | --------------------------------------------- |
 * | `ProductCardHero`      | Grande (2-col/full)  | Oferta del dia, featured, top de categoria    |
 * | `ProductCardGrid`      | Mediana (catalogo)   | Grids de marketplace, listados, resultados    |
 * | `ProductCardCompact`   | Pequena (180-260px)  | Carousels horizontales, "para vos", "top hoy" |
 *
 * Los 3 consumen la misma shape `ProductCardProduct` + set opcional de actions.
 *
 * @example
 *   <ProductCardHero product={featured} variant="oferta" priority />
 *   <ProductCardGrid product={p} onAddToCart={add} onAddToFavorites={fav} />
 *   <ProductCardCompact product={p} />
 */
export { ProductCardHero } from "./ProductCardHero";
export type { ProductCardHeroProps, ProductCardHeroVariant } from "./ProductCardHero";
export { ProductCardGrid } from "./ProductCardGrid";
export type { ProductCardGridProps } from "./ProductCardGrid";
export { ProductCardCompact } from "./ProductCardCompact";
export type { ProductCardCompactProps } from "./ProductCardCompact";
export type {
  ProductCardProduct,
  ProductCardActions,
  ProductCardBadge,
} from "./types";
