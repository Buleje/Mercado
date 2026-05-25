import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { PaymentProofsDB } from "@/lib/db/payment-proofs.db";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/payment-proofs?status=pending|all
 *
 * Audit P1 (2026-05-19): defense-in-depth — verifica la cookie EN el handler,
 * no solo en middleware. Si una regresión rompe el guard del proxy, este
 * endpoint igual rechaza visitantes anónimos.
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
    const session = token ? await getPlatformSession(token) : null;
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const status = req.nextUrl.searchParams.get("status") ?? "pending";
    const proofs = status === "all"
      ? await PaymentProofsDB.listAll()
      : await PaymentProofsDB.listPending();
    return NextResponse.json({ proofs });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
