import { NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { logger } from "@/lib/logger";

/**
 * ADR-118 — Materializa adelantos recurrentes activos vencidos (proximaEjecucion <= now).
 * Crea el adelanto real y reprograma la próxima ejecución. Idempotente por fecha.
 */
export const GET = withCronAuth("adelantos-recurrentes", async () => {
  try {
    const { creados } = await AdelantosDB.materializeRecurrentes();
    return NextResponse.json({ ok: true, creados });
  } catch (err) {
    logger.error("[cron/adelantos-recurrentes] error", { err: String(err) });
    return NextResponse.json({ ok: false, error: "Error materializando recurrentes" }, { status: 500 });
  }
});
