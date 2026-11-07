import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { JuntasDB } from "@/lib/db/juntas.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/juntas-resolve
 *
 * Cierra (marca EXPIRED) las juntas OPEN cuya ventana ya venció. Idempotente:
 * correrlo varias veces no cambia nada extra. El estado EXPIRED también se
 * computa on-read, pero este cron lo persiste para que `listOpenRecent` y los
 * índices reflejen el cierre sin recálculo.
 *
 * Autorización: Bearer <CRON_SECRET>.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const expired = await JuntasDB.expireStale();
    logger.info("[cron/juntas-resolve] juntas cerradas", { expired });
    return NextResponse.json({ ok: true, expired });
  } catch (err) {
    logger.error("[cron/juntas-resolve] failed", { error: String(err) });
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
