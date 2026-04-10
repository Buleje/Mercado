/**
 * lib/agents/domains/inventory.agent.ts
 *
 * Domain agent for inventory operations: stock checks, FEFO audits,
 * reorder suggestions, valuations, and movement summaries.
 */

import type { DomainAgent, AgentTask, AgentResult, AgentContext } from "@/lib/agents/types";
import { scopedLogger, scopedCache } from "@/lib/agents/context";
import { agentBus } from "@/lib/agents/bus";
import {
  ProductsDB,
  InventoryMovementsDB,
  AutoReorderDB,
} from "@/lib/db";
import { BatchesDB } from "@/lib/db/batches.db";

// ── Action handlers ──────────────────────────────────────────────────────────

async function checkStock(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);

  log.info("Checking stock levels", { action: task.action });

  const threshold = (task.payload.threshold as number) ?? undefined;

  const products = await cache.getOrSet("inventory:all-products", 120, () =>
    ProductsDB.getAll(),
  );

  const withStock = products.filter((p) => p.stock != null && p.active);

  const lowStock = withStock.filter(
    (p) => p.stock! <= (threshold ?? p.stockMin ?? 5),
  );

  const outOfStock = withStock.filter((p) => p.stock! <= 0);

  // ── Subtask delegation: alert notifications agent if stock is critical ───
  const subtasks: AgentResult["subtasks"] = [];
  if (outOfStock.length > 0) {
    subtasks.push({
      domain: "notifications",
      action: "send-stock-alert",
      payload: {
        type: "out-of-stock",
        count: outOfStock.length,
        products: outOfStock.slice(0, 10).map((p) => p.name),
      },
      priority: "high",
    });
  }
  if (lowStock.length >= 5) {
    subtasks.push({
      domain: "notifications",
      action: "send-stock-alert",
      payload: {
        type: "low-stock-batch",
        count: lowStock.length,
        products: lowStock.slice(0, 10).map((p) => ({ name: p.name, stock: p.stock })),
      },
      priority: "normal",
    });
  }

  return {
    success: true,
    data: {
      totalProducts: withStock.length,
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
      lowStockProducts: lowStock.map((p) => ({
        id: p.id,
        name: p.name,
        stock: p.stock,
        stockMin: p.stockMin ?? 5,
        category: p.category,
      })),
      outOfStockProducts: outOfStock.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
      })),
    },
    metadata: { cachedProducts: true },
    ...(subtasks.length > 0 && { subtasks }),
  };
}

async function fefoAudit(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);

  log.info("Running FEFO audit", { action: task.action });

  const daysAhead = (task.payload.daysAhead as number) ?? 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);

  const batches = await cache.getOrSet(
    `inventory:fefo-batches:${daysAhead}`,
    180,
    async () => {
      // BatchesDB.getExpiring devuelve DbBatch[] con expiryDate como string ISO
      const rows = await BatchesDB.getExpiring(task.tenantId, daysAhead);
      return rows.map((b) => {
        const expiryMs = new Date(b.expiryDate).getTime();
        return {
          batchId: b.id,
          productId: b.productId ?? null,
          productName: b.productName,
          category: b.productCategory,
          quantity: b.quantity,
          expiryDate: b.expiryDate,
          daysUntilExpiry: Math.ceil(
            (expiryMs - Date.now()) / (1000 * 60 * 60 * 24),
          ),
        };
      });
    },
  );

  const expired = batches.filter((b) => b.daysUntilExpiry <= 0);
  const expiringSoon = batches.filter(
    (b) => b.daysUntilExpiry > 0 && b.daysUntilExpiry <= 7,
  );
  const expiringLater = batches.filter((b) => b.daysUntilExpiry > 7);

  // ── Subtask delegation: notify about expired/expiring batches ─────────
  const subtasks: AgentResult["subtasks"] = [];
  if (expired.length > 0) {
    subtasks.push({
      domain: "notifications",
      action: "send-expiry-warning",
      payload: {
        type: "expired",
        count: expired.length,
        products: expired.slice(0, 10).map((b) => b.productName),
      },
      priority: "high",
    });
  }
  if (expiringSoon.length > 0) {
    subtasks.push({
      domain: "notifications",
      action: "send-expiry-warning",
      payload: {
        type: "expiring-soon",
        count: expiringSoon.length,
        daysAhead: 7,
        products: expiringSoon.slice(0, 10).map((b) => ({
          name: b.productName,
          daysLeft: b.daysUntilExpiry,
        })),
      },
      priority: "normal",
    });
  }

  return {
    success: true,
    data: {
      daysAhead,
      totalBatches: batches.length,
      expired: { count: expired.length, items: expired },
      expiringSoon: { count: expiringSoon.length, items: expiringSoon },
      expiringLater: { count: expiringLater.length, items: expiringLater },
    },
    ...(subtasks.length > 0 && { subtasks }),
  };
}

