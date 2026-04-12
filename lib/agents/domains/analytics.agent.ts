/**
 * lib/agents/domains/analytics.agent.ts
 *
 * Domain agent for analytics operations: daily KPIs, product performance,
 * margin analysis, sales trends, and category breakdowns.
 */

import type { DomainAgent, AgentTask, AgentResult, AgentContext } from "@/lib/agents/types";
import { scopedLogger, scopedCache } from "@/lib/agents/context";
import { agentBus } from "@/lib/agents/bus";
import {
  OrdersDB,
  SalesDB,
  ProductsDB,
  CustomersDB,
} from "@/lib/db";

// ── Action handlers ──────────────────────────────────────────────────────────

async function dailyKpis(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);

  log.info("Computing daily KPIs", { action: task.action });

  const todayStr =
    (task.payload.date as string) ?? new Date().toISOString().split("T")[0];
  const todayStart = new Date(`${todayStr}T00:00:00.000Z`);

  const [orders, allSales, customers] = await Promise.all([
    cache.getOrSet(`analytics:orders-delivered:${todayStr}`, 60, () =>
      OrdersDB.getAllFiltered({
        status: "entregado",
        since: todayStart.toISOString(),
        tenantId: task.tenantId,
      }),
    ),
    cache.getOrSet("analytics:all-sales", 60, () => SalesDB.getAll(task.tenantId)),
    cache.getOrSet("analytics:all-customers", 300, () =>
      CustomersDB.getAll(task.tenantId),
    ),
  ]);

  // Filter POS sales for today
  const todaySales = allSales.filter(
    (s) => new Date(s.createdAt).toISOString().split("T")[0] === todayStr,
  );

  const orderRevenue = orders.reduce((sum, o) => sum + o.total, 0);
  const posRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
  const totalRevenue = orderRevenue + posRevenue;
  const totalTransactions = orders.length + todaySales.length;
  const avgTicket =
    totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

  // New customers today
  const newCustomers = customers.filter(
    (c) =>
      new Date(c.createdAt).toISOString().split("T")[0] === todayStr,
  ).length;

  return {
    success: true,
    data: {
      date: todayStr,
      revenue: Math.round(totalRevenue * 100) / 100,
      orderRevenue: Math.round(orderRevenue * 100) / 100,
      posRevenue: Math.round(posRevenue * 100) / 100,
      ordersCount: orders.length,
      posSalesCount: todaySales.length,
      totalTransactions,
      avgTicket: Math.round(avgTicket * 100) / 100,
      newCustomers,
    },
  };
}

async function productPerformance(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);

  log.info("Analyzing product performance", { action: task.action });

  const limit = (task.payload.limit as number) ?? 10;
  const days = (task.payload.days as number) ?? 30;

  const since = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [orders, allSales] = await Promise.all([
    cache.getOrSet(`analytics:orders-period:${days}`, 120, () =>
      OrdersDB.getAllFiltered({
        status: "entregado",
        since,
        tenantId: task.tenantId,
      }),
    ),
    cache.getOrSet("analytics:all-sales", 60, () => SalesDB.getAll(task.tenantId)),
  ]);

  const sinceDate = new Date(since);
  const salesInPeriod = allSales.filter(
    (s) => new Date(s.createdAt) >= sinceDate,
  );

  // Aggregate by product
  const productMap = new Map<
    number,
    { name: string; revenue: number; quantity: number }
  >();

  // From orders
  for (const order of orders) {
    for (const item of order.items) {
      const existing = productMap.get(item.id) ?? {
        name: item.name,
        revenue: 0,
        quantity: 0,
      };
      existing.revenue += item.price * item.quantity;
      existing.quantity += item.quantity;
      productMap.set(item.id, existing);
    }
  }

  // From POS sales
  for (const sale of salesInPeriod) {
    for (const item of sale.items) {
      const existing = productMap.get(item.productId) ?? {
        name: item.name,
        revenue: 0,
        quantity: 0,
      };
      existing.revenue += item.price * item.quantity;
      existing.quantity += item.quantity;
      productMap.set(item.productId, existing);
    }
  }

  const allProducts = Array.from(productMap.entries()).map(
    ([id, data]) => ({
      productId: id,
      ...data,
      revenue: Math.round(data.revenue * 100) / 100,
    }),
  );

  const topByRevenue = [...allProducts]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);

  const topByQuantity = [...allProducts]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit);

  const bottomByRevenue = [...allProducts]
    .sort((a, b) => a.revenue - b.revenue)
    .slice(0, limit);

  return {
    success: true,
    data: {
      period: `${days}_days`,
      totalProducts: allProducts.length,
      topByRevenue,
      topByQuantity,
      bottomByRevenue,
    },
  };
}

