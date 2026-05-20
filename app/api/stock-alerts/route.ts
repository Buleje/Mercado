import { NextResponse, type NextRequest } from "next/server";
import { StockAlertsDB } from "@/lib/db/stock-alerts.db";
import { NotificationLogsDB } from "@/lib/db/notifications.db";
import { broadcastPush } from "@/lib/push-sender";
import { sendStockAlertEmail } from "@/lib/mailer-stock";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/stock-alerts — Check products below stockMin and fire alerts.
 * Can be called manually from admin or via Vercel Cron.
 *
 * POST /api/stock-alerts — Same but triggered as cron job with auth.
 */

async function checkAndAlert() {
  // Audit project-wide 2026-05-19: migrado a StockAlertsDB.
  const lowStock = await StockAlertsDB.listActiveWithMinStock();

  const alerts = lowStock.filter(
    (p) => p.stock !== null && p.stockMin !== null && p.stock <= p.stockMin,
  );

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
    .filter(Boolean) as Array<{ id: number; name: string; stock: number | null; stockMin: number | null; category: string; unit: string; dailyRate: number; daysLeft: number }>;

  const hasAlerts = alerts.length > 0 || velocityAlerts.length > 0;

  if (!hasAlerts) {
    return { alerts: [], velocityAlerts: [], notified: false };
  }

  const pushLines: string[] = [];
  if (alerts.length > 0) {
    pushLines.push(...alerts.slice(0, 3).map(p => `${p.name}: ${p.stock}/${p.stockMin}`));
  }
  if (velocityAlerts.length > 0) {
    pushLines.push(...velocityAlerts.slice(0, 2).map(p => `${p.name}: ~${p.daysLeft}d restante`));
  }

  // Push notification to all admin subscribers
  try {
    const totalCount = alerts.length + velocityAlerts.length;
    await broadcastPush({
      title: `⚠️ ${totalCount} alerta${totalCount > 1 ? "s" : ""} de stock`,
      body: pushLines.join(", ") +
        (alerts.length + velocityAlerts.length > 5 ? ` y ${totalCount - 5} más` : ""),
      url: "/admin?tab=inventario",
    });
  } catch { /* push optional */ }

  // Email notification
  try {
    await sendStockAlertEmail(
      alerts.map((p) => ({
        name: p.name,
        stock: p.stock ?? 0,
        stockMin: p.stockMin ?? 0,
        category: p.category,
        unit: p.unit,
      })),
    );
  } catch { /* email optional */ }

  // Log to NotificationLog — one entry per tenant
  try {
    const tenantIds = [...new Set(alerts.map(p => p.tenantId))];
    for (const tenantId of tenantIds) {
      const tenantAlerts = alerts.filter(p => p.tenantId === tenantId);
      const logParts: string[] = [];
      if (tenantAlerts.length > 0) logParts.push(`${tenantAlerts.length} con stock bajo: ${tenantAlerts.map(p => p.name).join(", ")}`);
      if (velocityAlerts.length > 0) logParts.push(`${velocityAlerts.length} se agotan pronto: ${velocityAlerts.map(p => `${p.name} (~${p.daysLeft}d)`).join(", ")}`);
      // Audit project-wide 2026-05-19: migrado a NotificationLogsDB.add.
      await NotificationLogsDB.add({
        type: "low_stock",
        recipient: "admin",
        message: logParts.join(" | "),
        status: "sent",
      }, tenantId);
    }
  } catch { /* logging optional */ }

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
