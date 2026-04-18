/**
 * Tipos compartidos para el módulo de ofertas.
 * Espejo liviano de lib/mock-deals.ts para evitar imports circulares.
 */

export type DealCategory =
  | "abarrotes"
  | "frescos"
  | "bebidas"
  | "limpieza"
  | "lacteos"
  | "farmacia";

export type DealSortKey =
  | "discount_desc"
  | "price_asc"
  | "ends_soon"
  | "popular";

export type DealMinDiscount = 10 | 20 | 30 | 50;

export interface DealsSummary {
  totalProducts: number;
  totalStores: number;
  flashEndsAt: string;
}