async function reorderSuggestions(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);

  log.info("Generating reorder suggestions", { action: task.action });

  const leadTimeDays = (task.payload.leadTimeDays as number) ?? 3;

  const lowStockProducts = await cache.getOrSet(
    "inventory:low-stock-products",
    120,
    () => AutoReorderDB.getLowStockProducts(task.tenantId),
  );

  // Estimate daily sales velocity from recent movements
  const movements = await InventoryMovementsDB.getAll(task.tenantId, 500);
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const salesByProduct = new Map<number, number>();
  for (const m of movements) {
    if (
      ["venta", "venta_online"].includes(m.type) &&
      new Date(m.createdAt).getTime() >= thirtyDaysAgo
    ) {
      salesByProduct.set(
        m.productId,
        (salesByProduct.get(m.productId) ?? 0) + m.quantity,
      );
    }
  }

  const suggestions = lowStockProducts.map((p) => {
    const totalSold = salesByProduct.get(p.id) ?? 0;
    const dailyVelocity = totalSold / 30;
    const safetyStock = Math.ceil(dailyVelocity * leadTimeDays);
    const suggestedOrder = Math.max(p.stockMax - p.stock, safetyStock);

    return {
      id: p.id,
      name: p.name,
      currentStock: p.stock,
      stockMin: p.stockMin,
      stockMax: p.stockMax,
      dailyVelocity: Math.round(dailyVelocity * 100) / 100,
      safetyStock,
      suggestedOrder: Math.max(suggestedOrder, 1),
      category: p.category,
      unit: p.unit,
      urgency:
        p.stock <= 0
          ? "critical"
          : p.stock <= p.stockMin / 2
            ? "high"
            : "normal",
    };
  });

  // Sort by urgency
  const urgencyRank = { critical: 0, high: 1, normal: 2 };
  suggestions.sort(
    (a, b) =>
      urgencyRank[a.urgency as keyof typeof urgencyRank] -
      urgencyRank[b.urgency as keyof typeof urgencyRank],
  );

  return {
    success: true,
    data: {
      leadTimeDays,
      totalSuggestions: suggestions.length,
      suggestions,
    },
  };
}

