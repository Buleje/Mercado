/**
 * Familias de producto del marketplace (home «Dosel», 2026-10-10).
 * Única fuente para: agrupar categorías en el bento, teñir el placeholder sin
 * foto, el rótulo de los pasillos y la portada de las tiendas sin banner.
 * El color NO vive acá: lo pone `[data-familia]` en app/globals.css.
 * Reemplaza a CATEGORY_BLOCKS de app/(store)/page.tsx (mismas reglas, más
 * palabras de rubro de tienda y `\bres\b` para que «refresco» no caiga en frescos).
 */
import {
  UtensilsCrossed,
  Leaf,
  GlassWater,
  ShoppingBasket,
  Sparkles,
  Package,
  type LucideIcon,
} from "@buleje/design-system/icons";

export type FamiliaId = "comida" | "frescos" | "bebidas" | "despensa" | "hogar" | "mas";

export interface Familia {
  id: FamiliaId;
  label: string;
  icon: LucideIcon;
  /** 1.er match gana; la familia sin `match` (la última) es el «Más». */
  match?: RegExp;
}

export const FAMILIAS: readonly Familia[] = [
  {
    id: "comida",
    label: "Comida preparada",
    icon: UtensilsCrossed,
    match:
      /pizz|calzon|brasa|broaster|alita|hamburgues|sandwich|salchipapa|shawarma|\bmenu\b|combo|almuerzo|parrilla|guiso|caldo|sopa|cebiche|ceviche|postre|helado|torta|keke|ensalada|guarnicion|acompan|desayuno|anticucho|promocion|restaurant|polleri|pizzeri|chifa|cafeteri/,
  },
  {
    id: "frescos",
    label: "Frescos",
    icon: Leaf,
    match:
      /fruta|verdura|carne|pollo|\bres\b|cerdo|chancho|pescado|marisco|paiche|\bfresco|huevo|lacteo|queso|leche|yogur|embutido|mercado|fruteri|carniceri/,
  },
  {
    id: "bebidas",
    label: "Bebidas",
    icon: GlassWater,
    match:
      /bebida|gaseosa|\bagua\b|jugo|refresco|chicha|kola|\bcola\b|cerveza|pilsen|licor|vino|pisco|\bron\b|whisky|trago|energizante|cafe|emoliente|limonada/,
  },
  {
    id: "despensa",
    label: "Despensa",
    icon: ShoppingBasket,
    match:
      /abarrote|snack|golosina|galleta|fideo|pasta|arroz|azucar|aceite|conserva|enlatado|panaderi|\bpan\b|dulce|cereal|harina|menestra|grano|salsa|condimento|atun|bodega|minimarket/,
  },
  {
    id: "hogar",
    label: "Hogar y cuidado",
    icon: Sparkles,
    match:
      /limpieza|hogar|aseo|ferreteri|herramienta|construccion|madera|electro|tecnologi|celular|farmacia|botica|salud|mascota|bebe|cuidado|regalo|papeleri|alquiler/,
  },
  { id: "mas", label: "Más categorías", icon: Package },
];

/** minúsculas + sin tildes/ñ → «Lácteos» y «lacteos» matchean igual. */
export function sinTildes(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function buscar(texto?: string | null): FamiliaId {
  if (!texto) return "mas";
  const t = sinTildes(texto);
  return FAMILIAS.find((f) => f.match?.test(t))?.id ?? "mas";
}

/** Familia de una categoría; si la categoría no dice nada, prueba con el nombre. */
export function familiaDe(categoria?: string | null, nombre?: string | null): FamiliaId {
  const porCategoria = buscar(categoria);
  return porCategoria !== "mas" ? porCategoria : buscar(nombre);
}

export function familiaPorId(id: FamiliaId): Familia {
  return FAMILIAS.find((f) => f.id === id) ?? FAMILIAS[FAMILIAS.length - 1];
}

/** Clave para unir duplicados de mayúsculas: «Bebidas» y «bebidas» → «bebidas». */
export function claveCategoria(id: string): string {
  return sinTildes(id).trim().replace(/[\s_]+/g, "-");
}

/** «pollo-brasa» → «Pollo brasa». */
export function etiquetaCategoria(id: string): string {
  const s = id.replace(/[-_]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
