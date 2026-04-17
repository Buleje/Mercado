import {
  Flame,
  ShoppingCart,
  GlassWater,
  Milk,
  Beef,
  Apple,
  Carrot,
  Sparkles,
  Cookie,
  CroissantIcon,
  Store,
  Building2,
  Wine,
  Pill,
  UtensilsCrossed,
  Package,
  Leaf,
  DollarSign,
  type LucideIcon,
} from "lucide-react";

/**
 * Mapa canonico de categorias → icono lucide.
 * Centraliza reemplazo de emojis en filtros, chips, breadcrumbs, etc.
 */

export const PRODUCT_CATEGORY_ICONS: Record<string, LucideIcon> = {
  todos: Flame,
  abarrotes: ShoppingCart,
  bebidas: GlassWater,
  "lácteos": Milk,
  lacteos: Milk,
  carnes: Beef,
  frutas: Apple,
  verduras: Carrot,
  limpieza: Sparkles,
  snacks: Cookie,
  "panadería": CroissantIcon,
  panaderia: CroissantIcon,
  frescos: Leaf,
  otros: Package,
  precio: DollarSign,
};

export const STORE_CATEGORY_ICONS: Record<string, LucideIcon> = {
  todos: Store,
  bodega: ShoppingCart,
  minimarket: Building2,
  fruteria: Apple,
  carniceria: Beef,
  panaderia: CroissantIcon,
  licoreria: Wine,
  farmacia: Pill,
  restaurante: UtensilsCrossed,
};

export function getProductCategoryIcon(id: string): LucideIcon {
  return PRODUCT_CATEGORY_ICONS[id] ?? Package;
}

export function getStoreCategoryIcon(id: string): LucideIcon {
  return STORE_CATEGORY_ICONS[id] ?? Store;
}
