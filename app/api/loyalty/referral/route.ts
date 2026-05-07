import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { processReferral, ensureReferralCode } from "@/lib/loyalty/referral";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// ── Schemas ─────────────────────────────────────────────────────────────────

const ApplyReferralSchema = z.object({
  refereePhone: z.string().min(5).max(20),
  referralCode: z.string().min(4).max(20),
});

const GetCodeSchema = z.object({
  phone: z.string().min(5).max(20),
});

/**
 * POST /api/loyalty/referral
 * Apply a referral code — credits both referrer and referee with 50 points.
 *
 * Body: { refereePhone, referralCode }
 * No auth required — this is a public-facing endpoint for new customers.
 * The tenantId comes from the x-tenant-id header (set by middleware).
 */
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "loyalty-referral"); if (_rl) return _rl;
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant no identificado" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = ApplyReferralSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await processReferral(
    tenantId,
    parsed.data.refereePhone,
    parsed.data.referralCode,
  );

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    pointsEarned: result.refereePoints,
    message: `¡Ganaste ${result.refereePoints} puntos! Tu amigo también recibió ${result.referrerPoints} puntos.`,
  });
}

/**
 * GET /api/loyalty/referral?phone=xxx
 * Get or generate the referral code for a customer.
 * Public endpoint — returns the customer's shareable referral code.
 */
export async function GET(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant no identificado" }, { status: 400 });
  }

  const url = new URL(req.url);
  const phone = url.searchParams.get("phone");

  const parsed = GetCodeSchema.safeParse({ phone });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Teléfono requerido", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const code = await ensureReferralCode(tenantId, parsed.data.phone);
    return NextResponse.json({ referralCode: code });
  } catch (err) {
    logger.error("[referral] Error generando código", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Error generando código de referido" },
      { status: 500 },
    );
  }
}
