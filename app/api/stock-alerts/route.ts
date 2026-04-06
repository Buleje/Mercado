export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcastPush } from "@/lib/push-sender";
import { sendStockAlertEmail } from "@/lib/mailer-stock";

/**
 * GET /api/stock-alerts — Check products below stockMin and fire alerts.
 * Can be called manually from admin or via Vercel Cron.
 *
 * POST /api/stock-alerts — Same but triggered as cron job with auth.
 */

async function checkAndAlert() {
  const lowStock = await prisma.product.findMany({
    where: {
      active: true,
      stock: { not: null },
      stockMin: { not: null },
    },
    select: { id: true, name: true, stock: true, stockMin: true, category: true, unit: true, tenantId: true },
  });

  const alerts = lowStock.filter(
    (p) => p.stock !== null && p.stockMin !== null && p.stock <= p.stockMin,
  );

  // ── Velocity-based stock-out prediction ──────────────────────────
  // Calculate average daily sales over the last 14 days for all active products
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000);
  const recentMoves = await prisma.inventoryMovement.groupBy({
    by: ["productId"],
    where: { type: "venta", createdAt: { gte: twoWeeksAgo } },
    _sum: { quantity: true },
  });
  const velocityMap = new Map<number, number>();
  for (const m of recentMoves) {
    velocityMap.set(m.productId, (m._sum.quantity ?? 0) / 14);
  }

  // Find products that will run out within 7 days based on velocity
  const allActive = await prisma.product.findMany({
    where: { active: true, stock: { not: null, gt: 0 } },
    select: { id: true, name: true, stock: true, stockMin: true, category: true, unit: true },
  });
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
      await prisma.notificationLog.create({
        data: {
          tenantId,
          type: "low_stock",
          recipient: "admin",
          message: logParts.join(" | "),
          status: "sent",
        },
      });
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
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await checkAndAlert();
  return NextResponse.json(result);
}
