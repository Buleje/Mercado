/**
 * lib/agents/domains/pricing.agent.ts
 *
 * Domain agent for pricing operations: margin checks, competitor gap analysis,
 * promotion candidates, bundle suggestions, and price history tracking.
 */

import type { DomainAgent, AgentTask, AgentResult, AgentContext } from "@/lib/agents/types";
import { scopedLogger, scopedCache } from "@/lib/agents/context";
import { agentBus } from "@/lib/agents/bus";
import {
  ProductsDB,
  PriceHistoryDB,
  BundlesDB,
  SalesDB,
  OrdersDB,
} from "@/lib/db";

// ── Action handlers ──────────────────────────────────────────────────────────

async function marginCheck(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);

  log.info("Checking price margins", { action: task.action });

  const minMargin = (task.payload.minMargin as number) ?? 15;
  const maxMargin = (task.payload.maxMargin as number) ?? 80;

  const products = await cache.getOrSet(
    "pricing:all-products",
    120,
    () => ProductsDB.getAll(task.tenantId),
  );

  const analyzed = products
    .filter((p) => p.active && p.costPrice != null && p.costPrice > 0)
    .map((p) => {
      const margin = ((p.price - p.costPrice!) / p.price) * 100;
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        price: p.price,
        costPrice: p.costPrice!,
        margin: Math.round(margin * 100) / 100,
      };
    });

  const belowMin = analyzed.filter((p) => p.margin < minMargin);
  const aboveMax = analyzed.filter((p) => p.margin > maxMargin);
  const inRange = analyzed.filter(
    (p) => p.margin >= minMargin && p.margin <= maxMargin,
  );

  return {
    success: true,
    data: {
      thresholds: { minMargin, maxMargin },
      totalAnalyzed: analyzed.length,
      summary: {
        belowMin: belowMin.length,
        inRange: inRange.length,
        aboveMax: aboveMax.length,
      },
      belowMinProducts: belowMin.sort((a, b) => a.margin - b.margin),
      aboveMaxProducts: aboveMax.sort((a, b) => b.margin - a.margin),
    },
  };
}

async function competitorGap(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);

  log.info("Analyzing competitor price gap (placeholder)", {
    action: task.action,
  });

  // Placeholder: no real competitor data source yet.
  // Returns structure for future integration.
  const products = await cache.getOrSet(
    "pricing:all-products",
    120,
    () => ProductsDB.getAll(task.tenantId),
  );

  const activeProducts = products.filter((p) => p.active);

  return {
    success: true,
    data: {
      status: "placeholder",
      message:
        "Analisis de competencia requiere integracion con fuente de precios externa. Estructura preparada para cuando este disponible.",
      productsAnalyzable: activeProducts.length,
      structure: {
        perProduct: {
          productId: "number",
          name: "string",
          ourPrice: "number",
          competitorPrice: "number | null",
          gap: "number (percentage)",
          recommendation: "'increase' | 'decrease' | 'maintain'",
        },
        summary: {
          overpriced: "number (count of products above market)",
          underpriced: "number (count of products below market)",
          competitive: "number (count within 5% of market)",
        },
      },
    },
    metadata: { isPlaceholder: true },
  };
}

