import {
  ShoppingBasket,
  Milk,
  GlassWater,
  Cookie,
  Sparkles,
  Beef,
  Carrot,
  CroissantIcon,
  Wine,
  Snowflake,
  Package,
  type LucideIcon,
} from "lucide-react";
import type { CatalogCategory } from "./catalog-types";

/**
 * Editorial mono icons por categoria de catalogo.
 * Reemplaza el emoji del CatalogCategoryMeta con lucide icon monochromatico.
 */

export const CATALOG_CATEGORY_ICONS: Record<CatalogCategory, LucideIcon> = {
  abarrotes: ShoppingBasket,
  lacteos: Milk,
  bebidas: GlassWater,
  snacks: Cookie,
  limpieza: Sparkles,
  carnes: Beef,
  "frutas-verduras": Carrot,
  panaderia: CroissantIcon,
  licores: Wine,
  congelados: Snowflake,
};

export function getCatalogCategoryIcon(id: CatalogCategory | string): LucideIcon {
  return CATALOG_CATEGORY_ICONS[id as CatalogCategory] ?? Package;
}
