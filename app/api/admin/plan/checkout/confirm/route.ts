import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * POST /api/admin/plan/checkout/confirm
 *
 * Confirma una solicitud manual de upgrade de plan (Yape/Plin/transferencia/
 * efectivo) que requiere coordinación por WhatsApp. NO procesa pagos Stripe —
 * para Stripe se usa `/api/billing/checkout` + webhook.
 *
 * SECURITY (Bug Hunter Report 2026-04-30):
 * - Antes este endpoint era un mock SIN auth — vector de fraude social.
 * - Ahora requiere `requireAdmin` y rechaza `method=stripe` para forzar
 *   el flujo de webhook validado.
 * - El endpoint NO activa el plan en DB — solo registra la solicitud manual
 *   en activity log. La activación efectiva la hace:
 *     · Stripe → webhook `/api/billing/webhook` (case checkout.session.completed)
 *     · Yape/Plin/transferencia/cash → equipo soporte vía panel superadmin.
 */

const bodySchema = z.object({
  plan: z.enum(["pro", "business", "enterprise"]),
  method: z.enum(["yape", "plin", "transfer", "cash"]),
  // Comprobante opcional: voucher Yape/Plin (URL imagen) o referencia transferencia.
  reference: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-plan-checkout-confirm"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  // 1. Auth obligatoria — solo el admin del tenant puede solicitar upgrade.
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  // 2. Validar body.
  const json = await req.json().catch((err) => {
    logger.warn("[plan/checkout/confirm] body parse failed", { err: String(err) });
    return null;
  });
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { plan, method, reference } = parsed.data;

  // 3. Registrar la solicitud en activity log para que soporte la procese.
  //    El plan NO se activa acá — soporte valida el voucher y activa via
  //    el panel de superadmin (que dispara el cambio de plan en DB).
  logActivity(
    "plan_upgrade_requested",
    "tenant",
    `Solicitud upgrade plan="${plan}" method="${method}"${reference ? ` ref="${reference}"` : ""}`,
    auth.tenantId,
    "admin",
    undefined,
    auth.tenantId,
  ).catch((err) => {
    logger.warn("[plan/checkout/confirm] logActivity failed", {
      tenantId: auth.tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
  });

  return NextResponse.json({
    ok: true,
    plan,
    method,
    requestedAt: new Date().toISOString(),
    status: "pending_manual_review",
    note: "Solicitud recibida. Coordinamos contigo por WhatsApp para validar el pago y activar el plan.",
  });
}
