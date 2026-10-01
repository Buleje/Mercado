import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { finalizeYapeApproval } from "@/lib/whatsapp/finalize-yape-approval";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { runWithAuditContext } from "@/lib/audit/audit-context";

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
  // P0 fix 2026-05-24: CSRF estricto — aprueba dinero (Yape/Plin transfer)
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  // Round 10 M004: envolver TODO el handler para que las escrituras a Order
  // (state machine confirmado) y PaymentApproval queden con superadmin actor.
  return runWithAuditContext(req, `superadmin:${auth.username}`, () =>
    handleApprove(req, id, auth.username),
  );
}

async function handleApprove(
  _req: NextRequest,
  id: string,
  reviewerUsername: string,
): Promise<NextResponse> {
  // El pipeline (transición atómica + Orders + notificación) vive en
  // finalizeYapeApproval — single source compartido con la auto-aprobación.
  let result;
  try {
    result = await finalizeYapeApproval(id, reviewerUsername);
  } catch (err) {
    logger.error("[payment-approvals/approve] failed", {
      error: String(err),
      approvalId: id,
      reviewer: reviewerUsername,
    });
    return NextResponse.json({ error: "Error al aprobar el pago" }, { status: 500 });
  }

  if (!result.found) {
    return NextResponse.json({ error: "Aprobación no encontrada" }, { status: 404 });
  }
  if (!result.transitioned) {
    return NextResponse.json(
      { error: `El pago ya está ${result.finalStatus ?? "finalizado"}` },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    ordersUpdated: result.ordersUpdated,
    ordersTotal: result.ordersTotal,
    customerNotified: result.customerNotified,
  });
}
