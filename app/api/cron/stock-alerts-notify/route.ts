export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { ProductsDB } from "@/lib/db/products.db";
import { NotificationLogsDB } from "@/lib/db/notifications.db";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

/**
 * GET /api/cron/stock-alerts-notify
 *
 * Busca productos con stock por debajo del mínimo definido
 * (o < 5 si no tiene mínimo). Registra notificación en NotificationLog.
 *
 * Sugerencia vercel.json: "0 8,14,20 * * *" (3 veces al día)
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("stock-alerts-notify", async () => {
      const allProducts = await ProductsDB.getAll();

      const alertas = allProducts
        .filter((p) => {
          if (!p.active) return false;
          if (p.stock == null) return false;
          const minimo = p.stockMin ?? 5;
          return p.stock < minimo;
        })
        .map((p) => ({
          id: p.id,
          nombre: p.name,
          categoria: p.category,
          unidad: p.unit,
          stockActual: p.stock as number,
          minimo: p.stockMin ?? 5,
          deficit: (p.stockMin ?? 5) - (p.stock as number),
        }));

      if (alertas.length === 0) {
        logger.info("[cron/stock-alerts-notify] Sin alertas de stock");
        return { ok: true, alertas: [], total: 0, processedAt: new Date().toISOString() };
      }

      // Registrar notificación en log
      const nombresAlerta = alertas
        .slice(0, 5)
        .map((a) => `${a.nombre} (${a.stockActual}/${a.minimo})`)
        .join(", ");
      const sufijo = alertas.length > 5 ? ` y ${alertas.length - 5} más` : "";

      await NotificationLogsDB.add({
        type: "low_stock_cron",
        recipient: "admin",
        message: `${alertas.length} producto(s) con stock bajo: ${nombresAlerta}${sufijo}`,
        status: "pending",
      });

      logger.info("[cron/stock-alerts-notify] Alertas de stock registradas", {
        total: alertas.length,
      });

      logActivity(
        "stock-alert",
        "Product",
        `${alertas.length} producto(s) con stock bajo detectados por cron`,
        undefined,
        "cron"
      ).catch(() => {});

      return {
        ok: true,
        total: alertas.length,
        alertas,
        processedAt: new Date().toISOString(),
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/stock-alerts-notify] Fatal error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
