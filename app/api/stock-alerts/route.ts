import { NextResponse, type NextRequest } from "next/server";
import { StockAlertsDB } from "@/lib/db/stock-alerts.db";
import { NotificationLogsDB } from "@/lib/db/notifications.db";
import { broadcastPush } from "@/lib/push-sender";
import { sendStockAlertEmail } from "@/lib/mailer-stock";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { enStockBajo, stockMinimoDe, STOCK_MINIMO_GLOBAL_POR_DEFECTO } from "@/lib/inventario/stock-minimo";
import { minimosGlobalesPorNegocio } from "@/lib/inventario/stock-minimo.server";

/**
 * GET /api/stock-alerts — Check products below stockMin and fire alerts.
 * Can be called manually from admin or via Vercel Cron.
 *
 * POST /api/stock-alerts — Same but triggered as cron job with auth.
 */

async function checkAndAlert() {
  // Audit project-wide 2026-05-19: migrado a StockAlertsDB.
  const lowStock = await StockAlertsDB.listActiveWithMinStock();

  // Un solo stock mínimo (09-10): el propio o el global de cada negocio,
  // leído una vez por tenant. `stockMin` sale como el mínimo efectivo.
  const minimos = await minimosGlobalesPorNegocio(lowStock.map((p) => p.tenantId));
  const alerts = lowStock
    .map((p) => ({ p, minimoGlobal: minimos.get(p.tenantId) ?? STOCK_MINIMO_GLOBAL_POR_DEFECTO }))
    .filter(({ p, minimoGlobal }) => enStockBajo(p, minimoGlobal))
    .map(({ p, minimoGlobal }) => ({ ...p, stockMin: stockMinimoDe(p, minimoGlobal) }));

  // ── Velocity-based stock-out prediction ──────────────────────────
  // Calculate average daily sales over the last 14 days for all active products
  const velocityMap = await StockAlertsDB.getRecentSalesVelocity(14);

  // Find products that will run out within 7 days based on velocity
  const allActive = await StockAlertsDB.listActiveWithStock();
  const velocityAlerts = allActive
    .map(p => {
      const dailyRate = velocityMap.get(p.id) ?? 0;
      if (dailyRate <= 0) return null;
      const daysLeft = (p.stock ?? 0) / dailyRate;
      return daysLeft <= 7 ? { ...p, dailyRate: Math.round(dailyRate * 10) / 10, daysLeft: Math.round(daysLeft * 10) / 10 } : null;
    })
    .filter(Boolean) as Array<{ id: number; name: string; stock: number | null; stockMin: number | null; category: string; unit: string; tenantId: string; dailyRate: number; daysLeft: number }>;

  const hasAlerts = alerts.length > 0 || velocityAlerts.length > 0;

  if (!hasAlerts) {
    return { alerts: [], velocityAlerts: [], notified: false };
  }

  // Cada negocio recibe sólo lo suyo (09-10): antes el push iba a TODOS los
  // suscriptores (sin tenantId) con nombres de productos de todos los
  // negocios, y el registro de cada negocio llevaba las «se agotan pronto»
  // de los demás.
  const tenantIds = [...new Set([...alerts, ...velocityAlerts].map((p) => p.tenantId))];
  await Promise.allSettled(
    tenantIds.map(async (tenantId) => {
      const bajos = alerts.filter((p) => p.tenantId === tenantId);
      const pronto = velocityAlerts.filter((p) => p.tenantId === tenantId);
      const total = bajos.length + pronto.length;
      const lineas = [
        ...bajos.slice(0, 3).map((p) => `${p.name}: ${p.stock}/${p.stockMin}`),
        ...pronto.slice(0, 2).map((p) => `${p.name}: ~${p.daysLeft}d restante`),
      ];
      try {
        await broadcastPush(
          {
            title: `⚠️ ${total} alerta${total > 1 ? "s" : ""} de stock`,
            // «y N más» = lo que no entró en las líneas (antes restaba 5 fijo).
            body: lineas.join(", ") + (total > lineas.length ? ` y ${total - lineas.length} más` : ""),
            url: "/admin?tab=inventario",
          },
          tenantId,
        );
      } catch (err) {
        logger.warn("[stock-alerts] push falló", { tenantId, error: String(err) });
      }
      try {
        const logParts: string[] = [];
        if (bajos.length > 0) logParts.push(`${bajos.length} con stock bajo: ${bajos.map((p) => p.name).join(", ")}`);
        if (pronto.length > 0) logParts.push(`${pronto.length} se agotan pronto: ${pronto.map((p) => `${p.name} (~${p.daysLeft}d)`).join(", ")}`);
        await NotificationLogsDB.add({
          type: "low_stock",
          recipient: "admin",
          message: logParts.join(" | "),
          status: "sent",
        }, tenantId);
      } catch (err) {
        logger.warn("[stock-alerts] registro falló", { tenantId, error: String(err) });
      }
    }),
  );

  // Correo al dueño de la plataforma (NOTIFY_EMAIL / SMTP_USER del deploy).
  try {
    await sendStockAlertEmail(
      alerts.map((p) => ({
        name: p.name,
        stock: p.stock ?? 0,
        stockMin: p.stockMin,
        category: p.category,
        unit: p.unit,
      })),
    );
  } catch (err) {
    logger.warn("[stock-alerts] correo falló", { error: String(err) });
  }

  return {
    alerts: alerts.map((p) => ({
      id: p.id,
      name: p.name,
      stock: p.stock,
      stockMin: p.stockMin,
      category: p.category,
    })),
    velocityAlerts: velocityAlerts.map(p => ({
      id: p.id,
      name: p.name,
      stock: p.stock,
      dailyRate: p.dailyRate,
      daysLeft: p.daysLeft,
      category: p.category,
    })),
    notified: true,
  };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await checkAndAlert();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "stock-alerts"); if (_rl) return _rl;
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await checkAndAlert();
  return NextResponse.json(result);
}
