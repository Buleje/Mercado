import { NextResponse, type NextRequest } from "next/server";
import { ABTestDB } from "@/lib/ab-testing";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

// GET: get results for a test (admin only)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const results = await ABTestDB.getResults(id);
    return NextResponse.json(results);

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
