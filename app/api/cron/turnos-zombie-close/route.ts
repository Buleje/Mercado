import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import { TurnosDB } from "@/lib/db/turnos.db";
import { AdminUsersDB } from "@/lib/db/admin-users.db";
import { CashRegistersDB } from "@/lib/jsondb";
import { CashShiftSalesDB } from "@/lib/db/cash-shift-sales.db";
import { saldoEsperadoDeCaja } from "@/lib/caja/saldo-esperado";
import { HORAS_TURNO_OLVIDADO, NOTA_CAJA_ZOMBIE, NOTA_TURNO_ZOMBIE } from "@/lib/caja/cierre-sin-conteo";
import { logActivity } from "@/lib/activity-logger";
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
 *   1. Calcula ventasTotal (todas las ventas del cajero, cualquier medio).
 *   2. Cierra el turno SIN conteo: nadie contó el cajón. `cierreEfectivo` es el
 *      ESPERADO en efectivo de su caja (`saldoEsperadoDeCaja`, la cuenta del
 *      arqueo) — o `null` si no tiene caja abierta. Antes era
 *      `inicio + ventasTotal`, con Yape y tarjeta dentro: la caja quedaba con
 *      un «sobrante» inventado en `CashRegister.difference` que Arqueo, Caja y
 *      el aviso de DIFERENCIA_CAJA leían como real.
 *   3. Cierra la caja vinculada sin conteo (`close(…, null, …)`: contado =
 *      esperado bajo el lock, diferencia 0) con la marca «Cierre automático»
 *      que el arqueo muestra como «Cerrada sin conteo» — la misma de
 *      `close-shift` sin monto. La nota del turno («Cerrado automaticamente…»)
 *      hace que el historial de turnos no muestre diferencia (`cifrasDeCajaDelTurno`).
 *      Si otro turno ABIERTO (no olvidado) comparte la caja, la caja se deja
 *      abierta: se cerraría en la cara del cajero que está vendiendo.
 *   4. TurnosDB.cerrar atomico (T3) — si otro proceso lo cerro primero,
 *      count===0 y se skipea.
 *
 * Autorizacion: Bearer <CRON_SECRET>.
 */

const MAX_TURNO_HOURS = HORAS_TURNO_OLVIDADO;

export async function GET(req: NextRequest) {
  const start = Date.now();
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cutoff = new Date(Date.now() - MAX_TURNO_HOURS * 60 * 60 * 1000);

    // Cross-tenant por diseño (cron): `app/api/cron/**` está en los ignores de la regla de prisma.
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
        abrioEn: true,
      },
    });

    let closed = 0;
    let cajasCerradas = 0;
    let skipped = 0;
    const errors: Array<{ id: string; err: string }> = [];

    for (const turno of zombies) {
      try {
        // FIX 2026-07-08 (reporte ventas-caja bug 3): Sale.cashierId guarda el
        // username, no el adminUserId (CUID). Resolver username y filtrar por
        // ambas formas para no auto-cerrar zombies con ventasTotal falso S/0.
        const zombieUsername = await AdminUsersDB.getUsernameById(turno.tenantId, turno.adminUserId);
        const ventasTotal = await CashShiftSalesDB.aggregateByCashierShift(
          turno.tenantId,
          [turno.adminUserId, zombieUsername].filter((v): v is string => !!v),
          turno.abrioEn,
        );

        // La caja del turno, si sigue abierta y nadie más la está usando.
        const caja = turno.cashRegisterId
          ? await CashRegistersDB.getById(turno.tenantId, turno.cashRegisterId)
          : null;
        const cajaAbierta = caja && caja.status === "abierta" ? caja : null;
        const compartidaConTurnoVivo = cajaAbierta
          ? (await prisma.turno.count({
              where: {
                tenantId: turno.tenantId,
                cashRegisterId: cajaAbierta.id,
                status: "ABIERTO",
                id: { not: turno.id },
                abrioEn: { gte: cutoff },
              },
            })) > 0
          : false;
        // Sin conteo: lo que DEBÍA haber en efectivo, no lo que se vendió por
        // todos los medios. Sin caja abierta no hay de dónde sacarlo → null.
        const cierreEfectivo = cajaAbierta
          ? saldoEsperadoDeCaja(cajaAbierta.openingAmount, cajaAbierta.movements).esperado
          : null;

        const updated = await TurnosDB.cerrar(turno.id, turno.tenantId, {
          cierreEfectivo,
          ventasTotal,
          notas: NOTA_TURNO_ZOMBIE,
        });

        if (updated) {
          closed++;
          // bug 7/8: cerrar también la caja vinculada para no dejar registers
          // huérfanos "Abiertos" por días (origen del "register del 10-jun").
          if (cajaAbierta && !compartidaConTurnoVivo) {
            try {
              const cerrada = await CashRegistersDB.close(turno.tenantId, cajaAbierta.id, null, NOTA_CAJA_ZOMBIE);
              if (cerrada) {
                cajasCerradas++;
                // «Quién cerró» en Cuadrar caja: el sistema, no una persona.
                logActivity(
                  "Cerrar",
                  "caja",
                  `Cierre sin conteo por el sistema (turno olvidado >${MAX_TURNO_HOURS} h; esperado S/${Number(cerrada.expectedAmount ?? 0).toFixed(2)})`,
                  cajaAbierta.id,
                  "sistema",
                  undefined,
                  turno.tenantId,
                ).catch((err) => logger.warn("[cron/turnos-zombie-close] activity log failed", { turnoId: turno.id, err: String(err) }));
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
      cajasCerradas,
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
      cajasCerradas,
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
