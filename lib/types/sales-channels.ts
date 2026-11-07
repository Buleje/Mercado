/**
 * Canales de venta social (TikTok Shop + Meta) — tipos compartidos client/server.
 *
 * La config vive en `Settings.storeThemeJson.salesChannels` (sin migración: el
 * storefront ya lee storeTheme). Los pixels se inyectan en el storefront vía
 * `components/Analytics.tsx` leyendo estos IDs. Las integraciones profundas
 * (OAuth, catálogo en vivo, live shopping, checkout nativo) son Fase 2 y
 * requieren apps de desarrollador aprobadas en TikTok/Meta.
 */

export interface MetaChannelConfig {
  connected: boolean;
  /** Meta Pixel ID — se inyecta en el storefront (PageView, ViewContent, AddToCart, Purchase). */
  pixelId: string;
  /** Token de la API de Conversiones (CAPI) — eventos server-side. Fase 2 para envío real. */
  capiToken: string;
  /** ID del Catálogo de Meta para anuncios dinámicos / Advantage+. */
  catalogId: string;
}

export interface TiktokChannelConfig {
  connected: boolean;
  /** TikTok Pixel ID — se inyecta en el storefront. */
  pixelId: string;
  /** ID del catálogo de TikTok Shop. */
  catalogId: string;
}

export interface SalesChannelsConfig {
  meta: MetaChannelConfig;
  tiktok: TiktokChannelConfig;
}

export const EMPTY_SALES_CHANNELS: SalesChannelsConfig = {
  meta: { connected: false, pixelId: "", capiToken: "", catalogId: "" },
  tiktok: { connected: false, pixelId: "", catalogId: "" },
};

/** Normaliza un objeto desconocido (de storeTheme) a SalesChannelsConfig. */
export function parseSalesChannels(raw: unknown): SalesChannelsConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  const meta = (o.meta ?? {}) as Record<string, unknown>;
  const tiktok = (o.tiktok ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const bool = (v: unknown) => v === true;
  return {
    meta: {
      connected: bool(meta.connected),
      pixelId: str(meta.pixelId),
      capiToken: str(meta.capiToken),
      catalogId: str(meta.catalogId),
    },
    tiktok: {
      connected: bool(tiktok.connected),
      pixelId: str(tiktok.pixelId),
      catalogId: str(tiktok.catalogId),
    },
  };
}
