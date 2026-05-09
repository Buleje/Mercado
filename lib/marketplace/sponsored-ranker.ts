import "server-only";
import { SponsoredBoostsDB } from "@/lib/db/sponsored-boosts.db";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type RankableProduct = {
  productId: number;
  isSponsored?: boolean;
  sponsoredBoostId?: string | null;
  [key: string]: unknown;
};

const MAX_SPONSORED_PER_PAGE = 3;

// ─── applyBoostsToProducts ────────────────────────────────────────────────────

/**
 * Dado un array de productos del catálogo/búsqueda, busca los boosts activos
 * para esos productIds, los sube al top (máx 3 por página) ordenados por
 * bidAmount desc, y despacha recordImpression para cada uno (fire-and-forget).
 */
export async function applyBoostsToProducts<T extends RankableProduct>(
  tenantId: string,
  products: T[],
  opts?: { storeId?: string },
): Promise<T[]> {
  if (products.length === 0) return products;

  const productIds = products.map((p) => p.productId);

  const activeBoosts = await SponsoredBoostsDB.getActiveBoostsForRanking(tenantId, {
    productIds,
    storeId: opts?.storeId,
  });

  if (activeBoosts.length === 0) {
    return products.map((p) => ({ ...p, isSponsored: false, sponsoredBoostId: null }));
  }

  // Mapa productId → boostId (el más alto bid gana si hay varios por producto)
  const boostMap = new Map<number, { boostId: string; bidAmount: number }>();
  for (const boost of activeBoosts) {
    const existing = boostMap.get(boost.productId);
    if (!existing || boost.bidAmount > existing.bidAmount) {
      boostMap.set(boost.productId, { boostId: boost.id, bidAmount: boost.bidAmount });
    }
  }

  const sponsored: T[] = [];
  const organic: T[] = [];

  for (const product of products) {
    const boostInfo = boostMap.get(product.productId);
    if (boostInfo && sponsored.length < MAX_SPONSORED_PER_PAGE) {
      sponsored.push({
        ...product,
        isSponsored: true,
        sponsoredBoostId: boostInfo.boostId,
      });
    } else {
      organic.push({
        ...product,
        isSponsored: false,
        sponsoredBoostId: null,
      });
    }
  }

  // Ordenar sponsored por bidAmount desc
  sponsored.sort((a, b) => {
    const bidA = boostMap.get(a.productId)?.bidAmount ?? 0;
    const bidB = boostMap.get(b.productId)?.bidAmount ?? 0;
    return bidB - bidA;
  });

  // Fire-and-forget: registrar impresiones de los sponsored
  for (const sp of sponsored) {
    if (sp.sponsoredBoostId) {
      SponsoredBoostsDB.recordImpression(tenantId, sp.sponsoredBoostId as string).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
    }
  }

  return [...sponsored, ...organic];
}
