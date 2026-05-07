import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { PaymentApprovalDb } from "@/lib/db/payment-approval.db";
import { OrderPaymentLinkDb } from "@/lib/db/order-payment-link.db";
import { OrdersDB } from "@/lib/db/orders.db";
import { notifyYapeApproved } from "@/lib/whatsapp/notify-yape-result";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// Next 16 cacheComponents-compatible: handler es dinámico por naturaleza.

/**
 * POST /api/superadmin/payment-approvals/[id]/approve
 *
 * Aprueba el pago Yape del pedido indicado y cierra el loop completo:
 *   1. Marca PaymentApproval.status = 'approved' con reviewer.
 *   2. Transiciona cada Order linkeado (multi-vendor: 1+ orders) a 'confirmado'.
 *   3. Notifica al cliente por WhatsApp (fire-and-forget).
 *
 * Las transiciones de Order van por OrdersDB.update() para preservar la
 * state machine + audit log de orders.db.ts (danger zone). El lookup
 * cross-tenant pasa por OrderPaymentLinkDb (read-only fuera del danger).
 *
 * Retorna { ok: true, ordersUpdated: number, customerNotified: boolean }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "STRICT", "superadmin-payment-approvals-X-approve"); if (_rl) return _rl;
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const approval = await PaymentApprovalDb.getById(id);
  if (!approval) {
    return NextResponse.json({ error: "Aprobación no encontrada" }, { status: 404 });
  }

  // ── 1. Mark approval as approved (atomic transition) ────────────────────
  // PaymentApprovalDb.approve() runs an UPDATE … WHERE status IN
  // ('pending','review_required'). It returns false when another reviewer
  // (or a duplicate click) already finalized this row. In that case we
  // STOP — no Order transitions, no customer notification — to avoid
  // double side-effects.
  let transitioned: boolean;
  try {
    transitioned = await PaymentApprovalDb.approve(id, auth.username);
  } catch (err) {
    logger.error("[payment-approvals/approve] failed", {
      error: String(err),
      approvalId: id,
      reviewer: auth.username,
    });
    return NextResponse.json({ error: "Error al aprobar el pago" }, { status: 500 });
  }

  if (!transitioned) {
    // Refresh to learn the actual final status for the 409 message.
    const fresh = await PaymentApprovalDb.getById(id);
    return NextResponse.json(
      { error: `El pago ya está ${fresh?.status ?? "finalizado"}` },
      { status: 409 },
    );
  }

  // ── 2. Transition each linked Order to "confirmado" ─────────────────────
  // Multi-vendor checkouts produce 1 Order per vendor — all share the same
  // paymentApprovalId. We move every one of them. Failures here do NOT roll
  // back the approval (Brandon manually retries from the dashboard).
  const linked = await OrderPaymentLinkDb.findByApprovalId(id);
  let ordersUpdated = 0;
  const storeNames: string[] = [];

  for (const order of linked) {
    if (order.status === "confirmado" || order.status === "entregado") {
      // Already advanced — skip without erroring
      ordersUpdated++;
      if (order.storeName) storeNames.push(order.storeName);
      continue;
    }
    try {
      const updated = await OrdersDB.update(order.tenantId, order.id, {
        status: "confirmado",
      });
      if (updated) {
        ordersUpdated++;
        if (order.storeName) storeNames.push(order.storeName);
      }
    } catch (err) {
      logger.error("[payment-approvals/approve] order update failed", {
        approvalId: id,
        orderId: order.id,
        tenantId: order.tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── 3. Notify customer via WhatsApp (fire-and-forget) ───────────────────
  let customerNotified = false;
  if (linked.length > 0 && approval.customerPhone) {
    customerNotified = await notifyYapeApproved({
      customerPhone: approval.customerPhone,
      orderIds: linked.map((o) => o.id),
      totalAmount: approval.expectedAmount,
      storeNames,
    });
  } else if (linked.length === 0) {
    // BUG-2 fix (audit 2026-05-02): silent skip used to be invisible.
    // Surface the case so we can investigate (race condition between
    // checkout creating the Orders and the approval being finalized).
    logger.warn("[payment-approvals/approve] no orders linked — customer NOT notified", {
      approvalId: id,
      customerPhone: approval.customerPhone.slice(-6),
    });
  }

  logger.info("[payment-approvals/approve] ok", {
    approvalId: id,
    reviewer: auth.username,
    customerPhone: approval.customerPhone.slice(-6),
    ordersUpdated,
    ordersTotal: linked.length,
    customerNotified,
  });

  return NextResponse.json({
    ok: true,
    ordersUpdated,
    ordersTotal: linked.length,
    customerNotified,
  });
}
