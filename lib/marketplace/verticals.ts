/**
 * Marketplace verticals — taxonomía CLIENTE-facing que agrupa TIPOS DE TIENDA
 * (`Store.category`) en "mundos" navegables del Inicio: Comida, Bodega,
 * Ferretería, Electro, Farmacia.
 *
 * Distinta de `lib/verticals/registry.ts` (ese mapea Industry → módulos del
 * PANEL admin). Acá decidimos qué tiendas/productos entran en cada chip del
 * Inicio del marketplace.
 *
 * Brandon 2026-06-11 (decisión de IA): Buleje arranca FOOD-FIRST. El Inicio
 * abre en `DEFAULT_VERTICAL` = "comida" (uso diario = retención); los materiales
 * (ferretería/electro) quedan a un toque, sin desaparecer. La regla de corte NO
 * es comestible/no — es "elijo la tienda" (comida preparada → Comida) vs "elijo
 * el producto y comparo precio" (commodity → catálogo).
 *
 * El match contra `Store.category` es CASE-INSENSITIVE: la data real tiene
 * valores inconsistentes ("Abarrotes", "bodega", "polleria"…). Comparamos en
 * minúsculas tanto acá como en el filtro Prisma (equals + mode:insensitive).
 */

export interface MarketplaceVertical {
  id: string;
  label: string;
  /** Nombre de icono Lucide — se resuelve en la UI. */
  icon: string;
  /** Tipos de tienda (`Store.category`, en minúsculas) que entran al vertical. */
  storeCategories: string[];
}

export const MARKETPLACE_VERTICALS: MarketplaceVertical[] = [
  {
    id: "comida",
    label: "Comida",
    icon: "UtensilsCrossed",
    storeCategories: ["restaurante", "polleria", "pizzeria", "panaderia", "carniceria", "comida", "cevicheria", "juguería", "jugueria"],
  },
  {
    id: "bodega",
    label: "Bodega",
    icon: "ShoppingBasket",
    storeCategories: ["bodega", "abarrotes", "minimarket", "fruteria", "mercado", "licoreria"],
  },
  {
    id: "ferreteria",
    label: "Ferretería",
    icon: "Wrench",
    storeCategories: ["ferreteria", "madereria", "construccion"],
  },
  {
    id: "electro",
    label: "Electro",
    icon: "Smartphone",
    storeCategories: ["tecnologia", "electro", "electrodomesticos"],
  },
  {
    id: "farmacia",
    label: "Farmacia",
    icon: "Pill",
    storeCategories: ["farmacia", "botica"],
  },
];

/** El Inicio abre acá (food-first). */
export const DEFAULT_VERTICAL = "comida";

const BY_ID = new Map(MARKETPLACE_VERTICALS.map((v) => [v.id, v]));

export function getVertical(id?: string | null): MarketplaceVertical | null {
  if (!id) return null;
  return BY_ID.get(id.toLowerCase()) ?? null;
}

/** Tipos de tienda (minúsculas) del vertical; `[]` si el id no existe. */
export function verticalStoreCategories(id?: string | null): string[] {
  return getVertical(id)?.storeCategories ?? [];
}

export function isValidVertical(id?: string | null): boolean {
  return !!id && BY_ID.has(id.toLowerCase());
}

/** Normaliza un id de vertical a uno válido, con fallback al default. */
export function normalizeVertical(id?: string | null): string {
  return isValidVertical(id) ? id!.toLowerCase() : DEFAULT_VERTICAL;
}
