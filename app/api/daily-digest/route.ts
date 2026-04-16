import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDailyDigestEmail, sendDailyDigestWhatsApp } from "@/lib/mailer-digest";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";

/**
 * GET /api/daily-digest — Resumen diario de operaciones.
 * Triggered via Vercel Cron at 9 PM every day.
 *
 * Roadmap item #5 (daily-briefing-whatsapp-dueno):
 * - Envía WhatsApp AL DUEÑO (no solo email)
 * - Envía AUNQUE no haya ventas ("Hoy no se registraron ventas. ¿Todo bien?")
 * - Cumple la promesa del Step 5 del onboarding
 */

interface DigestData {
  date: string;
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  pendingOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  topProducts: { name: string; qty: number }[];
  paymentBreakdown: { method: string; count: number; total: number }[];
}

async function buildDigestData(): Promise<DigestData> {
  const now = new Date();
  const limaOffset = -5 * 60;
  const limaNow = new Date(now.getTime() + (limaOffset + now.getTimezoneOffset()) * 60_000);
  const startOfDay = new Date(limaNow);
  startOfDay.setHours(0, 0, 0, 0);
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

  const delivered = orders.filter(o => o.status === "entregado").length;
  const cancelled = orders.filter(o => o.status === "cancelado").length;
  const pending = orders.filter(o => o.status !== "entregado" && o.status !== "cancelado").length;
  const totalRevenue = orders
    .filter(o => o.status !== "cancelado")
    .reduce((sum, o) => sum + toNumOrZero(o.total), 0);
  const avgOrderValue = totalRevenue / Math.max(orders.length - cancelled, 1);

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

  const payMap = new Map<string, { count: number; total: number }>();
  for (const o of orders) {
    if (o.status === "cancelado") continue;
    const method = o.paymentMethod ?? "otro";
    const label = method === "yape" ? "Yape" : method === "efectivo" ? "Efectivo" : method;
    const prev = payMap.get(label) ?? { count: 0, total: 0 };
    payMap.set(label, { count: prev.count + 1, total: prev.total + toNumOrZero(o.total) });
  }
  const paymentBreakdown = [...payMap.entries()].map(([method, d]) => ({ method, ...d }));

  return {
    date: dateLabel,
    totalOrders: orders.length,
    deliveredOrders: delivered,
    cancelledOrders: cancelled,
    pendingOrders: pending,
    totalRevenue,
    avgOrderValue,
    topProducts,
    paymentBreakdown,
  };
}

// ── WhatsApp briefing al dueño (Roadmap #5) ─────────────────────────────────

function buildWhatsAppBriefing(data: DigestData): string {
  if (data.totalOrders === 0) {
    return [
      `📊 *Resumen del día* — ${data.date}`,
      ``,
      `Hoy no se registraron ventas.`,
      `¿Todo bien? Si necesitas ayuda, escríbenos.`,
      ``,
      `— Buleje`,
    ].join("\n");
  }

  const topList = data.topProducts
    .slice(0, 5)
    .map((p, i) => `${i + 1}. ${p.name} (${p.qty} uds)`)
    .join("\n");

  const payList = data.paymentBreakdown
    .map(p => `  ${p.method}: ${p.count} pedidos · S/${p.total.toFixed(0)}`)
    .join("\n");

  return [
    `📊 *Resumen del día* — ${data.date}`,
    ``,
    `📦 Pedidos: *${data.totalOrders}*`,
    `  ✅ Entregados: ${data.deliveredOrders}`,
    data.pendingOrders > 0 ? `  ⏳ Pendientes: ${data.pendingOrders}` : null,
    data.cancelledOrders > 0 ? `  ❌ Cancelados: ${data.cancelledOrders}` : null,
    ``,
    `💰 Ingresos: *S/${data.totalRevenue.toFixed(2)}*`,
    `📊 Ticket promedio: S/${data.avgOrderValue.toFixed(2)}`,
    ``,
    `🏆 *Top productos:*`,
    topList,
    ``,
    `💳 *Pagos:*`,
    payList,
    ``,
    `— Buleje`,
  ].filter(Boolean).join("\n");
}

async function sendDigest() {
  // ── 1. Compute global digest (legacy single-tenant behavior) ─────────────
  const data = await buildDigestData();

  // ── 2. Multi-tenant WhatsApp briefing ─ Roadmap #5 ──────────────────────
  // Loop over active tenants and fire sendDailyDigestWhatsApp in parallel.
  // Uses Promise.allSettled so one tenant's failure doesn't break the batch.
  let tenantsBriefed = 0;
  let tenantsTotal = 0;
  try {
    const activeTenants = await prisma.tenant.findMany({
      where: { active: true },
      select: { id: true },
    });
    tenantsTotal = activeTenants.length;

    if (tenantsTotal > 0) {
      const results = await Promise.allSettled(
        activeTenants.map((t) => sendDailyDigestWhatsApp(t.id)),
      );

      for (const r of results) {
        if (r.status === "fulfilled" && r.value.sent) tenantsBriefed += 1;
        if (r.status === "rejected") {
          logger.warn("[daily-digest] tenant WA briefing rejected", {
            reason: r.reason instanceof Error ? r.reason.message : String(r.reason),
          });
        }
      }
    }
  } catch (err) {
    logger.error("[daily-digest] tenant loop failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── 3. Legacy fallback: single-tenant env-driven briefing ───────────────
  // If no tenants were briefed above, fall back to the previous NOTIFY_PHONE
  // path so existing single-tenant deploys (without Tenant rows) keep working.
  const fallbackPhone = process.env.NOTIFY_PHONE ?? process.env.WHATSAPP_OWNER_PHONE;
  if (tenantsBriefed === 0 && fallbackPhone) {
    const message = buildWhatsAppBriefing(data);
    await sendWhatsAppQueued(fallbackPhone, message, { tenantId: "main", context: "daily-digest:fallback" }).catch((err) => logger.error("[daily-digest] WhatsApp enqueue fallback failed", { error: String(err) }));
  }

  // ── 4. Email al admin (solo si hay ventas, como antes) ──────────────────
  if (data.totalOrders > 0) {
    sendDailyDigestEmail(data).catch((err) => {
      logger.error("[daily-digest] Email falló", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  return {
    sent: true,
    orders: data.totalOrders,
    revenue: data.totalRevenue,
    tenantsTotal,
    tenantsBriefed,
    whatsappFallbackSent: tenantsBriefed === 0 && !!fallbackPhone,
    emailSent: data.totalOrders > 0,
  };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await sendDigest();
    return NextResponse.json(result);
  } catch (e) {
    logger.error("[daily-digest] error", {
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Failed to send digest" }, { status: 500 });
  }
}
