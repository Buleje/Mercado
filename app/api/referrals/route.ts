export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { CustomersDB, normalizePhone } from "@/lib/jsondb";
import { applyRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const ApplySchema = z.object({
  phone: z.string().min(5).max(20),
  code:  z.string().min(4).max(10).toUpperCase(),
});

/**
 * POST /api/referrals
 * Body: { phone, code }
 * Applies a referral code to the customer.
 * Rate-limited per IP, no auth required (customer action).
 */
export async function POST(req: NextRequest) {
  const limited = applyRateLimit(req, "MODERATE", "referrals");
  if (limited) return limited;

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = ApplySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.map(i => i.message) }, { status: 400 });
  }

  const { phone, code } = parsed.data;
  const result = await CustomersDB.applyReferralCode(normalizePhone(phone), code);
  if (!result.success) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: result.message });
}

/**
 * GET /api/referrals?phone=XXX
 * Returns or generates the referral code for a customer.
 */
export async function GET(req: NextRequest) {
  const limited = applyRateLimit(req, "MODERATE", "referrals");
  if (limited) return limited;

  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) return NextResponse.json({ error: "phone requerido" }, { status: 400 });

  const code = await CustomersDB.ensureReferralCode(normalizePhone(phone));
  return NextResponse.json({ code });
}
