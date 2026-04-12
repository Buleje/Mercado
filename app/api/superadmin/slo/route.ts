import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import {
  getAllBudgetStatusesLive,
  shouldBlockDeploy,
  formatStatusTable,
} from "@/lib/slo/budget-calculator";

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "MODERATE");
  if (rl) return rl;

  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  const session = token ? await getPlatformSession(token) : null;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { statuses, dataSource } = await getAllBudgetStatusesLive();
    const deployGate = shouldBlockDeploy(statuses);

    logger.info("[SLO] Status queried", { dataSource, blocked: deployGate.blocked });

    return NextResponse.json({
      dataSource,
      deployBlocked: deployGate.blocked,
      deployReason: deployGate.reason,
      slos: statuses,
      markdown: formatStatusTable(statuses),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("[SLO] Failed to compute status", { error: String(err) });
    return NextResponse.json({ error: "Failed to compute SLO status" }, { status: 500 });
  }
}
