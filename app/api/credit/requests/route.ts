import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { CreditRequestsDB } from "@/lib/db/credit-requests.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/credit/requests
 *
 * Cola de solicitudes de línea de fiado PENDING del tenant (Frente 3), para que
 * el dueño las apruebe/rechace desde el admin. Solo admin/manager.
 */
export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "MODERATE", "credit-requests-list");
  if (_rl) return _rl;

  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const requests = await CreditRequestsDB.listPending(auth.tenantId);
    return NextResponse.json({ requests });
  } catch (err) {
    logger.error("[credit/requests] GET error", { error: String(err) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
