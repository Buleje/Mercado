import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { CashRegistersDB } from "@/lib/db/sales.db";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

/**
 * GET /api/cron/auto-close-register
 *
 * Cron job que busca, EN TODOS LOS TENANTS ACTIVOS, cajas con status
 * "abierta" que llevan más de 16 horas abiertas, y las cierra automáticamente
 * con el tenantId de cada una.
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

      // Las cajas de TODOS los tenants activos. Con el `"main"` que había acá,
      // este cron sólo existía para un tenant: en el resto del SaaS las cajas
      // quedaban abiertas para siempre y nadie se enteraba. Mismo patrón que
      // los demás crons del proyecto (expiry-discounts, market-alerts).
      const tenants = await prisma.tenant.findMany({
        where: { active: true },
        select: { id: true, slug: true },
      });

      const staleRegisters: { tenantId: string; tenantSlug: string; reg: Awaited<ReturnType<typeof CashRegistersDB.getAll>>[number] }[] = [];
      for (const tenant of tenants) {
        const registers = await CashRegistersDB.getAll(tenant.id);
        for (const reg of registers) {
          if (reg.status !== "abierta") continue;
          if (new Date(reg.openedAt) > cutoff) continue;
          staleRegisters.push({ tenantId: tenant.id, tenantSlug: tenant.slug, reg });
        }
      }

      if (staleRegisters.length === 0) {
        logger.info("[cron/auto-close-register] No hay cajas para cerrar automáticamente");
        return { ok: true, closed: 0, processedAt: now.toISOString() };
      }

      let closed = 0;
      const closedIds: string[] = [];

      for (const { tenantId, tenantSlug, reg } of staleRegisters) {
        // Calcular el monto de cierre esperado (ingresos - egresos + apertura)
        const totalIn = reg.movements
          .filter((m) => m.type === "venta" || m.type === "ingreso")
          .reduce((sum, m) => sum + m.amount, 0);
        const totalOut = reg.movements
          .filter((m) => m.type === "egreso")
          .reduce((sum, m) => sum + m.amount, 0);
        const expectedClosing = reg.openingAmount + totalIn - totalOut;

        // Cada caja se cierra con SU tenantId: cerrar la de otro tenant con
        // "main" es escribir en el aislamiento de al lado.
        const updated = await CashRegistersDB.close(
          tenantId,
          reg.id,
          expectedClosing,
          "Cierre automático del sistema"
        );

        if (updated) {
          closed++;
          closedIds.push(reg.id);
          logger.info("[cron/auto-close-register] Caja cerrada automáticamente", {
            registerId: reg.id,
            tenantId,
            tenantSlug,
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
