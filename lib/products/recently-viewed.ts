import "server-only";

/**
 * ROADMAP ITEM #51 — Recently viewed persistent
 *
 * Tracker de productos vistos recientemente — API para el cliente. Se
 * persiste en localStorage + opcionalmente sincroniza con backend para
 * clientes autenticados. El storage limit es 20 items.
 */

export const RECENTLY_VIEWED_KEY = "bmv.recently_viewed";
export const RECENTLY_VIEWED_LIMIT = 20;

export interface RecentlyViewedEntry {
  productId: number;
  name: string;
  imageUrl?: string;
  price: number;
  viewedAt: string;
}
