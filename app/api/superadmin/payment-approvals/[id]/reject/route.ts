import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { PaymentApprovalDb } from "@/lib/db/payment-approval.db";
import { OrderPaymentLinkDb } from "@/lib/db/order-payment-link.db";
import { OrdersDB } from "@/lib/db/orders.db";
import { notifyYapeRejected } from "@/lib/whatsapp/notify-yape-result";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { runWithAuditContext } from "@/lib/audit/audit-context";

// Next 16 cacheComponents-compatible: handler es dinámico por naturaleza.

const BodySchema = z.object({
  reason: z.string().min(5).max(500),
});

/**
 * POST /api/superadmin/payment-approvals/[id]/reject
 *
 * Body: { reason: string (5-500 chars) }
 *
 * Rechaza el pago Yape, indica el motivo y cierra el loop:
 *   1. Marca PaymentApproval.status = 'rejected' + reason + reviewer.
 *   2. Transiciona cada Order linkeado a 'cancelado'.
 *   3. Notifica al cliente por WhatsApp con el motivo.
 *
 * Retorna { ok: true, ordersUpdated: number, customerNotified: boolean }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "STRICT", "superadmin-payment-approvals-X-reject"); if (_rl) return _rl;
  // P0 fix 2026-05-24: CSRF estricto — rechaza pago (notifica cliente)
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  // Round 10 M004: audit log captura superadmin actor + IP en escrituras
  // PaymentApproval rejected + Order cancelado.
  return runWithAuditContext(req, `superadmin:${auth.username}`, () =>
    handleReject(req, id, auth.username),
  );
}

async function handleReject(
  req: NextRequest,
  id: string,
  reviewerUsername: string,
): Promise<NextResponse> {
  const auth = { username: reviewerUsername };

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Motivo de rechazo requerido (mínimo 5 caracteres, máximo 500)" },
      { status: 400 },
    );
  }

  const approval = await PaymentApprovalDb.getById(id);
  if (!approval) {
    return NextResponse.json({ error: "Aprobación no encontrada" }, { status: 404 });
  }

  // ── 1. Mark approval as rejected (atomic transition) ────────────────────
  // Same atomic guard as /approve — UPDATE … WHERE status IN (pending,
  // review_required). Returns false when already finalized.
  let transitioned: boolean;
  try {
    transitioned = await PaymentApprovalDb.reject(id, auth.username, parsed.data.reason);
  } catch (err) {
    logger.error("[payment-approvals/reject] failed", {
      error: String(err),
      approvalId: id,
      reviewer: auth.username,
    });
    return NextResponse.json({ error: "Error al rechazar el pago" }, { status: 500 });
  }

  if (!transitioned) {
    const fresh = await PaymentApprovalDb.getById(id);
    return NextResponse.json(
      { error: `El pago ya está ${fresh?.status ?? "finalizado"}` },
      { status: 409 },
    );
  }

  // ── 2. Cancel each linked Order ──────────────────────────────────────────
  const linked = await OrderPaymentLinkDb.findByApprovalId(id);
  let ordersUpdated = 0;

  for (const order of linked) {
    if (order.status === "cancelado") {
      ordersUpdated++;
      continue;
    }
    try {
      const updated = await OrdersDB.update(order.tenantId, order.id, {
        status: "cancelado",
      });
      if (updated) ordersUpdated++;
    } catch (err) {
      logger.error("[payment-approvals/reject] order cancel failed", {
        approvalId: id,
        orderId: order.id,
        tenantId: order.tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── 3. Notify customer via WhatsApp (fire-and-forget) ───────────────────
  let customerNotified = false;
  if (approval.customerPhone) {
    customerNotified = await notifyYapeRejected({
      customerPhone: approval.customerPhone,
      reason: parsed.data.reason,
      expectedAmount: approval.expectedAmount,
    });
  }

  logger.info("[payment-approvals/reject] ok", {
    approvalId: id,
    reviewer: auth.username,
    customerPhone: approval.customerPhone.slice(-6),
    reason: parsed.data.reason,
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
