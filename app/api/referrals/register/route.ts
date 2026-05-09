import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ReferralsDB } from "@/lib/db/referrals.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

/**
 * POST /api/referrals/register
 *
 * Registra el vínculo referidor → referido y aplica cupón de bienvenida
 * al nuevo cliente (10% descuento en primera compra).
 *
 * Body: { referralCode: string, newCustomerId: string }
 * Auth: ninguna (endpoint público — llamado durante el registro del referee).
 *       El tenantId viene del header x-tenant-id inyectado por el middleware.
 *
 * Response: { success: boolean, message: string, couponCode?: string }
 */

const RegisterReferralSchema = z.object({
  referralCode: z.string().min(1).max(20).trim(),
  newCustomerId: z.string().min(6).max(30).trim(), // Customer.phone
});

export async function POST(req: NextRequest) {
  // Rate limit moderado — endpoint público, previene abuso
  const rl = applyRateLimit(req, "MODERATE", "referrals-register");
  if (rl) return rl;

  // 1. Validación Zod con safeParse
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const parsed = RegisterReferralSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // 2. Obtener tenantId desde header (inyectado por middleware)
  const tenantId = req.headers.get("x-tenant-id") ?? "main";

  const { referralCode, newCustomerId } = parsed.data;

  try {
    // 3. Buscar al referrer por código
    const referrer = await ReferralsDB.getCustomerByReferralCode(
      tenantId,
      referralCode,
    );

    if (!referrer) {
      return NextResponse.json(
        { success: false, message: "Código de referido no válido" },
        { status: 400 },
      );
    }

    // 4. Registrar vínculo y crear cupón de bienvenida para el referee
    const result = await ReferralsDB.registerReferral(
      tenantId,
      referrer.phone,
      newCustomerId,
    );

    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: 409 });
    }

    // 5. Log fire-and-forget
    logActivity(
      "referral_register",
      "Referral",
      `Nuevo referee ${newCustomerId} registrado con código ${referralCode} de ${referrer.phone}`,
      newCustomerId,
      "system",
      undefined,
      tenantId,
    ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    return NextResponse.json({
      success: true,
      message: result.message,
      couponCode: result.couponCode,
    });
  } catch (err) {
    logger.error("[referrals/register] Error inesperado", {
      tenantId,
      newCustomerId,
      referralCode,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Error interno al registrar referido" },
      { status: 500 },
    );
  }
}
