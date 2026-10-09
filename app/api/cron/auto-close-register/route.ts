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
        // El cierre automático cuenta «lo esperado» como contado: con la MISMA
        // cuenta que el cierre (`saldoEsperadoDeCaja`, sólo efectivo). La copia
        // de antes sumaba también las ventas por Yape/tarjeta/fiado, y cada
        // cierre automático quedaba con un «sobrante» que nadie contó.
        // Desde 2026-10-08 es un cierre SIN conteo (`null`): el esperado se
        // calcula y se anota como contado DENTRO del lock del cierre; la nota
        // «Cierre automático…» lo muestra «Cerrada sin conteo» en el arqueo.
        // Cada caja se cierra con SU tenantId: cerrar la de otro tenant con
        // "main" es escribir en el aislamiento de al lado.
        const updated = await CashRegistersDB.close(
          tenantId,
          reg.id,
          null,
          "Cierre automático del sistema"
        );

        if (updated) {
          closed++;
          closedIds.push(reg.id);
          const expectedClosing = Number(updated.expectedAmount ?? 0);
          logger.info("[cron/auto-close-register] Caja cerrada automáticamente", {
            registerId: reg.id,
            tenantId,
            tenantSlug,
            openedAt: reg.openedAt,
            expectedClosing,
          });
          // «Cerrar»/«caja» con el tenant: es lo que lee Cuadrar caja para decir
          // quién la cerró. Antes iba como «auto-close»/«CashRegister» y SIN
          // tenantId: no aparecía en ningún historial.
          logActivity(
            "Cerrar",
            "caja",
            `Caja ${reg.id} cerrada automáticamente por inactividad (abierta desde ${reg.openedAt})`,
            reg.id,
            "sistema",
            undefined,
            tenantId,
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
