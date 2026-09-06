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
  Pizza,
  Drumstick,
  IceCreamCone,
  Sandwich,
  Beer,
  Salad,
  ChefHat,
  Fish,
  Coffee,
  Soup,
  Wrench,
  Hammer,
  Gift,
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
  // Brandon 2026-07-06 (audit inicio): categorías de comida preparada y otras
  // que antes caían al ícono "caja" (Package) genérico.
  pizzas: Pizza,
  pizza: Pizza,
  calzones: Pizza,
  postres: IceCreamCone,
  helados: IceCreamCone,
  guarniciones: Salad,
  acompanamientos: Salad,
  "acompañamientos": Salad,
  ensaladas: Salad,
  "pollo brasa": Drumstick,
  "pollo a la brasa": Drumstick,
  pollos: Drumstick,
  broaster: Drumstick,
  parrillas: Beef,
  hamburguesas: Sandwich,
  sandwiches: Sandwich,
  sopas: Soup,
  caldos: Soup,
  cebiches: Fish,
  ceviches: Fish,
  pescados: Fish,
  mariscos: Fish,
  cervezas: Beer,
  cerveza: Beer,
  licores: Wine,
  vinos: Wine,
  cafe: Coffee,
  "café": Coffee,
  desayunos: Coffee,
  menu: ChefHat,
  "menú": ChefHat,
  combos: ChefHat,
  promociones: Gift,
  ofertas: Gift,
  regalos: Gift,
  ferreteria: Wrench,
  "ferretería": Wrench,
  herramientas: Wrench,
  construccion: Hammer,
  "construcción": Hammer,
  madera: Hammer,
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

// Normaliza un id de categoría: minúsculas, sin acentos, guiones/underscores → espacio.
// "Pollo-brasa" / "POSTRES" / "acompañamientos" caen todos a su clave canónica.
function normalizeCatId(id: string): string {
  return id
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

// Hints por palabra clave: si el id normalizado CONTIENE alguno, gana ese ícono.
// Reduce los que caen al genérico Package. Orden = primero match gana.
const CATEGORY_NAME_HINTS: Array<[RegExp, LucideIcon]> = [
  [/pizza|calzon/, Pizza],
  [/pollo|brasa|broaster|alita/, Drumstick],
  [/postre|helado|dulce|torta|keke/, IceCreamCone],
  [/guarnicion|acompan|ensalada/, Salad],
  [/hamburgues|sandwich|salchipapa|shawarma/, Sandwich],
  [/sopa|caldo|crema/, Soup],
  [/cebiche|ceviche|pescado|marisco|paiche/, Fish],
  [/cerveza|pilsen|cusquena/, Beer],
  [/licor|vino|pisco|ron|whisky|trago/, Wine],
  [/cafe|desayuno|infusion/, Coffee],
  [/menu|combo|almuerzo|plato|guiso|parrilla/, ChefHat],
  [/promo|oferta|descuento/, Gift],
  [/regalo|obsequio/, Gift],
  [/ferret|herramient|clavo|tornillo/, Wrench],
  [/madera|construc|cemento|fierro/, Hammer],
  [/bebida|gaseosa|refresco|jugo|agua/, GlassWater],
  [/carne|res|cerdo|chuleta/, Beef],
  [/leche|yogur|queso|lacteo/, Milk],
  [/fruta|verdura|snack/, Apple],
  [/limpieza|detergente|jabon/, Sparkles],
  [/pan |panaderia|croissant|bizcocho/, CroissantIcon],
];

export function getProductCategoryIcon(id: string): LucideIcon {
  // 1) Match exacto (mapa canónico, con acentos originales).
  const direct = PRODUCT_CATEGORY_ICONS[id];
  if (direct) return direct;
  // 2) Match normalizado (sin acentos / guiones).
  const norm = normalizeCatId(id);
  const byNorm = PRODUCT_CATEGORY_ICONS[norm];
  if (byNorm) return byNorm;
  // 3) Hints por palabra clave → menos "cajita" genérica.
  for (const [re, icon] of CATEGORY_NAME_HINTS) if (re.test(norm)) return icon;
  return Package;
}

export function getStoreCategoryIcon(id: string): LucideIcon {
  return STORE_CATEGORY_ICONS[id] ?? Store;
}
