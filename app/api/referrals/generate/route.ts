import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth/require-customer";
import { ReferralsDB } from "@/lib/db/referrals.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

/**
 * POST /api/referrals/generate
 *
 * Genera o devuelve el código de referido del customer autenticado.
 * Auth: sesión de customer (cookie buleje-customer-sess).
 *
 * Response: { code: string, shareUrl: string }
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Auth — sesión de customer
    const customer = await requireCustomer(req);
    if (customer instanceof NextResponse) return customer;

    // Rate limit moderado
    const rl = applyRateLimit(req, "MODERATE", "referrals-generate");
    if (rl) return rl;

    if (!customer.customerId) {
      return NextResponse.json(
        { error: "Tu cuenta no tiene un número de teléfono vinculado" },
        { status: 400 },
      );
    }

    // 2. Generar o recuperar código
    const code = await ReferralsDB.generateCodeForCustomer(
      customer.tenantId,
      customer.customerId,
    );

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";
    const shareUrl = `${baseUrl}/registro?ref=${code}`;

    // 3. Log fire-and-forget
    logActivity(
      "referral_code_generated",
      "Customer",
      `Customer ${customer.customerId} solicitó su código de referido: ${code}`,
      customer.customerId,
      customer.email,
      undefined,
      customer.tenantId,
    ).catch(() => {
        /* fire-and-forget per CLAUDE.md rule #7 */
      });

    return NextResponse.json({ code, shareUrl });

  } catch (e) {
    logger.error("[post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
