import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PaymentProofsDB } from "@/lib/db/payment-proofs.db";
import { findTenantBySlug, createTenant } from "@/lib/db/tenant-onboarding.db";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * POST /api/superadmin/payment-proofs/[id]/approve
 *
 * Auth: middleware ya validó la cookie buleje-platform-sess.
 * Inyecta `x-platform-user` con el username del superadmin.
 *
 * Flujo:
 *   1. Crea el Tenant si el slug no existe.
 *   2. Marca el PaymentProof como approved.
 *   3. Envía WhatsApp de bienvenida al ownerPhone.
 */
const BodySchema = z.object({
  whatsappMessage: z.string().min(10).max(800).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "STRICT", "superadmin-payment-proofs-X-approve"); if (_rl) return _rl;
  // P1-4: CSRF double-submit defense-in-depth (financial endpoint).
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  // Defense-in-depth: validar sesion superadmin independiente del middleware
  const _auth = await requirePlatformAPI(req);
  if (_auth instanceof NextResponse) return _auth;
  const platformUser = _auth.username;
  const { id } = await params;

  const proof = await PaymentProofsDB.getById(id);
  if (!proof) {
    return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
  }
  if (proof.status !== "pending") {
    return NextResponse.json({ error: `Pago ya está ${proof.status}` }, { status: 409 });
  }

  let body: unknown = {};
  try { body = await req.json(); } catch { body = {}; }
  const parsed = BodySchema.safeParse(body);
  const customMsg = parsed.success ? parsed.data.whatsappMessage : undefined;

  // 1) Crear tenant si no existe
  let tenantId: string;
  try {
    const existing = await findTenantBySlug(proof.tenantSlug);
    if (existing) {
      tenantId = existing.id;
    } else {
      // Mapeo: el id interno "basico" en plan-tiers.ts corresponde al
      // string "free" del campo Tenant.plan (legacy). Pro/business/enterprise
      // mapea 1-1; max → enterprise (el campo tenant.plan no soporta "max").
      const tenantPlan: "free" | "pro" | "business" | "enterprise" =
        proof.planTier === "basico" ? "free"
        : proof.planTier === "pro" ? "pro"
        : proof.planTier === "max" ? "enterprise"
        : "enterprise";
      const trialEnds = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30d default
      const created = await createTenant({
        slug: proof.tenantSlug,
        storeName: proof.storeName,
        ownerEmail: proof.ownerEmail ?? "",
        ownerPhone: proof.ownerPhone,
        plan: tenantPlan,
        type: "store",
        trialEndsAt: trialEnds,
      });
      tenantId = created.id;
    }
  } catch (err) {
    logger.error("[payment-proof/approve] tenant creation failed", { error: String(err), proofId: id });
    return NextResponse.json({ error: "No pudimos crear la tienda" }, { status: 500 });
  }

  // 2) Marcar como aprobado
  try {
    await PaymentProofsDB.approve(id, platformUser, tenantId);
  } catch (err) {
    logger.error("[payment-proof/approve] mark-approved failed", { error: String(err), proofId: id });
    return NextResponse.json({ error: "Error al aprobar" }, { status: 500 });
  }

  // 3) WhatsApp de bienvenida — fire-and-forget
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";
  const adminUrl = `${baseUrl}/admin/login`;
  const planLabel = proof.planTier === "basico" ? "Estándar" : proof.planTier;
  const defaultMsg = [
    `🎉 ¡Bienvenido a Buleje, ${proof.ownerName}!`,
    "",
    `Aprobamos tu pago y tu tienda *${proof.storeName}* ya está activa con el plan *${planLabel}*.`,
    "",
    `📲 Ingresá acá para configurar todo:`,
    adminUrl,
    "",
    `Cualquier duda, respondé este WhatsApp y te ayudamos.`,
  ].join("\n");

  sendWhatsAppQueued(proof.ownerPhone, customMsg ?? defaultMsg, {
    tenantId,
    context: `payment-approval-${id}`,
  })
    .then(() => PaymentProofsDB.markWhatsappSent(id))
    .catch((err) => logger.warn("[payment-proof/approve] whatsapp failed", { error: String(err), proofId: id }));

  return NextResponse.json({ ok: true, tenantId });
}
