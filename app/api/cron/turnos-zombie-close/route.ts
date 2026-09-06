import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import { TurnosDB } from "@/lib/db/turnos.db";
import { AdminUsersDB } from "@/lib/db/admin-users.db";
import { CashRegistersDB } from "@/lib/jsondb";
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
        cashRegisterId: true,
        inicioEfectivo: true,
        abrioEn: true,
      },
    });

    let closed = 0;
    let skipped = 0;
    const errors: Array<{ id: string; err: string }> = [];

    for (const turno of zombies) {
      try {
        // FIX 2026-07-08 (reporte ventas-caja bug 3): Sale.cashierId guarda el
        // username, no el adminUserId (CUID). Resolver username y filtrar por
        // ambas formas para no auto-cerrar zombies con ventasTotal falso S/0.
        const zombieUsername = await AdminUsersDB.getUsernameById(turno.tenantId, turno.adminUserId);
        const cashierIds = [turno.adminUserId, zombieUsername].filter((v): v is string => !!v);
        const ventasAgg = await prisma.sale.aggregate({
          where: {
            tenantId: turno.tenantId,
            cashierId: { in: cashierIds },
            createdAt: { gte: turno.abrioEn },
          },
          _sum: { total: true },
        });
        const ventasTotal = ventasAgg._sum.total ? Number(ventasAgg._sum.total) : 0;
        const inicioNum = Number(turno.inicioEfectivo);
        const cierreEfectivo = inicioNum + ventasTotal;

        const updated = await TurnosDB.cerrar(turno.id, turno.tenantId, {
          cierreEfectivo,
          ventasTotal,
          notas: `Cerrado automaticamente (zombie >${MAX_TURNO_HOURS}h). Revisar arqueo manual.`,
        });

        if (updated) {
          closed++;
          // bug 7/8: cerrar también la caja vinculada para no dejar registers
          // huérfanos "Abiertos" por días (origen del "register del 10-jun").
          if (turno.cashRegisterId) {
            try {
              const reg = await CashRegistersDB.getById(turno.tenantId, turno.cashRegisterId);
              if (reg && reg.status === "abierta") {
                await CashRegistersDB.close(
                  turno.tenantId,
                  turno.cashRegisterId,
                  cierreEfectivo,
                  `Cierre automático (turno zombie >${MAX_TURNO_HOURS}h). Revisar arqueo manual.`,
                );
              }
            } catch (regErr) {
              logger.warn("[cron/turnos-zombie-close] cierre de caja vinculada falló", {
                turnoId: turno.id, err: regErr instanceof Error ? regErr.message : String(regErr),
              });
            }
          }
        } else skipped++;
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
