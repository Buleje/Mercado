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

/** Cómo se cargó el item: manual (usuario ingresó datos) o linked
 *  (escogido del catálogo de una tienda — se autocompleta y mantiene
 *  el ID para sincronizar precio si querés). */
export type PromoItemSource = "manual" | "linked";

/** Posición libre dentro del banner — % desde el borde sup-izq. Si null,
 *  el elemento se renderiza con su layout por defecto (flex). */
export type Anchor = { x: number; y: number };

export type PromoItem = {
  id: string;
  source: PromoItemSource;
  productName: string;
  productImage: string | null;
  price: number | null;
  oldPrice: number | null;
  badge: string;
  buyHref: string;
  buyLabel: string;
  /** Source="linked": referencia al producto real para resync. */
  linkedStoreSlug?: string | null;
  linkedProductId?: string | number | null;
  /** Encuadre de la imagen del producto (drag/zoom/fit por item). */
  imageAdjust?: ImageAdjust;
  /** Posición libre del botón "Comprar" dentro del banner. Si undefined,
   *  usa el layout por defecto (lado derecho, centrado vertical). */
  buyAnchor?: Anchor | null;
  /** Posición libre de la insignia/badge. Si undefined, va arriba del nombre. */
  badgeAnchor?: Anchor | null;
  /** Posición libre de la imagen del producto. Si undefined, usa el slot flex
   *  por defecto (lado izquierdo, square 80% del alto). Cuando está set, se
   *  renderiza absolute centrada en el anchor con tamaño `productSize` (def. 30%). */
  productAnchor?: Anchor | null;
  /** Tamaño relativo (% del ancho del banner) cuando productAnchor está libre.
   *  Default 28. Min 10, max 60. */
  productSize?: number;
  /** Tamaño relativo (% del ancho del banner) del botón "Comprar" cuando
   *  buyAnchor está libre. Default 22. Min 8, max 50. */
  buySize?: number;
};

/** Datos de promo embebida cuando type === "promo". Campos legacy (single)
 *  + opcional `items` para banner multi-producto. Si `items.length > 0`,
 *  el renderer ignora los campos legacy y dibuja la grilla. */
export type PromoEmbed = {
  productName: string;
  productImage: string | null;
  price: number | null;
  oldPrice: number | null;
  badge: string;
  buyHref: string;
  buyLabel: string;
  imageAdjust?: ImageAdjust;
  items?: PromoItem[];
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
  /** Programación (banners v2 F2): ISO date. Si falta, sin límite por ese lado.
   *  El banner se muestra solo si now ∈ [startsAt, endsAt] y active=true. */
  startsAt?: string | null;
  endsAt?: string | null;
  /** Segmentación (banners v2 F4): zonas donde se muestra. Vacío/ausente = todas. */
  targetZones?: string[];
  /** Default "classic" — back-compat con banners legacy sin tipo. */
  type?: BannerType;
  /** Datos de la promo embebida (solo si type==="promo"). */
  promo?: PromoEmbed;
  /** Encuadre de la imagen (drag/zoom/fit). Si falta, se asume DEFAULT_IMAGE_ADJUST. */
  imageAdjust?: ImageAdjust;
};

type BannerStore = Record<PromoBannerSlot, PromoBanner[]>;

const STORE = data as BannerStore;

/**
 * ¿El banner está vigente ahora? (banners v2 F2). Activo + dentro de la ventana
 * de programación [startsAt, endsAt]. Fechas ausentes/ inválidas = sin límite.
 */
export function isBannerLive(b: PromoBanner, nowMs: number = Date.now()): boolean {
  if (!b.active) return false;
  if (b.startsAt) {
    const s = Date.parse(b.startsAt);
    if (!Number.isNaN(s) && nowMs < s) return false;
  }
  if (b.endsAt) {
    const e = Date.parse(b.endsAt);
    if (!Number.isNaN(e) && nowMs > e) return false;
  }
  return true;
}

/** Devuelve los banners vigentes del slot (activos + en ventana), ordenados. */
export function getBannersForSlot(slot: PromoBannerSlot): PromoBanner[] {
  const now = Date.now();
  return (STORE[slot] ?? [])
    .filter((b) => isBannerLive(b, now))
    .sort((a, b) => a.order - b.order);
}

/** Lista todos los slots con sus banners (para superadmin). */
export function getAllBanners(): BannerStore {
  return STORE;
}
