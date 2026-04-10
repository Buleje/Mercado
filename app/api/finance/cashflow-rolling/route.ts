import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { computeCashflowRolling } from "@/lib/finance/cashflow-rolling";

/**
 * GET /api/finance/cashflow-rolling
 *
 * Returns the rolling 13-week cashflow projection for the authenticated
 * tenant. Admin/cajero only.
 *
 * No query params — 13 weeks is the FP&A standard for this feature.
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    // Rate limit first (MODERATE = 20 req / 5 min per IP)
    const limited = applyRateLimit(req, "MODERATE", "cashflow-rolling");
    if (limited) return limited;

    const auth = await requireAdmin(req, ["admin", "cajero"]);
    if (auth instanceof NextResponse) return auth;

    const result = await computeCashflowRolling(auth.tenantId);

    return NextResponse.json(result);
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
