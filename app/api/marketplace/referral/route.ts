import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CustomersDB } from "@/lib/db/customers.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { getCustomerPayload, CUSTOMER_SESSION } from "@/lib/auth/customer-session";

// GET /api/marketplace/referral?phone=...
// Returns referral code + stats for a customer.
//
// @cross-tenant intentional (ADR-082)
// SECURITY: el codigo referral es global del cliente (ecosistema Buleje),
// y `referredCount` cuenta CROSS-TENANT — un cliente puede haber referido
// gente que compró en bodegas distintas. Solo retorna agregados (count,
// totalEarned, shareUrl); NO retorna PII (nombres de referidos).
export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req, "GENEROUS", "referral-stats");
  if (rateLimitResponse) return rateLimitResponse;

  const traceId = newTraceId();
  try {
    const phone = req.nextUrl.searchParams.get("phone");
    if (!phone || phone.length < 6) {
      return NextResponse.json({ error: "phone requerido" }, { status: 400 });
    }

    // SECURITY 2026-05-06 (audit team H005): exigir customer-session match.
    // Antes era enumerable: con phone target obtenías referralCode + stats.
    const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
    const session = sessionToken ? await getCustomerPayload(sessionToken) : null;
    if (!session || session.customerId !== phone) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Ensure customer has a referral code
    const tenantId = getTenantIdFromRequest(req);
    const code = await CustomersDB.ensureReferralCode(tenantId, phone);

    // Count how many people used this code
    const referredCount = await prisma.customer.count({
      where: { referredBy: phone },
    });

    // Calculate points earned from referrals (50 per referral)
    const totalEarned = referredCount * 50;

    // Get share URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://buleje.pe";
    const shareUrl = `${baseUrl}/marketplace?ref=${code}`;
    const shareMessage = `¡Compra en Buleje y usa mi código ${code} para ganar puntos! ${shareUrl}`;

    return NextResponse.json({
      code,
      referredCount,
      totalEarned,
      shareUrl,
      shareMessage,
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
