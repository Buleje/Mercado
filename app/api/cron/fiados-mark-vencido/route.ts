import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import { logger } from "@/lib/logger";
import { trackCronExecution } from "@/lib/cron/health-tracker";

/**
 * GET /api/cron/fiados-mark-vencido
 *
 * Cron diario (00:30). Transita fiados ACTIVO -> VENCIDO cuando
 * `fechaVence < NOW()`. Sin esto, el frontend muestra fiados como
 * vencidos (semaforo) pero el DB sigue diciendo `ACTIVO`, rompiendo
 * filtros y bloqueos de credito que dependen del enum.
 *
 * Autorizacion: Bearer <CRON_SECRET>.
 */
export async function GET(req: NextRequest) {
  const start = Date.now();
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    // eslint-disable-next-line no-restricted-properties -- cron multi-tenant: corre sobre todos los tenants en una sola pasada (idempotente, no requiere tenantId scope).
    const result = await prisma.fiado.updateMany({
      where: {
        status: "ACTIVO",
        fechaVence: { lt: now, not: null },
      },
      data: {
        status: "VENCIDO",
        updatedAt: now,
      },
    });

    logger.info("[cron/fiados-mark-vencido] success", {
      transitioned: result.count,
      durationMs: Date.now() - start,
    });

    await trackCronExecution({
      jobName: "fiados-mark-vencido",
      status: "success",
      durationMs: Date.now() - start,
    });

    return NextResponse.json({
      ok: true,
      transitioned: result.count,
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    logger.error("[cron/fiados-mark-vencido] failed", { err });

    await trackCronExecution({
      jobName: "fiados-mark-vencido",
      status: "failure",
      durationMs: Date.now() - start,
      error: err,
    });

    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
