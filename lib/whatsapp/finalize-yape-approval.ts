import "server-only";

import { PaymentApprovalDb } from "@/lib/db/payment-approval.db";
import { OrderPaymentLinkDb } from "@/lib/db/order-payment-link.db";
import { OrdersDB } from "@/lib/db/orders.db";
import { notifyYapeApproved } from "@/lib/whatsapp/notify-yape-result";
import { logger } from "@/lib/logger";

/**
 * Cierre del loop de aprobación de un pago Yape — single source compartido por
 * la aprobación MANUAL (route superadmin) y la AUTO (webhook yape-capture):
 *   1. Transición atómica PaymentApproval → 'approved' (idempotente).
 *   2. Cada Order linkeado (multi-vendor) → 'confirmado' vía OrdersDB (state
 *      machine + audit, danger zone). Fallos no revierten la aprobación.
 *   3. Notifica al cliente por WhatsApp (fire-and-forget).
 *
 * El caller decide el `reviewer` ("auto" para auto-aprobación, o el username
 * del superadmin). Para preservar el actor en el audit log, envolver con
 * runWithAuditContext / withAuditContext antes de llamar.
 */
export interface FinalizeYapeResult {
  /** false si la approval no existe. */
  found: boolean;
  /** false si otra aprobación/click ya la finalizó (no hubo side-effects). */
  transitioned: boolean;
  /** Estado actual cuando no se pudo transicionar (para el mensaje 409). */
  finalStatus?: string;
  ordersUpdated: number;
  ordersTotal: number;
  customerNotified: boolean;
}

export async function finalizeYapeApproval(
  id: string,
  reviewer: string,
): Promise<FinalizeYapeResult> {
  const approval = await PaymentApprovalDb.getById(id);
  if (!approval) {
    return { found: false, transitioned: false, ordersUpdated: 0, ordersTotal: 0, customerNotified: false };
  }

  // ── 1. Transición atómica (idempotente vía WHERE status IN pending/review) ──
  const transitioned = await PaymentApprovalDb.approve(id, reviewer);
  if (!transitioned) {
    const fresh = await PaymentApprovalDb.getById(id);
    return {
      found: true,
      transitioned: false,
      finalStatus: fresh?.status,
      ordersUpdated: 0,
      ordersTotal: 0,
      customerNotified: false,
    };
  }

  // ── 2. Transición de cada Order linkeado a "confirmado" ─────────────────────
  const linked = await OrderPaymentLinkDb.findByApprovalId(id);
  let ordersUpdated = 0;
  const storeNames: string[] = [];

  for (const order of linked) {
    if (order.status === "confirmado" || order.status === "entregado") {
      ordersUpdated++;
      if (order.storeName) storeNames.push(order.storeName);
      continue;
    }
    try {
      const updated = await OrdersDB.update(order.tenantId, order.id, { status: "confirmado" });
      if (updated) {
        ordersUpdated++;
        if (order.storeName) storeNames.push(order.storeName);
      }
    } catch (err) {
      logger.error("[finalize-yape-approval] order update failed", {
        approvalId: id,
        orderId: order.id,
        tenantId: order.tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── 3. Notificar al cliente (fire-and-forget) ───────────────────────────────
  let customerNotified = false;
  if (linked.length > 0 && approval.customerPhone) {
    customerNotified = await notifyYapeApproved({
      customerPhone: approval.customerPhone,
      orderIds: linked.map((o) => o.id),
      totalAmount: approval.expectedAmount,
      storeNames,
    });
  } else if (linked.length === 0) {
    logger.warn("[finalize-yape-approval] no orders linked — customer NOT notified", {
      approvalId: id,
      customerPhone: approval.customerPhone.slice(-6),
    });
  }

  logger.info("[finalize-yape-approval] ok", {
    approvalId: id,
    reviewer,
    customerPhone: approval.customerPhone.slice(-6),
    ordersUpdated,
    ordersTotal: linked.length,
    customerNotified,
  });

  return {
    found: true,
    transitioned: true,
    ordersUpdated,
    ordersTotal: linked.length,
    customerNotified,
  };
}
