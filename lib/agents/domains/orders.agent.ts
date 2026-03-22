/**
 * lib/agents/domains/orders.agent.ts
 *
 * Domain agent for order operations: pending summaries, delivery scheduling,
 * returns analysis, status overviews, and daily sales reports.
 */

import type { DomainAgent, AgentTask, AgentResult, AgentContext } from "@/lib/agents/types";
import { scopedLogger, scopedCache } from "@/lib/agents/context";
import { agentBus } from "@/lib/agents/bus";
import {
  OrdersDB,
  DeliverySlotsDB,
  ReturnsDB,
  SalesDB,
} from "@/lib/db";

// ── Action handlers ──────────────────────────────────────────────────────────

async function pendingSummary(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);

  log.info("Generating pending orders summary", { action: task.action });

  const orders = await cache.getOrSet("orders:pending", 60, () =>
    OrdersDB.getAllFiltered({ status: "pendiente,confirmado" }),
  );

  const totalAmount = orders.reduce((sum, o) => sum + o.total, 0);

  const byStatus: Record<string, { count: number; total: number }> = {};
  for (const o of orders) {
    if (!byStatus[o.status]) {
      byStatus[o.status] = { count: 0, total: 0 };
    }
    byStatus[o.status].count += 1;
    byStatus[o.status].total += o.total;
  }

  return {
    success: true,
    data: {
      totalPending: orders.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      byStatus,
      orders: orders.slice(0, 20).map((o) => ({
        id: o.id,
        customer: o.customer.name,
        total: o.total,
        status: o.status,
        items: o.items.length,
        createdAt: o.createdAt,
      })),
    },
  };
}

async function deliverySchedule(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);

  log.info("Organizing delivery schedule", { action: task.action });

  const date =
    (task.payload.date as string) ?? new Date().toISOString().split("T")[0];

  const slots = await DeliverySlotsDB.getByDate(date);

  // Enrich with order data
  const enrichedSlots = await Promise.all(
    slots.map(async (slot) => {
      const order = await OrdersDB.getById(slot.orderId);
      return {
        slotId: slot.id,
        orderId: slot.orderId,
        date: slot.date,
        slot: slot.slot,
        notes: slot.notes,
        customer: order
          ? {
              name: order.customer.name,
              phone: order.customer.phone,
              location: order.customer.location,
            }
          : null,
        orderTotal: order?.total ?? 0,
        orderStatus: order?.status ?? "desconocido",
        itemCount: order?.items.length ?? 0,
      };
    }),
  );

  // Group by time slot
  const bySlot: Record<string, typeof enrichedSlots> = {};
  for (const s of enrichedSlots) {
    if (!bySlot[s.slot]) bySlot[s.slot] = [];
    bySlot[s.slot].push(s);
  }

  return {
    success: true,
    data: {
      date,
      totalDeliveries: enrichedSlots.length,
      bySlot,
    },
  };
}

async function returnsAnalysis(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);

  log.info("Analyzing returns", { action: task.action });

  const returns = await cache.getOrSet("orders:returns-all", 120, () =>
    ReturnsDB.getAll(),
  );

  const totalReturns = returns.length;
  const totalValue = returns.reduce((sum, r) => sum + r.total, 0);

  // Analyze by reason
  const byReason: Record<string, { count: number; total: number }> = {};
  for (const r of returns) {
    const reason = r.reason || "sin_razon";
    if (!byReason[reason]) byReason[reason] = { count: 0, total: 0 };
    byReason[reason].count += 1;
    byReason[reason].total += r.total;
  }

  // Analyze by product
  const byProduct: Record<
    number,
    { name: string; count: number; totalQuantity: number }
  > = {};
  for (const r of returns) {
    for (const item of r.items) {
      if (!byProduct[item.productId]) {
        byProduct[item.productId] = {
          name: item.name,
          count: 0,
          totalQuantity: 0,
        };
      }
      byProduct[item.productId].count += 1;
      byProduct[item.productId].totalQuantity += item.quantity;
    }
  }

  const topReturnedProducts = Object.entries(byProduct)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([productId, data]) => ({ productId: Number(productId), ...data }));

  return {
    success: true,
    data: {
      totalReturns,
      totalValue: Math.round(totalValue * 100) / 100,
      creditApplied: returns.filter((r) => r.creditApplied).length,
      byReason: Object.entries(byReason).map(([reason, vals]) => ({
        reason,
        count: vals.count,
        total: Math.round(vals.total * 100) / 100,
      })),
      topReturnedProducts,
    },
  };
}

