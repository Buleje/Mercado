/**
 * lib/recommendations/combo-builder.ts
 *
 * Dynamic combo suggestions: analyzes current cart items and suggests
 * 2-3 complementary products based on co-occurrence patterns.
 *
 * Uses the existing product-similarity engine (co-occurrence data) to
 * find products that are frequently bought together with current cart items.
 * Applies a bundle discount as an incentive.
 */

import "server-only";
import { getRelatedProducts } from "./product-similarity";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ComboItem {
  productId: number;
  name: string;
  price: number;
  image: string | null;
  /** Co-occurrence score (higher = stronger association) */
  relevanceScore: number;
  reason: string;
}

export interface ComboSuggestion {
  comboItems: ComboItem[];
  /** Suggested combo discount percentage (5-15% based on items) */
  totalDiscount: number;
  reason: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_COMBO_ITEMS = 3;
const MIN_COMBO_ITEMS = 1;
const BASE_DISCOUNT_PCT = 5;
const PER_ITEM_DISCOUNT_PCT = 3; // +3% per additional combo item
const MAX_DISCOUNT_PCT = 15;
const CACHE_TTL = 300; // 5 min

// ── Main function ───────────────────────────────────────────────────────────

/**
 * Given a list of cart items (by productId), suggests 2-3 complementary
 * products based on co-occurrence analysis across completed orders.
 */
export async function buildCombo(
  tenantId: string,
  cartItems: { productId: number }[],
): Promise<ComboSuggestion> {
  if (cartItems.length === 0) {
    return { comboItems: [], totalDiscount: 0, reason: "Carrito vacío" };
  }

  const cartProductIds = new Set(cartItems.map((i) => i.productId));
  const cacheKey = `combo:${tenantId}:${[...cartProductIds].sort().join(",")}`;

  return getOrSet<ComboSuggestion>(cacheKey, CACHE_TTL, async () => {
    logger.debug("[combo-builder] Building combo", {
      tenantId,
      cartSize: cartItems.length,
    });

    // Aggregate co-occurrence scores from all cart items
    const aggregated = new Map<
      number,
      { score: number; name: string; price: number; image: string | null }
    >();

    for (const item of cartItems) {
      const related = await getRelatedProducts(tenantId, item.productId, 10);

      for (const r of related) {
        // Skip products already in cart
        if (cartProductIds.has(r.productId)) continue;

        const existing = aggregated.get(r.productId);
        if (existing) {
          existing.score += r.score;
        } else {
          aggregated.set(r.productId, {
            score: r.score,
            name: r.name,
            price: r.price,
            image: r.image,
          });
        }
      }
    }

    if (aggregated.size === 0) {
      // Fallback: suggest popular products not in cart
      const popularProducts = await prisma.product.findMany({
        where: {
          tenantId,
          active: true,
          deletedAt: null,
          id: { notIn: [...cartProductIds] },
          stock: { gt: 0 },
        },
        orderBy: { id: "desc" },
        take: MAX_COMBO_ITEMS,
        select: { id: true, name: true, price: true, image: true },
      });

      const comboItems: ComboItem[] = popularProducts.map((p) => ({
        productId: p.id,
        name: p.name,
        price: toNumOrZero(p.price),
        image: p.image,
        relevanceScore: 0,
        reason: "Producto popular de la tienda",
      }));

      return {
        comboItems,
        totalDiscount: comboItems.length >= MIN_COMBO_ITEMS ? BASE_DISCOUNT_PCT : 0,
        reason: "Productos populares que complementan tu compra",
      };
    }

    // Sort by aggregated score and take top N
    const topItems = Array.from(aggregated.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, MAX_COMBO_ITEMS);

    const comboItems: ComboItem[] = topItems.map(([productId, meta]) => ({
      productId,
      name: meta.name,
      price: meta.price,
      image: meta.image,
      relevanceScore: meta.score,
      reason: `Comprado frecuentemente con items de tu carrito (${meta.score}x)`,
    }));

    // Discount scales with number of combo items
    const discountPct = Math.min(
      BASE_DISCOUNT_PCT + (comboItems.length - 1) * PER_ITEM_DISCOUNT_PCT,
      MAX_DISCOUNT_PCT,
    );

    logger.debug("[combo-builder] Combo built", {
      tenantId,
      comboSize: comboItems.length,
      discountPct,
    });

    return {
      comboItems,
      totalDiscount: comboItems.length >= MIN_COMBO_ITEMS ? discountPct : 0,
      reason: `Combo sugerido: ${comboItems.length} producto(s) complementarios con ${discountPct}% de descuento`,
    };
  });
}
