import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { prisma } from "@/lib/prisma";
import { enqueueEmail } from "@/lib/queue";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { toNumOrZero } from "@/lib/decimal-utils";

/**
 * GET /api/cron/weekly-email-report
 *
 * Lunes 7AM — Genera un reporte semanal HTML con KPIs y se lo envía
 * por email al dueño de cada tienda activa (ownerEmail del Tenant).
 *
 * KPIs: ventas totales, pedidos, ticket promedio, top 5 productos,
 * comparación vs semana anterior (↑ / ↓ / =).
 *
 * vercel.json: "0 7 * * 1" (cada lunes 7AM)
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("weekly-email-report", async () => {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - 7);
      const prevWeekStart = new Date(weekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);

      const tenants = await prisma.tenant.findMany({
        where: { active: true, ownerEmail: { not: null } },
        select: { id: true, slug: true, name: true, ownerEmail: true },
      });

      let emailsSent = 0;

      for (const tenant of tenants) {
        if (!tenant.ownerEmail) continue;

        const tenantIds = tenant.id === tenant.slug
          ? [tenant.id]
          : [tenant.id, tenant.slug];

        // Current week orders
        // OrderItem no tiene campo subtotal en el schema — lo calculamos con price * quantity
        const thisWeekOrders = await prisma.order.findMany({
          where: {
            tenantId: { in: tenantIds },
            deletedAt: null,
            createdAt: { gte: weekStart },
          },
          include: {
            items: { select: { productId: true, name: true, quantity: true, price: true } },
          },
        });

        // Previous week orders (for comparison)
        const prevWeekOrders = await prisma.order.findMany({
          where: {
            tenantId: { in: tenantIds },
            deletedAt: null,
            createdAt: { gte: prevWeekStart, lt: weekStart },
          },
          select: { total: true },
        });

        // Calculate KPIs
        const totalRevenue = thisWeekOrders.reduce((s, o) => s + toNumOrZero(o.total), 0);
        const totalOrders = thisWeekOrders.length;
        const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        const prevRevenue = prevWeekOrders.reduce((s, o) => s + toNumOrZero(o.total), 0);
        const prevOrders = prevWeekOrders.length;

        const revenueChange = prevRevenue > 0
          ? ((totalRevenue - prevRevenue) / prevRevenue * 100)
          : (totalRevenue > 0 ? 100 : 0);
        const ordersChange = prevOrders > 0
          ? ((totalOrders - prevOrders) / prevOrders * 100)
          : (totalOrders > 0 ? 100 : 0);

        // Top 5 products
        const productSales = new Map<string, { name: string; qty: number; revenue: number }>();
        for (const order of thisWeekOrders) {
          for (const item of order.items) {
            const key = String(item.productId);
            const existing = productSales.get(key) ?? { name: item.name ?? "Producto", qty: 0, revenue: 0 };
            existing.qty += item.quantity;
            existing.revenue += toNumOrZero(item.price) * (item.quantity ?? 0);
            productSales.set(key, existing);
          }
        }
        const topProducts = [...productSales.values()]
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);

        // New customers this week
        const newCustomers = await prisma.customer.count({
          where: {
            tenantId: { in: tenantIds },
            createdAt: { gte: weekStart },
          },
        });

        // Build HTML email
        const html = buildWeeklyReportHtml({
          tenantName: tenant.name,
          weekLabel: `${weekStart.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })} — ${now.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}`,
          totalRevenue,
          totalOrders,
          avgTicket,
          revenueChange,
          ordersChange,
          topProducts,
          newCustomers,
        });

        // Enqueue email via the send-email worker
        enqueueEmail({
          tenantId: tenant.id,
          to: tenant.ownerEmail!,
          subject: `📊 Reporte semanal — ${tenant.name}`,
          html,
        }).catch((err) => logger.error("[cron/weekly-email-report] email enqueue failed", { error: String(err), tenantId: tenant.id }));

        emailsSent++;

        logActivity(
          "cron:weekly-email-report",
          "notifications",
          `Reporte semanal enviado a ${tenant.ownerEmail}`,
          undefined,
          "system",
          undefined,
          tenant.slug,
        ).catch((err) => logger.warn("[cron] activity log failed", { error: String(err) }));
      }

      return { emailsSent, tenantsProcessed: tenants.length };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("cron-weekly-email-report-error", { error: err });
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// ── HTML email builder ────────────────────────────────────────────────────────

function buildWeeklyReportHtml(data: {
  tenantName: string;
  weekLabel: string;
  totalRevenue: number;
  totalOrders: number;
  avgTicket: number;
  revenueChange: number;
  ordersChange: number;
  topProducts: Array<{ name: string; qty: number; revenue: number }>;
  newCustomers: number;
}): string {
  const fmt = (n: number) => `S/ ${n.toFixed(2)}`;
  const arrow = (pct: number) => pct > 0 ? `↑ ${pct.toFixed(1)}%` : pct < 0 ? `↓ ${Math.abs(pct).toFixed(1)}%` : "= 0%";
  const arrowColor = (pct: number) => pct > 0 ? "#10b981" : pct < 0 ? "#ef4444" : "#6b7280";

  const topProductsRows = data.topProducts.length > 0
    ? data.topProducts.map((p, i) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${i + 1}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${p.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right">${p.qty}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right">${fmt(p.revenue)}</td>
        </tr>`).join("")
    : `<tr><td colspan="4" style="padding:12px;text-align:center;color:#9ca3af">Sin ventas esta semana</td></tr>`;

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:20px">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#2563EB,#0d9488);border-radius:16px 16px 0 0;padding:32px 24px;text-align:center">
      <h1 style="color:white;margin:0;font-size:24px">📊 Reporte Semanal</h1>
      <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px">${data.tenantName} — ${data.weekLabel}</p>
    </div>

    <!-- KPI Cards -->
    <div style="background:white;padding:24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr>
          <td style="padding:12px;text-align:center;width:33%">
            <div style="font-size:28px;font-weight:700;color:#111827">${fmt(data.totalRevenue)}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px">Ventas totales</div>
            <div style="font-size:12px;color:${arrowColor(data.revenueChange)};margin-top:2px;font-weight:600">${arrow(data.revenueChange)} vs semana anterior</div>
          </td>
          <td style="padding:12px;text-align:center;width:33%">
            <div style="font-size:28px;font-weight:700;color:#111827">${data.totalOrders}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px">Pedidos</div>
            <div style="font-size:12px;color:${arrowColor(data.ordersChange)};margin-top:2px;font-weight:600">${arrow(data.ordersChange)} vs semana anterior</div>
          </td>
          <td style="padding:12px;text-align:center;width:33%">
            <div style="font-size:28px;font-weight:700;color:#111827">${fmt(data.avgTicket)}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px">Ticket promedio</div>
          </td>
        </tr>
      </table>

      <!-- New customers -->
      <div style="margin-top:16px;padding:12px 16px;background:#f0fdf4;border-radius:8px;text-align:center">
        <span style="font-size:14px;color:#166534">👥 <strong>${data.newCustomers}</strong> clientes nuevos esta semana</span>
      </div>
    </div>

    <!-- Top Products -->
    <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px">
      <h2 style="font-size:16px;color:#111827;margin:0 0 16px">🏆 Top 5 Productos</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f9fafb">
            <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">#</th>
            <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">Producto</th>
            <th style="padding:8px 12px;text-align:right;color:#6b7280;font-weight:600">Uds.</th>
            <th style="padding:8px 12px;text-align:right;color:#6b7280;font-weight:600">Ventas</th>
          </tr>
        </thead>
        <tbody>${topProductsRows}</tbody>
      </table>
    </div>

    <!-- Footer -->
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:24px">
      Este reporte se genera automáticamente cada lunes.<br>
      Responde a este email si tienes preguntas.
    </p>
  </div>
</body>
</html>`;
}