async function marginAnalysis(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);

  log.info("Analyzing profit margins", { action: task.action });

  const products = await cache.getOrSet(
    "analytics:all-products",
    120,
    () => ProductsDB.getAll(task.tenantId),
  );

  const withMargin = products
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
        profit: Math.round((p.price - p.costPrice!) * 100) / 100,
      };
    });

  const bestMargins = [...withMargin]
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 10);

  const worstMargins = [...withMargin]
    .sort((a, b) => a.margin - b.margin)
    .slice(0, 10);

  const avgMargin =
    withMargin.length > 0
      ? withMargin.reduce((sum, p) => sum + p.margin, 0) /
        withMargin.length
      : 0;

  // Margin by category
  const byCategory: Record<
    string,
    { totalRevenue: number; totalCost: number; products: number }
  > = {};
  for (const p of withMargin) {
    if (!byCategory[p.category]) {
      byCategory[p.category] = {
        totalRevenue: 0,
        totalCost: 0,
        products: 0,
      };
    }
    byCategory[p.category].totalRevenue += p.price;
    byCategory[p.category].totalCost += p.costPrice;
    byCategory[p.category].products += 1;
  }

  return {
    success: true,
    data: {
      totalAnalyzed: withMargin.length,
      avgMargin: Math.round(avgMargin * 100) / 100,
      bestMargins,
      worstMargins,
      byCategory: Object.entries(byCategory).map(([cat, vals]) => ({
        category: cat,
        avgMargin:
          Math.round(
            ((vals.totalRevenue - vals.totalCost) / vals.totalRevenue) *
              10000,
          ) / 100,
        products: vals.products,
      })),
    },
  };
}

async function salesTrend(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);

  log.info("Computing sales trend", { action: task.action });

  const days = (task.payload.days as number) ?? 14;
  const since = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [orders, allSales] = await Promise.all([
    cache.getOrSet(`analytics:delivered-since:${days}`, 120, () =>
      OrdersDB.getAllFiltered({
        status: "entregado",
        since,
        tenantId: task.tenantId,
      }),
    ),
    cache.getOrSet("analytics:all-sales", 60, () => SalesDB.getAll(task.tenantId)),
  ]);

  const sinceDate = new Date(since);
  const salesInPeriod = allSales.filter(
    (s) => new Date(s.createdAt) >= sinceDate,
  );

  // Build daily buckets
  const dailyMap = new Map<
    string,
    { revenue: number; orders: number; posSales: number }
  >();

  for (let i = 0; i < days; i++) {
    const d = new Date(
      Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000,
    );
    const key = d.toISOString().split("T")[0];
    dailyMap.set(key, { revenue: 0, orders: 0, posSales: 0 });
  }

  for (const o of orders) {
    const key = new Date(o.createdAt).toISOString().split("T")[0];
    const bucket = dailyMap.get(key);
    if (bucket) {
      bucket.revenue += o.total;
      bucket.orders += 1;
    }
  }

  for (const s of salesInPeriod) {
    const key = new Date(s.createdAt).toISOString().split("T")[0];
    const bucket = dailyMap.get(key);
    if (bucket) {
      bucket.revenue += s.total;
      bucket.posSales += 1;
    }
  }

  const trend = Array.from(dailyMap.entries()).map(([date, data]) => ({
    date,
    revenue: Math.round(data.revenue * 100) / 100,
    orders: data.orders,
    posSales: data.posSales,
    totalTransactions: data.orders + data.posSales,
  }));

  const totalRevenue = trend.reduce((sum, d) => sum + d.revenue, 0);
  const avgDaily = totalRevenue / days;

  return {
    success: true,
    data: {
      days,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgDailyRevenue: Math.round(avgDaily * 100) / 100,
      trend,
    },
  };
}

