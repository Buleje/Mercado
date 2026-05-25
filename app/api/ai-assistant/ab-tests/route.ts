import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { getABTestResults } from "@/lib/ai-ab-testing";
import { logger } from "@/lib/logger";

/**
 * GET /api/ai-assistant/ab-tests
 * Returns the current A/B test experiments and their results.
 * Like looking at which store sign brought in more customers.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req, ["admin", "owner"]);
    if (auth instanceof NextResponse) return auth;

    const rateLimited = applyRateLimit(req, "MODERATE", "ai-ab-tests");
    if (rateLimited) return rateLimited;

    const results = getABTestResults();

    return NextResponse.json({ data: results });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
