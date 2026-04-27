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

/** Ajuste de imagen aplicado al banner.
 *  - `position.x|y`: offset en % (0=izq/top, 50=center, 100=der/bot). Default 50/50.
 *  - `scale`: % zoom respecto al ancho del slot (100=cover natural, >100 crop, <100 deja
 *    espacio negro/relleno). Default 100.
 *  - `fit`: "cover" llena el slot recortando; "contain" muestra la imagen entera con
 *    posibles franjas. Default "cover". */
export type ImageAdjust = {
  position: { x: number; y: number };
  scale: number;
  fit: "cover" | "contain";
};

export const DEFAULT_IMAGE_ADJUST: ImageAdjust = {
  position: { x: 50, y: 50 },
  scale: 100,
  fit: "cover",
};

/** Animación de transición en el carrusel (preview + carrusel público). */
export type CarouselTransition = "fade" | "slide" | "zoom" | "none";

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
  /** Encuadre de la imagen (drag/zoom/fit). Si falta, se asume DEFAULT_IMAGE_ADJUST. */
  imageAdjust?: ImageAdjust;
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
