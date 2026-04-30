import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { CashRegistersDB } from "@/lib/db/sales.db";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

/**
 * GET /api/cron/auto-close-register
 *
 * Cron job que busca cajas con status "abierta" que llevan
 * más de 16 horas abiertas y las cierra automáticamente.
 *
 * Sugerencia vercel.json: "0 * * * *" (cada hora)
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("auto-close-register", async () => {
      const now = new Date();
      const cutoff = new Date(now.getTime() - 16 * 60 * 60 * 1000); // 16 horas atrás

      // Obtener todas las cajas abiertas
      const allRegisters = await CashRegistersDB.getAll("main");
      const staleRegisters = allRegisters.filter((reg) => {
        if (reg.status !== "abierta") return false;
        return new Date(reg.openedAt) <= cutoff;
      });

      if (staleRegisters.length === 0) {
        logger.info("[cron/auto-close-register] No hay cajas para cerrar automáticamente");
        return { ok: true, closed: 0, processedAt: now.toISOString() };
      }

      let closed = 0;
      const closedIds: string[] = [];

      for (const reg of staleRegisters) {
        // Calcular el monto de cierre esperado (ingresos - egresos + apertura)
        const totalIn = reg.movements
          .filter((m) => m.type === "venta" || m.type === "ingreso")
          .reduce((sum, m) => sum + m.amount, 0);
        const totalOut = reg.movements
          .filter((m) => m.type === "egreso")
          .reduce((sum, m) => sum + m.amount, 0);
        const expectedClosing = reg.openingAmount + totalIn - totalOut;

        const updated = await CashRegistersDB.close(
          "main",
          reg.id,
          expectedClosing,
          "Cierre automático del sistema"
        );

        if (updated) {
          closed++;
          closedIds.push(reg.id);
          logger.info("[cron/auto-close-register] Caja cerrada automáticamente", {
            registerId: reg.id,
            openedAt: reg.openedAt,
            expectedClosing,
          });
          logActivity(
            "auto-close",
            "CashRegister",
            `Caja ${reg.id} cerrada automáticamente por inactividad (abierta desde ${reg.openedAt})`,
            reg.id,
            "cron"
          ).catch((err) => logger.error("[auto-close-register] logActivity failed", { error: String(err) }));
        }
      }

      return {
        ok: true,
        closed,
        closedIds,
        processedAt: now.toISOString(),
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/auto-close-register] Fatal error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
