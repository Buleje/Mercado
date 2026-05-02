import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { PaymentApprovalDb } from "@/lib/db/payment-approval.db";
import { logger } from "@/lib/logger";

// Next 16 cacheComponents-compatible: handler es dinámico por naturaleza.

/**
 * GET /api/superadmin/payment-approvals
 *
 * Lista las aprobaciones Yape en estado pending o review_required.
 * Query params:
 *   limit  — número máximo (default 50, max 500)
 *   sinceMs — filtrar a los últimos N ms (ej. sinceMs=86400000 → 24h)
 *
 * Retorna { approvals: PaymentApproval[], total: number }
 */
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const params = req.nextUrl.searchParams;
  const limit = Math.min(
    parseInt(params.get("limit") ?? "50", 10) || 50,
    500,
  );
  const sinceMs = params.get("sinceMs")
    ? parseInt(params.get("sinceMs")!, 10)
    : undefined;

  try {
    const approvals = await PaymentApprovalDb.listPending({ limit, sinceMs });
    logger.info("[payment-approvals] list", {
      reviewer: auth.username,
      count: approvals.length,
    });
    return NextResponse.json({ approvals, total: approvals.length });
  } catch (err) {
    logger.error("[payment-approvals] list failed", { error: String(err) });
    return NextResponse.json({ error: "Error al cargar aprobaciones" }, { status: 500 });
  }
}
