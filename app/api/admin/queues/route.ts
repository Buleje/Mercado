export const dynamic = "force-dynamic";

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getQueueStats } from "@/lib/queue/dashboard";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const stats = await getQueueStats();
    logger.debug("[queues] Stats fetched", { tenantId: auth.tenantId, queueCount: stats.length });
    return NextResponse.json({ data: stats });
  } catch (e) {
    logger.error("[queues] Failed to fetch queue stats", { error: String(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "Failed to fetch queue stats" }, { status: 503 });
  }
}