async function categoryBreakdown(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);

  log.info("Computing category breakdown", { action: task.action });

  const days = (task.payload.days as number) ?? 30;
  const since = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [orders, allSales, products] = await Promise.all([
    cache.getOrSet(`analytics:delivered-cat:${days}`, 120, () =>
      OrdersDB.getAllFiltered({
        status: "entregado",
        since,
        tenantId: task.tenantId,
      }),
    ),
    cache.getOrSet("analytics:all-sales", 60, () => SalesDB.getAll(task.tenantId)),
    cache.getOrSet("analytics:all-products", 120, () =>
      ProductsDB.getAll(task.tenantId),
    ),
  ]);

  const sinceDate = new Date(since);
  const salesInPeriod = allSales.filter(
    (s) => new Date(s.createdAt) >= sinceDate,
  );

  // Build product-to-category map
  const categoryMap = new Map<number, string>();
  for (const p of products) {
    categoryMap.set(p.id, p.category);
  }

  const catStats: Record<
    string,
    { revenue: number; quantity: number; transactions: number }
  > = {};

  // From orders
  for (const order of orders) {
    for (const item of order.items) {
      const cat = categoryMap.get(item.id) ?? "sin_categoria";
      if (!catStats[cat]) {
        catStats[cat] = { revenue: 0, quantity: 0, transactions: 0 };
      }
      catStats[cat].revenue += item.price * item.quantity;
      catStats[cat].quantity += item.quantity;
      catStats[cat].transactions += 1;
    }
  }

  // From POS sales
  for (const sale of salesInPeriod) {
    for (const item of sale.items) {
      const cat =
        categoryMap.get(item.productId) ?? "sin_categoria";
      if (!catStats[cat]) {
        catStats[cat] = { revenue: 0, quantity: 0, transactions: 0 };
      }
      catStats[cat].revenue += item.price * item.quantity;
      catStats[cat].quantity += item.quantity;
      catStats[cat].transactions += 1;
    }
  }

  const totalRevenue = Object.values(catStats).reduce(
    (sum, c) => sum + c.revenue,
    0,
  );

  const breakdown = Object.entries(catStats)
    .map(([category, data]) => ({
      category,
      revenue: Math.round(data.revenue * 100) / 100,
      quantity: data.quantity,
      transactions: data.transactions,
      percentage:
        totalRevenue > 0
          ? Math.round((data.revenue / totalRevenue) * 10000) / 100
          : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    success: true,
    data: {
      period: `${days}_days`,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      categories: breakdown,
    },
  };
}

// ── Agent definition ─────────────────────────────────────────────────────────

export const analyticsAgent: DomainAgent = {
  domain: "analytics",
  actions: [
    "daily-kpis",
    "product-performance",
    "margin-analysis",
    "sales-trend",
    "category-breakdown",
  ],
  description:
    "KPIs, reportes y analisis de negocio",

  async execute(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    const log = scopedLogger(ctx);

    try {
      agentBus.emit("task:started", {
        taskId: task.id,
        domain: "analytics",
        tenantId: task.tenantId,
      });

      let result: AgentResult;

      switch (task.action) {
        case "daily-kpis":
          result = await dailyKpis(task, ctx);
          break;
        case "product-performance":
          result = await productPerformance(task, ctx);
          break;
        case "margin-analysis":
          result = await marginAnalysis(task, ctx);
          break;
        case "sales-trend":
          result = await salesTrend(task, ctx);
          break;
        case "category-breakdown":
          result = await categoryBreakdown(task, ctx);
          break;
        default:
          result = {
            success: false,
            error: `Accion desconocida: ${task.action}`,
          };
      }

      agentBus.emit("task:completed", {
        taskId: task.id,
        domain: "analytics",
        success: result.success,
        tenantId: task.tenantId,
      });

      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);
      log.error("Analytics agent failed", {
        action: task.action,
        error: errorMessage,
      });

      agentBus.emit("task:failed", {
        taskId: task.id,
        domain: "analytics",
        error: errorMessage,
        tenantId: task.tenantId,
      });

      return { success: false, error: errorMessage };
    }
  },
};
