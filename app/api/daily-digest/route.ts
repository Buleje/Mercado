import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDailyDigestEmail } from "@/lib/mailer-digest";
import { toNumOrZero } from "@/lib/decimal-utils";

/**
 * GET /api/daily-digest — Send a daily operations summary email to admin.
 * Triggered via Vercel Cron at 9 PM every day.
 */

async function buildAndSendDigest() {
  const now = new Date();
  // Summarize "today" in Lima timezone (UTC-5)
  const limaOffset = -5 * 60;
  const limaNow = new Date(now.getTime() + (limaOffset + now.getTimezoneOffset()) * 60_000);
  const startOfDay = new Date(limaNow);
  startOfDay.setHours(0, 0, 0, 0);
  // Convert back to UTC for DB query
  const startUTC = new Date(startOfDay.getTime() - (limaOffset + now.getTimezoneOffset()) * 60_000);
  const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60_000);

  const dateLabel = limaNow.toLocaleDateString("es-PE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: startUTC, lt: endUTC } },
    include: { items: true },
  });

  if (orders.length === 0) {
    return { sent: false, reason: "No orders today" };
  }

  const delivered = orders.filter(o => o.status === "entregado").length;
  const cancelled = orders.filter(o => o.status === "cancelado").length;
  const pending = orders.filter(o => o.status !== "entregado" && o.status !== "cancelado").length;
  // TD-018: o.total es Decimal
  const totalRevenue = orders
    .filter(o => o.status !== "cancelado")
    .reduce((sum, o) => sum + toNumOrZero(o.total), 0);
  const avgOrderValue = totalRevenue / Math.max(orders.length - cancelled, 1);

  // Top products by quantity
  const productMap = new Map<string, number>();
  for (const o of orders) {
    if (o.status === "cancelado") continue;
    for (const item of o.items) {
      productMap.set(item.name, (productMap.get(item.name) ?? 0) + item.quantity);
    }
  }
  const topProducts = [...productMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, qty]) => ({ name, qty }));

  // Payment breakdown
  const payMap = new Map<string, { count: number; total: number }>();
  for (const o of orders) {
    if (o.status === "cancelado") continue;
    const method = o.paymentMethod ?? "otro";
    const label = method === "yape" ? "Yape" : method === "efectivo" ? "Efectivo" : method;
    const prev = payMap.get(label) ?? { count: 0, total: 0 };
    payMap.set(label, { count: prev.count + 1, total: prev.total + toNumOrZero(o.total) });
  }
  const paymentBreakdown = [...payMap.entries()].map(([method, d]) => ({ method, ...d }));

  await sendDailyDigestEmail({
    date: dateLabel,
    totalOrders: orders.length,
    deliveredOrders: delivered,
    cancelledOrders: cancelled,
    pendingOrders: pending,
    totalRevenue,
    avgOrderValue,
    topProducts,
    paymentBreakdown,
  });

  return { sent: true, orders: orders.length, revenue: totalRevenue };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await buildAndSendDigest();
    return NextResponse.json(result);
  } catch (e) {
    console.error("[daily-digest] error:", e);
    return NextResponse.json({ error: "Failed to send digest" }, { status: 500 });
  }
}