async function statusOverview(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);

  log.info("Generating status overview", { action: task.action });

  const orders = await cache.getOrSet("orders:all-recent", 60, () =>
    OrdersDB.getAllFiltered({
      since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  );

  const byStatus: Record<
    string,
    { count: number; totalAmount: number }
  > = {};
  for (const o of orders) {
    if (!byStatus[o.status]) {
      byStatus[o.status] = { count: 0, totalAmount: 0 };
    }
    byStatus[o.status].count += 1;
    byStatus[o.status].totalAmount += o.total;
  }

  return {
    success: true,
    data: {
      period: "last_7_days",
      totalOrders: orders.length,
      byStatus: Object.entries(byStatus).map(([status, vals]) => ({
        status,
        count: vals.count,
        totalAmount: Math.round(vals.totalAmount * 100) / 100,
      })),
    },
  };
}

async function dailySalesReport(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);

  log.info("Generating daily sales report", { action: task.action });

  const todayStr =
    (task.payload.date as string) ?? new Date().toISOString().split("T")[0];
  const todayStart = new Date(`${todayStr}T00:00:00.000Z`);

  // Orders completed today
  const orders = await OrdersDB.getAllFiltered({
    status: "entregado",
    since: todayStart.toISOString(),
  });

  // POS sales today
  const allSales = await SalesDB.getAll();
  const todaySales = allSales.filter(
    (s) => new Date(s.createdAt).toISOString().split("T")[0] === todayStr,
  );

  const orderRevenue = orders.reduce((sum, o) => sum + o.total, 0);
  const posRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
  const totalRevenue = orderRevenue + posRevenue;

  // Payment method breakdown from POS
  const byPayment: Record<string, number> = {};
  for (const s of todaySales) {
    byPayment[s.payment] = (byPayment[s.payment] ?? 0) + s.total;
  }

  return {
    success: true,
    data: {
      date: todayStr,
      deliveryOrders: {
        count: orders.length,
        revenue: Math.round(orderRevenue * 100) / 100,
      },
      posSales: {
        count: todaySales.length,
        revenue: Math.round(posRevenue * 100) / 100,
      },
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalTransactions: orders.length + todaySales.length,
      paymentBreakdown: Object.entries(byPayment).map(
        ([method, total]) => ({
          method,
          total: Math.round(total * 100) / 100,
        }),
      ),
    },
  };
}

// ── Agent definition ─────────────────────────────────────────────────────────

export const ordersAgent: DomainAgent = {
  domain: "orders",
  actions: [
    "pending-summary",
    "delivery-schedule",
    "returns-analysis",
    "status-overview",
    "daily-sales-report",
  ],
  description:
    "Gestiona pedidos: resumen de pendientes, programacion de entregas, analisis de devoluciones, estado general y reporte diario de ventas.",

  async execute(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    const log = scopedLogger(ctx);

    try {
      agentBus.emit("task:started", {
        taskId: task.id,
        domain: "orders",
        tenantId: task.tenantId,
      });

      let result: AgentResult;

      switch (task.action) {
        case "pending-summary":
          result = await pendingSummary(task, ctx);
          break;
        case "delivery-schedule":
          result = await deliverySchedule(task, ctx);
          break;
        case "returns-analysis":
          result = await returnsAnalysis(task, ctx);
          break;
        case "status-overview":
          result = await statusOverview(task, ctx);
          break;
        case "daily-sales-report":
          result = await dailySalesReport(task, ctx);
          break;
        default:
          result = {
            success: false,
            error: `Accion desconocida: ${task.action}`,
          };
      }

      agentBus.emit("task:completed", {
        taskId: task.id,
        domain: "orders",
        success: result.success,
        tenantId: task.tenantId,
      });

      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);
      log.error("Orders agent failed", {
        action: task.action,
        error: errorMessage,
      });

      agentBus.emit("task:failed", {
        taskId: task.id,
        domain: "orders",
        error: errorMessage,
        tenantId: task.tenantId,
      });

      return { success: false, error: errorMessage };
    }
  },
};
