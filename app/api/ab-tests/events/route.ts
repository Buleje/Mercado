import { NextResponse, type NextRequest } from "next/server";
import { ABTestDB } from "@/lib/ab-testing";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// POST: track an impression or conversion event
export async function POST(req: NextRequest) {
  try {
    const _rl = await applyRateLimit(req, "STRICT", "ab-tests-events"); if (_rl) return _rl;
    const { testId, variantId, visitorId, event, value } = await req.json();
    if (!testId || !variantId || !visitorId || !["impression", "conversion"].includes(event)) {
      return NextResponse.json({ error: "testId, variantId, visitorId, event requeridos" }, { status: 400 });
    }
    await ABTestDB.trackEvent(testId, variantId, visitorId, event, value);
    return NextResponse.json({ ok: true }, { status: 201 });

  } catch (e) {
    logger.error("[post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
