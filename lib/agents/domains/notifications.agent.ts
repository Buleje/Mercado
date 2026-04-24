/**
 * lib/agents/domains/notifications.agent.ts
 *
 * Domain agent for notification operations: order updates, stock alerts,
 * expiry warnings, promotional messages, and pending digest checks.
 */

import type { DomainAgent, AgentTask, AgentResult, AgentContext } from "@/lib/agents/types";
import { scopedLogger, scopedCache } from "@/lib/agents/context";
import { agentBus } from "@/lib/agents/bus";
import {
  NotificationLogsDB,
  OrdersDB,
  CustomersDB,
  AutoReorderDB,
  PromotionsDB,
} from "@/lib/db";
import { BatchesDB } from "@/lib/db/batches.db";

// ── Action handlers ──────────────────────────────────────────────────────────

async function sendOrderUpdate(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);

  log.info("Sending order update notification", { action: task.action });

  const orderId = task.payload.orderId as string | undefined;
  const newStatus = task.payload.status as string | undefined;

  if (!orderId || !newStatus) {
    return {
      success: false,
      error: "Se requieren 'orderId' y 'status'",
    };
  }

  // Scope to the task's tenant — prevents cross-tenant notifications (HOTFIX-002)
  const order = await OrdersDB.getById(task.tenantId, orderId);
  if (!order) {
    return { success: false, error: `Pedido no encontrado: ${orderId}` };
  }

  const statusMessages: Record<string, string> = {
    confirmado: `Tu pedido #${orderId.slice(-6)} ha sido confirmado.`,
    en_camino: `Tu pedido #${orderId.slice(-6)} esta en camino.`,
    entregado: `Tu pedido #${orderId.slice(-6)} ha sido entregado. Gracias por tu compra!`,
    cancelado: `Tu pedido #${orderId.slice(-6)} ha sido cancelado. Contáctanos si tienes dudas.`,
  };

  const message =
    statusMessages[newStatus] ??
    `Tu pedido #${orderId.slice(-6)} cambio a estado: ${newStatus}`;

  const recipient = order.customer.phone ?? "sin_telefono";

  // Log the notification
  await NotificationLogsDB.add({
    type: "order_update",
    recipient,
    message,
    status: "sent",
    orderId,
  }, task.tenantId).catch(() => {});

  log.info("Order update notification sent", {
    orderId,
    recipient,
    newStatus,
  });

  return {
    success: true,
    data: {
      orderId,
      recipient,
      status: newStatus,
      message,
      sentAt: new Date().toISOString(),
    },
  };
}

