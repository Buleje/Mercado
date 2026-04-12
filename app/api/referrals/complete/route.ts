import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeCompare } from "@/lib/timing-safe";
import { ReferralsDB } from "@/lib/db/referrals.db";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

/**
 * POST /api/referrals/complete
 *
 * Endpoint INTERNO — llamado cuando una Order llega al estado 'confirmado'
 * por primera vez para ese customer. Dispara el reward al referrer (cupón S/10).
 *
 * Auth: Bearer <CRON_SECRET> o <INTERNAL_API_KEY>
 * Body: { orderId: string, refereeId: string, tenantId: string }
 *
 * Response: { rewarded: boolean, couponCode?: string, referrerId?: string }
 *
 * Idempotente: si el referral ya está 'rewarded', retorna { rewarded: false }.
 */

const CompleteReferralSchema = z.object({
  orderId: z.string().min(1).max(50),
  refereeId: z.string().min(6).max(30), // Customer.phone del referee
  tenantId: z.string().min(1).max(50),
});

function getInternalSecret(): string | undefined {
  return process.env.INTERNAL_API_KEY ?? process.env.CRON_SECRET;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Auth interna: Bearer token comparado con timing-safe
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  const secret = getInternalSecret();
  if (!secret || !token || !timingSafeCompare(token, secret)) {
    logger.warn("[referrals/complete] Intento no autorizado", {
      ip: req.headers.get("x-forwarded-for") ?? "unknown",
      path: req.nextUrl.pathname,
    });
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // 2. Validación Zod con safeParse
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const parsed = CompleteReferralSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { orderId, refereeId, tenantId } = parsed.data;

  try {
    // 3. Disparar reward al referrer (idempotente)
    const result = await ReferralsDB.onFirstOrderCompleted(
      tenantId,
      refereeId,
      orderId,
    );

    if (result.rewarded) {
      // 4. Log fire-and-forget
      logActivity(
        "referral_complete",
        "Referral",
        `Reward activado para referrer ${result.referrerId} por primer pedido ${orderId} del referee ${refereeId}`,
        orderId,
        "system",
        undefined,
        tenantId,
      ).catch(() => {});
    }

    return NextResponse.json(result);
  } catch (err) {
    logger.error("[referrals/complete] Error inesperado", {
      tenantId,
      refereeId,
      orderId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Error interno al completar referido" },
      { status: 500 },
    );
  }
}
