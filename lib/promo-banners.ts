/**
 * promo-banners.ts — Storage central de banners promocionales por slot.
 *
 * Hoy: JSON file estático (`lib/data/promo-banners.json`) cargado en build.
 * Mañana: tabla Prisma `PromoBanner` con CRUD desde superadmin.
 *
 * Slots disponibles: "explorar" | "bodegas" | "recetas" | "ofertas"
 */

import data from "@/lib/data/promo-banners.json";

export type PromoBannerSlot =
  | "explorar"
  | "explorar-mid"
  | "explorar-bottom"
  | "bodegas"
  | "recetas"
  | "ofertas"
  | "tiendas-hero"
  | "bento";

/** Tipo del banner — define qué campos se renderizan. */
export type BannerType = "classic" | "image" | "promo";

/** Datos de promo embebida cuando type === "promo". */
export type PromoEmbed = {
  productName: string;
  productImage: string | null;
  price: number | null;
  oldPrice: number | null;
  badge: string;
  buyHref: string;
  buyLabel: string;
};

export type PromoBanner = {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl: string | null;
  ctaHref: string;
  ctaLabel: string;
  /** Gradient de fondo cuando no hay imageUrl. */
  bgFrom: string;
  bgTo: string;
  active: boolean;
  order: number;
  /** Default "classic" — back-compat con banners legacy sin tipo. */
  type?: BannerType;
  /** Datos de la promo embebida (solo si type==="promo"). */
  promo?: PromoEmbed;
};

type BannerStore = Record<PromoBannerSlot, PromoBanner[]>;

const STORE = data as BannerStore;

/** Devuelve los banners activos del slot, ordenados por `order`. */
export function getBannersForSlot(slot: PromoBannerSlot): PromoBanner[] {
  return (STORE[slot] ?? [])
    .filter((b) => b.active)
    .sort((a, b) => a.order - b.order);
}

/** Lista todos los slots con sus banners (para superadmin). */
export function getAllBanners(): BannerStore {
  return STORE;
}
