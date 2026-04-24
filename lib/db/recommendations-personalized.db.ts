import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type DbRecommendedProduct = {
  productId: number;
  productName: string;
  category: string;
  image: string | null;
  unit: string | null;
  stock: number | null;
  storeId: string;
  storeName: string;
  storeSlug: string;
  retailPrice: number;
  avgRating: number;
  score: number;
  reason: string;
  isSponsored: boolean;
  sponsoredBoostId: string | null;
};

export type RecommendationParams = {
  customerId?: string;
  customerPhone?: string;
  storeSlug?: string;
  limit?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normaliza hora a entero 0-23. */
function getHour(): number {
  return new Date().getHours();
}

/** Devuelve si hora actual cae en ventana ±2h respecto a una hora frecuente. */
function isInHourWindow(currentHour: number, frequentHour: number): boolean {
  const diff = Math.abs(currentHour - frequentHour);
  return diff <= 2 || diff >= 22; // maneja el wrap 23→0
}

/** Elimina tildes y normaliza a lowercase. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// ─── RecommendationsPersonalizedDB ───────────────────────────────────────────

export const RecommendationsPersonalizedDB = {
  /**
   * Recomendaciones personalizadas "Para ti" basadas en historial de compras.
   * Si no hay historial, cae al cold start automáticamente.
   */
  async forMe(
    tenantId: string,
    params: RecommendationParams,
  ): Promise<DbRecommendedProduct[]> {
    const { customerId, customerPhone, limit = 20 } = params;

    if (!customerId && !customerPhone) {
      return RecommendationsPersonalizedDB.coldStart(tenantId, { limit });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const fiftyDaysAgo = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000);
    const currentHour = getHour();

    // 1. Historial reciente del customer (últimas 50 órdenes)
    const orders = await prisma.order.findMany({
      where: {
        tenantId,
        // customerId en este dominio es el phone del customer (clave natural en Order)
        customerPhone: customerId ?? customerPhone,
        deletedAt: null,
        createdAt: { gte: fiftyDaysAgo },
      },
      select: {
        id: true,
        createdAt: true,
        customerLocation: true,
        items: {
          select: {
            productId: true,
            product: { select: { category: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    if (orders.length === 0) {
      return RecommendationsPersonalizedDB.coldStart(tenantId, { limit });
    }

    // 2. Extrae categorías más frecuentes (top 5)
    const categoryCount = new Map<string, number>();
    const hourCount = new Map<number, number>();
    const recentProductIds = new Set<number>(); // comprados en últimos 7 días
    const customerLocation = orders[0]?.customerLocation ?? null;

    for (const order of orders) {
      const hour = order.createdAt.getHours();
      hourCount.set(hour, (hourCount.get(hour) ?? 0) + 1);

      const isRecent = order.createdAt >= sevenDaysAgo;

      for (const item of order.items) {
        if (item.product?.category) {
          const cat = item.product.category;
          categoryCount.set(cat, (categoryCount.get(cat) ?? 0) + 1);
        }
        if (isRecent && item.productId) {
          recentProductIds.add(item.productId);
        }
      }
    }

    const topCategories = [...categoryCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat]) => cat);

    const topHours = [...hourCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([hour]) => hour);

    // 3. Candidatos: productos activos de tiendas publicadas del tenant
    const candidates = await prisma.storeProduct.findMany({
      where: {
        isActive: true,
        store: {
          tenantId,
          isPublished: true,
        },
      },
      select: {
        id: true,
        retailPrice: true,
        storeId: true,
        productId: true,
        product: {
          select: {
            id: true,
            name: true,
            category: true,
            image: true,
            unit: true,
            stock: true,
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
            zone: true,
          },
        },
      },
      take: 300,
    });

    if (candidates.length === 0) {
      return [];
    }

    // 4. Ratings en batch
    const productIds = candidates.map((c) => c.productId);
    const ratingsAgg = await prisma.review.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        tenantId,
        status: "approved",
        deletedAt: null,
      },
      _avg: { rating: true },
    });
    const ratingMap = new Map(ratingsAgg.map((r) => [r.productId, r._avg.rating ?? 0]));

    // 5. Scoring
    const topCategorySet = new Set(topCategories.map(normalize));

    const scored = candidates.map((c) => {
      const pid = c.productId;
      const cat = normalize(c.product.category);
      const avgRating = ratingMap.get(pid) ?? 0;
      const storeZone = c.store.zone;

      let score = 0;
      const reasons: string[] = [];

      if (topCategorySet.has(cat)) {
        score += 3;
        const originalCat = c.product.category;
        reasons.push(`Porque comprás ${originalCat}`);
      }

      if (topHours.some((h) => isInHourWindow(currentHour, h))) {
        score += 2;
        reasons.push("En tu horario habitual");
      }

      // +1 si el customerLocation menciona la misma zona de la tienda
      if (customerLocation && storeZone && normalize(customerLocation).includes(normalize(storeZone))) {
        score += 1;
        reasons.push("Cerca de tu zona");
      }

      if (avgRating >= 4) {
        score += 0.5;
      }

      if (recentProductIds.has(pid)) {
        score -= 5; // anti-repetición
      }

      const reason = reasons.length > 0 ? reasons[0] : "Recomendado para ti";

      return {
        productId: pid,
        productName: c.product.name,
        category: c.product.category,
        image: c.product.image,
        unit: c.product.unit,
        stock: c.product.stock,
        storeId: c.store.id,
        storeName: c.store.name,
        storeSlug: c.store.slug,
        // TD-018: retailPrice es Decimal
        retailPrice: toNumOrZero(c.retailPrice),
        avgRating: Math.round(avgRating * 10) / 10,
        score,
        reason,
        isSponsored: false,
        sponsoredBoostId: null,
      };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  },

  /**
   * Cold start: top 20 más vendidos del mes (cuando no hay historial).
   */
  async coldStart(
    tenantId: string,
    opts?: { limit?: number },
  ): Promise<DbRecommendedProduct[]> {
    const limit = opts?.limit ?? 20;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const topSellers = await prisma.orderItem.groupBy({
      by: ["productId"],
      where: {
        order: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: thirtyDaysAgo },
        },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: limit * 2, // margen para enriquecer y devolver `limit`
    });

    if (topSellers.length === 0) {
      return [];
    }

    const productIds = topSellers.map((s) => s.productId).filter(Boolean) as number[];

    const storeProducts = await prisma.storeProduct.findMany({
      where: {
        productId: { in: productIds },
        isActive: true,
        store: {
          tenantId,
          isPublished: true,
        },
      },
      select: {
        retailPrice: true,
        productId: true,
        product: {
          select: {
            id: true,
            name: true,
            category: true,
            image: true,
            unit: true,
            stock: true,
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      take: limit,
    });

    const ratingsAgg = await prisma.review.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        tenantId,
        status: "approved",
        deletedAt: null,
      },
      _avg: { rating: true },
    });
    const ratingMap = new Map(ratingsAgg.map((r) => [r.productId, r._avg.rating ?? 0]));

    // Ordena según el ranking de topSellers
    const rankMap = new Map(topSellers.map((s, i) => [s.productId, i]));

    return storeProducts
      .sort((a, b) => (rankMap.get(a.productId) ?? 999) - (rankMap.get(b.productId) ?? 999))
      .slice(0, limit)
      .map((sp) => ({
        productId: sp.productId,
        productName: sp.product.name,
        category: sp.product.category,
        image: sp.product.image,
        unit: sp.product.unit,
        stock: sp.product.stock,
        storeId: sp.store.id,
        storeName: sp.store.name,
        storeSlug: sp.store.slug,
        // TD-018: retailPrice es Decimal
        retailPrice: toNumOrZero(sp.retailPrice),
        avgRating: Math.round((ratingMap.get(sp.productId) ?? 0) * 10) / 10,
        score: 0,
        reason: "Más vendido este mes",
        isSponsored: false,
        sponsoredBoostId: null,
      }));
  },
};