async function promotionCandidates(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);

  log.info("Identifying promotion candidates", { action: task.action });

  const minMargin = (task.payload.minMargin as number) ?? 25;
  const limit = (task.payload.limit as number) ?? 15;

  const products = await cache.getOrSet(
    "pricing:all-products",
    120,
    () => ProductsDB.getAll(task.tenantId),
  );

  // Products suitable for promotion:
  // 1. Active with cost price data
  // 2. Margin above minimum (so discount does not reduce profitability)
  // 3. Prefer those with high stock (want to move inventory)
  const candidates = products
    .filter((p) => {
      if (!p.active || !p.costPrice || p.costPrice <= 0) return false;
      const margin = ((p.price - p.costPrice) / p.price) * 100;
      return margin >= minMargin;
    })
    .map((p) => {
      const margin = ((p.price - p.costPrice!) / p.price) * 100;
      const stockLevel = p.stock ?? 0;
      const stockMax = p.stockMax ?? 50;
      const stockRatio = stockMax > 0 ? stockLevel / stockMax : 0;

      // Score: higher stock ratio + higher margin = better candidate
      const score = stockRatio * 40 + (margin / 100) * 60;

      // Max discount that keeps margin above 10%
      const maxDiscount = Math.floor(margin - 10);

      return {
        id: p.id,
        name: p.name,
        category: p.category,
        price: p.price,
        costPrice: p.costPrice!,
        margin: Math.round(margin * 100) / 100,
        stock: stockLevel,
        stockMax,
        score: Math.round(score * 100) / 100,
        suggestedDiscount: Math.min(
          maxDiscount,
          Math.round(margin * 0.4),
        ),
        maxSafeDiscount: maxDiscount,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    success: true,
    data: {
      minMargin,
      totalCandidates: candidates.length,
      candidates,
    },
  };
}

async function bundleSuggestions(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);

  log.info("Generating bundle suggestions", { action: task.action });

  const limit = (task.payload.limit as number) ?? 5;
  const days = (task.payload.days as number) ?? 30;

  const since = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [orders, allSales, existingBundles] = await Promise.all([
    cache.getOrSet(`pricing:orders-bundle:${days}`, 120, () =>
      OrdersDB.getAllFiltered({
        status: "entregado",
        since,
        tenantId: task.tenantId,
      }),
    ),
    cache.getOrSet("pricing:all-sales", 60, () => SalesDB.getAll(task.tenantId)),
    BundlesDB.getAll(task.tenantId),
  ]);

  const sinceDate = new Date(since);
  const salesInPeriod = allSales.filter(
    (s) => new Date(s.createdAt) >= sinceDate,
  );

  // Analyze co-purchase patterns
  type PairData = {
    count: number;
    names: [string, string];
    ids: [number, number];
  };
  const pairCounts = new Map<string, PairData>();

  function analyzePairs(
    items: Array<{
      id?: number;
      productId?: number;
      name: string;
    }>,
  ) {
    const ids = items
      .map((i) => i.id ?? i.productId ?? 0)
      .filter((id) => id > 0);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = [
          Math.min(ids[i], ids[j]),
          Math.max(ids[i], ids[j]),
        ].join("-");
        const existing = pairCounts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          const nameI =
            items.find(
              (it) => (it.id ?? it.productId) === ids[i],
            )?.name ?? "";
          const nameJ =
            items.find(
              (it) => (it.id ?? it.productId) === ids[j],
            )?.name ?? "";
          pairCounts.set(key, {
            count: 1,
            names: [nameI, nameJ],
            ids: [ids[i], ids[j]],
          });
        }
      }
    }
  }

  for (const order of orders) {
    analyzePairs(order.items);
  }
  for (const sale of salesInPeriod) {
    analyzePairs(sale.items);
  }

  // Existing bundle product IDs to avoid suggesting duplicates
  const existingBundleKeys = new Set(
    existingBundles.map((b) =>
      b.items
        .map((i) => i.productId)
        .sort((a, c) => a - c)
        .join("-"),
    ),
  );

  const suggestions = Array.from(pairCounts.entries())
    .filter(([key]) => !existingBundleKeys.has(key))
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([, data]) => ({
      products: data.ids.map((id, idx) => ({
        productId: id,
        name: data.names[idx],
      })),
      coPurchaseCount: data.count,
      suggestedDiscount: 5, // Default 5% bundle discount
    }));

  return {
    success: true,
    data: {
      period: `${days}_days`,
      existingBundles: existingBundles.length,
      suggestions,
    },
  };
}

async function priceHistory(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);

  log.info("Fetching price history", { action: task.action });

  const productId = task.payload.productId as number | undefined;

  if (!productId) {
    return {
      success: false,
      error: "Se requiere 'productId' para consultar historial de precios",
    };
  }

  const [product, history] = await Promise.all([
    ProductsDB.getById(task.tenantId, productId),
    PriceHistoryDB.getByProduct(task.tenantId, productId),
  ]);

  if (!product) {
    return {
      success: false,
      error: `Producto no encontrado: ${productId}`,
    };
  }

  const priceChanges = history.map((h) => ({
    oldPrice: h.oldPrice,
    newPrice: h.newPrice,
    change: Math.round((h.newPrice - h.oldPrice) * 100) / 100,
    changePercent:
      h.oldPrice > 0
        ? Math.round(
            ((h.newPrice - h.oldPrice) / h.oldPrice) * 10000,
          ) / 100
        : 0,
    changedAt: h.changedAt,
  }));

  return {
    success: true,
    data: {
      productId,
      productName: product.name,
      currentPrice: product.price,
      costPrice: product.costPrice ?? null,
      currentMargin:
        product.costPrice && product.costPrice > 0
          ? Math.round(
              ((product.price - product.costPrice) / product.price) *
                10000,
            ) / 100
          : null,
      totalChanges: priceChanges.length,
      history: priceChanges,
    },
  };
}

// ── Agent definition ─────────────────────────────────────────────────────────

export const pricingAgent: DomainAgent = {
  domain: "pricing",
  actions: [
    "margin-check",
    "competitor-gap",
    "promotion-candidates",
    "bundle-suggestions",
    "price-history",
  ],
  description:
    "Gestiona precios: verificacion de margenes, analisis de competencia, candidatos a promocion, sugerencias de bundles e historial de precios.",

  async execute(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    const log = scopedLogger(ctx);

    try {
      agentBus.emit("task:started", {
        taskId: task.id,
        domain: "pricing",
        tenantId: task.tenantId,
      });

      let result: AgentResult;

      switch (task.action) {
        case "margin-check":
          result = await marginCheck(task, ctx);
          break;
        case "competitor-gap":
          result = await competitorGap(task, ctx);
          break;
        case "promotion-candidates":
          result = await promotionCandidates(task, ctx);
          break;
        case "bundle-suggestions":
          result = await bundleSuggestions(task, ctx);
          break;
        case "price-history":
          result = await priceHistory(task, ctx);
          break;
        default:
          result = {
            success: false,
            error: `Accion desconocida: ${task.action}`,
          };
      }

      agentBus.emit("task:completed", {
        taskId: task.id,
        domain: "pricing",
        success: result.success,
        tenantId: task.tenantId,
      });

      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);
      log.error("Pricing agent failed", {
        action: task.action,
        error: errorMessage,
      });

      agentBus.emit("task:failed", {
        taskId: task.id,
        domain: "pricing",
        error: errorMessage,
        tenantId: task.tenantId,
      });

      return { success: false, error: errorMessage };
    }
  },
};
