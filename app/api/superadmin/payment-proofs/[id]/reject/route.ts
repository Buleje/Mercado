import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PaymentProofsDB } from "@/lib/db/payment-proofs.db";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * POST /api/superadmin/payment-proofs/[id]/reject
 *
 * Body: { reason: string }
 *
 * Marca como rechazado y notifica al cliente vía WhatsApp con el motivo.
 */
const BodySchema = z.object({
  reason: z.string().min(5).max(400),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "STRICT", "superadmin-payment-proofs-X-reject"); if (_rl) return _rl;
  // Defense-in-depth: validar sesion superadmin independiente del middleware
  const _auth = await requirePlatformAPI(req);
  if (_auth instanceof NextResponse) return _auth;
  const platformUser = _auth.username;
  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Motivo de rechazo requerido (min 5 chars)" }, { status: 400 });
  }

  const proof = await PaymentProofsDB.getById(id);
  if (!proof) {
    return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
  }
  if (proof.status !== "pending") {
    return NextResponse.json({ error: `Pago ya está ${proof.status}` }, { status: 409 });
  }

  try {
    await PaymentProofsDB.reject(id, platformUser, parsed.data.reason);
  } catch (err) {
    logger.error("[payment-proof/reject] failed", { error: String(err), proofId: id });
    return NextResponse.json({ error: "Error al rechazar" }, { status: 500 });
  }

  // WhatsApp informativo
  const msg = [
    `⚠️ Hola ${proof.ownerName},`,
    "",
    `No pudimos aprobar el pago de tu tienda *${proof.storeName}*.`,
    "",
    `*Motivo:* ${parsed.data.reason}`,
    "",
    `Volvé a subir el comprobante o respondé este WhatsApp si necesitás ayuda.`,
  ].join("\n");

  sendWhatsAppQueued(proof.ownerPhone, msg, {
    tenantId: "__platform__",
    context: `payment-rejection-${id}`,
  }).catch((err) => logger.warn("[payment-proof/reject] whatsapp failed", { error: String(err), proofId: id }));

  return NextResponse.json({ ok: true });
}
