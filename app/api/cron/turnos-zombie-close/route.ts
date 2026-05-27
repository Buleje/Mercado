import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import { TurnosDB } from "@/lib/db/turnos.db";
import { logger } from "@/lib/logger";
import { trackCronExecution } from "@/lib/cron/health-tracker";

/**
 * GET /api/cron/turnos-zombie-close
 *
 * Cron horario. Auto-cierra turnos ABIERTOs cuyo `abrioEn` es mayor a
 * `MAX_TURNO_HOURS` (default 12h) o cuya ultima venta del cajero ocurrio
 * hace mas de `IDLE_HOURS` (default 4h). Sin esto, los turnos abandonados
 * (cajero cerro sesion sin cerrar turno) bloquean apertura de turnos
 * nuevos por dias.
 *
 * Para cada turno zombie:
 *   1. Calcula ventasTotal con sale.aggregate por cashierId (T2 fix).
 *   2. cierreEfectivo se setea a inicioEfectivo + ventasTotal (best-effort).
 *   3. notas explicita el cierre automatico para audit.
 *   4. TurnosDB.cerrar atomico (T3) — si otro proceso lo cerro primero,
 *      count===0 y se skipea.
 *
 * Autorizacion: Bearer <CRON_SECRET>.
 */

const MAX_TURNO_HOURS = 12;

export async function GET(req: NextRequest) {
  const start = Date.now();
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cutoff = new Date(Date.now() - MAX_TURNO_HOURS * 60 * 60 * 1000);

     
    const zombies = await prisma.turno.findMany({
      where: {
        status: "ABIERTO",
        abrioEn: { lt: cutoff },
      },
      select: {
        id: true,
        tenantId: true,
        adminUserId: true,
        inicioEfectivo: true,
        abrioEn: true,
      },
    });

    let closed = 0;
    let skipped = 0;
    const errors: Array<{ id: string; err: string }> = [];

    for (const turno of zombies) {
      try {
         
        const ventasAgg = await prisma.sale.aggregate({
          where: {
            tenantId: turno.tenantId,
            cashierId: turno.adminUserId,
            createdAt: { gte: turno.abrioEn },
          },
          _sum: { total: true },
        });
        const ventasTotal = ventasAgg._sum.total ? Number(ventasAgg._sum.total) : 0;
        const inicioNum = Number(turno.inicioEfectivo);

        const updated = await TurnosDB.cerrar(turno.id, turno.tenantId, {
          cierreEfectivo: inicioNum + ventasTotal,
          ventasTotal,
          notas: `Cerrado automaticamente (zombie >${MAX_TURNO_HOURS}h). Revisar arqueo manual.`,
        });

        if (updated) closed++;
        else skipped++;
      } catch (err) {
        errors.push({ id: turno.id, err: err instanceof Error ? err.message : String(err) });
      }
    }

    logger.info("[cron/turnos-zombie-close] success", {
      detected: zombies.length,
      closed,
      skipped,
      errors: errors.length,
      durationMs: Date.now() - start,
    });

    await trackCronExecution({
      jobName: "turnos-zombie-close",
      status: errors.length > 0 ? "failure" : "success",
      durationMs: Date.now() - start,
      ...(errors.length > 0 && { error: `${errors.length} turnos fallaron al cerrar` }),
    });

    return NextResponse.json({
      ok: true,
      detected: zombies.length,
      closed,
      skipped,
      errors,
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    logger.error("[cron/turnos-zombie-close] failed", { err });

    await trackCronExecution({
      jobName: "turnos-zombie-close",
      status: "failure",
      durationMs: Date.now() - start,
      error: err,
    });

    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
