export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { PrestamosDB } from "@/lib/db/prestamos.db";
import { logger } from "@/lib/logger";

// POST /api/prestamos/cron/mora — mark overdue loans as VENCIDO
// Called by Vercel cron or manual trigger
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = req.headers.get("x-tenant-id") ?? "default";
    const count = await PrestamosDB.marcarVencidos(tenantId);

    logger.info("[prestamos/cron/mora] Marked overdue", { count, tenantId });

    return NextResponse.json({ marked: count });
  } catch (e) {
    logger.error("[prestamos/cron/mora] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