async function stockValuation(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);

  log.info("Calculating stock valuation", { action: task.action });

  const products = await cache.getOrSet("inventory:all-products", 120, () =>
    ProductsDB.getAll(),
  );

  const activeWithStock = products.filter(
    (p) => p.active && p.stock != null && p.stock > 0,
  );

  let totalCostValue = 0;
  let totalSaleValue = 0;
  const byCategory: Record<
    string,
    { costValue: number; saleValue: number; items: number }
  > = {};

  for (const p of activeWithStock) {
    const costPrice = p.costPrice ?? p.price * 0.7; // Estimate 30% margin if no cost
    const costVal = costPrice * p.stock!;
    const saleVal = p.price * p.stock!;

    totalCostValue += costVal;
    totalSaleValue += saleVal;

    if (!byCategory[p.category]) {
      byCategory[p.category] = { costValue: 0, saleValue: 0, items: 0 };
    }
    byCategory[p.category].costValue += costVal;
    byCategory[p.category].saleValue += saleVal;
    byCategory[p.category].items += 1;
  }

  return {
    success: true,
    data: {
      totalProducts: activeWithStock.length,
      totalCostValue: Math.round(totalCostValue * 100) / 100,
      totalSaleValue: Math.round(totalSaleValue * 100) / 100,
      potentialProfit:
        Math.round((totalSaleValue - totalCostValue) * 100) / 100,
      byCategory: Object.entries(byCategory).map(([cat, vals]) => ({
        category: cat,
        costValue: Math.round(vals.costValue * 100) / 100,
        saleValue: Math.round(vals.saleValue * 100) / 100,
        items: vals.items,
      })),
    },
  };
}

async function movementSummary(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);

  log.info("Summarizing inventory movements", { action: task.action });

  const from = task.payload.from as string | undefined;
  const to = task.payload.to as string | undefined;

  const allMovements = await InventoryMovementsDB.getAll(task.tenantId, 1000);

  let filtered = allMovements;
  if (from) {
    const fromDate = new Date(from).getTime();
    filtered = filtered.filter(
      (m) => new Date(m.createdAt).getTime() >= fromDate,
    );
  }
  if (to) {
    const toDate = new Date(to).getTime();
    filtered = filtered.filter(
      (m) => new Date(m.createdAt).getTime() <= toDate,
    );
  }

  const byType: Record<string, { count: number; totalQuantity: number }> = {};
  for (const m of filtered) {
    if (!byType[m.type]) {
      byType[m.type] = { count: 0, totalQuantity: 0 };
    }
    byType[m.type].count += 1;
    byType[m.type].totalQuantity += m.quantity;
  }

  return {
    success: true,
    data: {
      dateRange: { from: from ?? "all", to: to ?? "all" },
      totalMovements: filtered.length,
      byType: Object.entries(byType).map(([type, vals]) => ({
        type,
        count: vals.count,
        totalQuantity: vals.totalQuantity,
      })),
    },
  };
}

// ── Agent definition ─────────────────────────────────────────────────────────

export const inventoryAgent: DomainAgent = {
  domain: "inventory",
  actions: [
    "check-stock",
    "fefo-audit",
    "reorder-suggestions",
    "stock-valuation",
    "movement-summary",
  ],
  description:
    "Gestiona inventario: niveles de stock, auditoria FEFO, sugerencias de reorden, valuacion y resumen de movimientos.",

  async execute(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    const log = scopedLogger(ctx);

    try {
      agentBus.emit("task:started", {
        taskId: task.id,
        domain: "inventory",
        tenantId: task.tenantId,
      });

      let result: AgentResult;

      switch (task.action) {
        case "check-stock":
          result = await checkStock(task, ctx);
          break;
        case "fefo-audit":
          result = await fefoAudit(task, ctx);
          break;
        case "reorder-suggestions":
          result = await reorderSuggestions(task, ctx);
          break;
        case "stock-valuation":
          result = await stockValuation(task, ctx);
          break;
        case "movement-summary":
          result = await movementSummary(task, ctx);
          break;
        default:
          result = {
            success: false,
            error: `Accion desconocida: ${task.action}`,
          };
      }

      agentBus.emit("task:completed", {
        taskId: task.id,
        domain: "inventory",
        success: result.success,
        tenantId: task.tenantId,
      });

      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);
      log.error("Inventory agent failed", {
        action: task.action,
        error: errorMessage,
      });

      agentBus.emit("task:failed", {
        taskId: task.id,
        domain: "inventory",
        error: errorMessage,
        tenantId: task.tenantId,
      });

      return { success: false, error: errorMessage };
    }
  },
};