async function sendStockAlert(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);

  log.info("Sending stock alert", { action: task.action });

  const lowStockProducts = await AutoReorderDB.getLowStockProducts(task.tenantId);

  if (lowStockProducts.length === 0) {
    return {
      success: true,
      data: {
        alertsSent: 0,
        message: "No hay productos con stock bajo",
      },
    };
  }

  const criticalItems = lowStockProducts.filter((p) => p.stock <= 0);
  const lowItems = lowStockProducts.filter((p) => p.stock > 0);

  const alertMessage = [
    `Alerta de Stock -- ${new Date().toLocaleDateString("es-PE")}`,
    criticalItems.length > 0
      ? `SIN STOCK (${criticalItems.length}): ${criticalItems.map((p) => p.name).join(", ")}`
      : null,
    lowItems.length > 0
      ? `STOCK BAJO (${lowItems.length}): ${lowItems.map((p) => `${p.name} (${p.stock}/${p.stockMin})`).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  // Log as admin notification
  await NotificationLogsDB.add({
    type: "stock_alert",
    recipient: "admin",
    message: alertMessage,
    status: "sent",
  }, task.tenantId).catch(() => {});

  agentBus.emit("agent:alert", {
    domain: "notifications",
    level: criticalItems.length > 0 ? "critical" : "warn",
    message: alertMessage,
    data: {
      criticalCount: criticalItems.length,
      lowCount: lowItems.length,
    },
  });

  return {
    success: true,
    data: {
      alertsSent: 1,
      criticalCount: criticalItems.length,
      lowStockCount: lowItems.length,
      products: lowStockProducts.map((p) => ({
        id: p.id,
        name: p.name,
        stock: p.stock,
        stockMin: p.stockMin,
      })),
    },
  };
}

async function sendExpiryWarning(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);

  log.info("Sending expiry warnings", { action: task.action });

  const daysAhead = (task.payload.daysAhead as number) ?? 7;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);

  const expiringBatches = await BatchesDB.getExpiring(task.tenantId, daysAhead);

  if (expiringBatches.length === 0) {
    return {
      success: true,
      data: {
        alertsSent: 0,
        message: `No hay productos por vencer en los proximos ${daysAhead} dias`,
      },
    };
  }

  // expiryDate viene como ISO string desde DbBatch — convertir a timestamp
  const expired = expiringBatches.filter(
    (b) => new Date(b.expiryDate).getTime() <= Date.now(),
  );
  const expiringSoon = expiringBatches.filter(
    (b) => new Date(b.expiryDate).getTime() > Date.now(),
  );

  const warningMessage = [
    `Alerta de Vencimiento -- ${new Date().toLocaleDateString("es-PE")}`,
    expired.length > 0
      ? `VENCIDOS (${expired.length}): ${expired.map((b) => `${b.product?.name ?? b.productName} (${b.quantity} uds)`).join(", ")}`
      : null,
    expiringSoon.length > 0
      ? `POR VENCER (${expiringSoon.length}): ${expiringSoon.map((b) => `${b.product?.name ?? b.productName} vence ${new Date(b.expiryDate).toLocaleDateString("es-PE")}`).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  await NotificationLogsDB.add({
    type: "expiry_warning",
    recipient: "admin",
    message: warningMessage,
    status: "sent",
  }, task.tenantId).catch(() => {});

  agentBus.emit("agent:alert", {
    domain: "notifications",
    level: expired.length > 0 ? "critical" : "warn",
    message: warningMessage,
  });

  return {
    success: true,
    data: {
      alertsSent: 1,
      daysAhead,
      expiredCount: expired.length,
      expiringSoonCount: expiringSoon.length,
      batches: expiringBatches.map((b) => ({
        batchId: b.id,
        productId: b.product?.id ?? b.productId,
        productName: b.product?.name ?? b.productName,
        quantity: b.quantity,
        expiryDate: b.expiryDate, // ya es ISO string
      })),
    },
  };
}

async function sendPromotion(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);

  log.info("Sending promotional notification", { action: task.action });

  const promoId = task.payload.promoId as string | undefined;
  const segment = task.payload.segment as string | undefined;

  if (!promoId) {
    return { success: false, error: "Se requiere 'promoId'" };
  }

  const allPromos = await PromotionsDB.getAll(task.tenantId);
  const promo = allPromos.find((p) => p.id === promoId);
  if (!promo) {
    return {
      success: false,
      error: `Promocion no encontrada: ${promoId}`,
    };
  }

  // Determine target customers
  let recipients: Array<{ phone: string; name: string }> = [];

  if (promo.targetType === "all" || !segment) {
    const customers = await CustomersDB.getAll(task.tenantId);
    recipients = customers
      .filter((c) => c.notifPromotions)
      .map((c) => ({ phone: c.phone, name: c.name }));
  } else if (promo.targetPhones) {
    const phones = promo.targetPhones.split(",").map((p) => p.trim());
    recipients = phones.map((phone) => ({ phone, name: phone }));
  }

  const message =
    promo.message ??
    `${promo.name}: ${promo.description}. ${promo.discountPercent}% de descuento!`;

  // Log notifications (fire-and-forget)
  for (const r of recipients) {
    NotificationLogsDB.add({
      type: "promotion",
      recipient: r.phone,
      message,
      status: "sent",
    }, task.tenantId).catch(() => {});
  }

  log.info("Promotional notifications queued", {
    promoId,
    recipientCount: recipients.length,
  });

  return {
    success: true,
    data: {
      promoId,
      promoName: promo.name,
      message,
      recipientCount: recipients.length,
      sentAt: new Date().toISOString(),
    },
  };
}

async function digestPending(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);

  log.info("Checking pending digest notifications", {
    action: task.action,
  });

  const [recentLogs, lowStock] = await Promise.all([
    cache.getOrSet("notifications:recent-logs", 60, () =>
      NotificationLogsDB.getAll(task.tenantId),
    ),
    AutoReorderDB.getLowStockProducts(task.tenantId),
  ]);

  // Check for unsent notifications in the last 24h
  const last24h = Date.now() - 24 * 60 * 60 * 1000;
  const recentNotifications = recentLogs.filter(
    (n) => new Date(n.createdAt).getTime() >= last24h,
  );

  const pendingActions: Array<{
    type: string;
    description: string;
    priority: string;
  }> = [];

  // Stock alerts needed?
  if (lowStock.length > 0) {
    const lastStockAlert = recentNotifications.find(
      (n) => n.type === "stock_alert",
    );
    if (!lastStockAlert) {
      pendingActions.push({
        type: "stock_alert",
        description: `${lowStock.length} productos con stock bajo sin alertar`,
        priority: lowStock.some((p) => p.stock <= 0)
          ? "critical"
          : "high",
      });
    }
  }

  // Pending orders without notification?
  const pendingOrders = await OrdersDB.getAllFiltered({
    status: "pendiente",
    tenantId: task.tenantId,
  });
  if (pendingOrders.length > 3) {
    pendingActions.push({
      type: "pending_orders",
      description: `${pendingOrders.length} pedidos pendientes acumulados`,
      priority: pendingOrders.length > 10 ? "critical" : "normal",
    });
  }

  return {
    success: true,
    data: {
      recentNotificationsCount: recentNotifications.length,
      pendingActions,
      hasPendingDigest: pendingActions.length > 0,
      summary: {
        byType: recentNotifications.reduce(
          (acc, n) => {
            acc[n.type] = (acc[n.type] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
    },
  };
}

// ── Agent definition ─────────────────────────────────────────────────────────

export const notificationsAgent: DomainAgent = {
  domain: "notifications",
  actions: [
    "send-order-update",
    "send-stock-alert",
    "send-expiry-warning",
    "send-promotion",
    "digest-pending",
  ],
  description:
    "Gestiona notificaciones: actualizaciones de pedidos, alertas de stock, avisos de vencimiento, promociones y resumen de pendientes.",

  async execute(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    const log = scopedLogger(ctx);

    try {
      agentBus.emit("task:started", {
        taskId: task.id,
        domain: "notifications",
        tenantId: task.tenantId,
      });

      let result: AgentResult;

      switch (task.action) {
        case "send-order-update":
          result = await sendOrderUpdate(task, ctx);
          break;
        case "send-stock-alert":
          result = await sendStockAlert(task, ctx);
          break;
        case "send-expiry-warning":
          result = await sendExpiryWarning(task, ctx);
          break;
        case "send-promotion":
          result = await sendPromotion(task, ctx);
          break;
        case "digest-pending":
          result = await digestPending(task, ctx);
          break;
        default:
          result = {
            success: false,
            error: `Accion desconocida: ${task.action}`,
          };
      }

      agentBus.emit("task:completed", {
        taskId: task.id,
        domain: "notifications",
        success: result.success,
        tenantId: task.tenantId,
      });

      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);
      log.error("Notifications agent failed", {
        action: task.action,
        error: errorMessage,
      });

      agentBus.emit("task:failed", {
        taskId: task.id,
        domain: "notifications",
        error: errorMessage,
        tenantId: task.tenantId,
      });

      return { success: false, error: errorMessage };
    }
  },
};
