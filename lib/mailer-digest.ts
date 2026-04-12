import "server-only";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";

export type DigestData = {
  date: string;
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  pendingOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  topProducts: { name: string; qty: number }[];
  paymentBreakdown: { method: string; count: number; total: number }[];
  stockAlert?: string | null;
  tenantName?: string;
};

export async function sendDailyDigestEmail(data: DigestData): Promise<void> {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpUser || !smtpPass) return;

  const notifyEmail = process.env.NOTIFY_EMAIL || smtpUser;

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const topProductsHtml = data.topProducts.length
    ? data.topProducts
        .map(
          (p, i) =>
            `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:13px;">${i + 1}. ${p.name}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;font-size:13px;">${p.qty} uds</td></tr>`
        )
        .join("")
    : '<tr><td colspan="2" style="padding:8px;color:#999;font-size:13px;">Sin ventas</td></tr>';

  const paymentHtml = data.paymentBreakdown
    .map(
      (p) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:13px;">${p.method}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center;font-size:13px;">${p.count}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;font-size:13px;">S/${p.total.toFixed(2)}</td></tr>`
    )
    .join("");

  await transporter.sendMail({
    from: `"Buleje" <${smtpUser}>`,
    to: notifyEmail,
    subject: `📊 Resumen diario — ${data.date} — S/${data.totalRevenue.toFixed(2)}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">
        <div style="background:#00B4A6;padding:20px 24px;">
          <h2 style="color:#fff;margin:0;font-size:18px;">📊 Resumen del día</h2>
          <p style="color:#c4b5fd;margin:4px 0 0;font-size:13px;">${data.date}</p>
        </div>

        <div style="padding:20px 24px;">
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
            <tr>
              <td style="padding:12px;background:#f0fdf4;border-radius:8px;text-align:center;width:25%;">
                <div style="font-size:22px;font-weight:bold;color:#16a34a;">${data.totalOrders}</div>
                <div style="font-size:11px;color:#666;margin-top:2px;">Pedidos</div>
              </td>
              <td style="padding:12px;background:#eff6ff;border-radius:8px;text-align:center;width:25%;">
                <div style="font-size:22px;font-weight:bold;color:#2563eb;">S/${data.totalRevenue.toFixed(2)}</div>
                <div style="font-size:11px;color:#666;margin-top:2px;">Ingresos</div>
              </td>
              <td style="padding:12px;background:#fefce8;border-radius:8px;text-align:center;width:25%;">
                <div style="font-size:22px;font-weight:bold;color:#ca8a04;">${data.deliveredOrders}</div>
                <div style="font-size:11px;color:#666;margin-top:2px;">Entregados</div>
              </td>
              <td style="padding:12px;background:#fef2f2;border-radius:8px;text-align:center;width:25%;">
                <div style="font-size:22px;font-weight:bold;color:#dc2626;">${data.pendingOrders}</div>
                <div style="font-size:11px;color:#666;margin-top:2px;">Pendientes</div>
              </td>
            </tr>
          </table>

          ${data.avgOrderValue > 0 ? `<p style="font-size:13px;color:#666;margin:0 0 16px;">Ticket promedio: <strong>S/${data.avgOrderValue.toFixed(2)}</strong></p>` : ""}

          <h3 style="font-size:14px;color:#111;margin:0 0 8px;">🏆 Top productos</h3>
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">${topProductsHtml}</table>

          ${paymentHtml ? `
          <h3 style="font-size:14px;color:#111;margin:0 0 8px;">💳 Métodos de pago</h3>
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr style="background:#f5f3ff;"><th style="text-align:left;padding:4px 8px;font-size:12px;color:#00B4A6;">Método</th><th style="text-align:center;padding:4px 8px;font-size:12px;color:#00B4A6;">Pedidos</th><th style="text-align:right;padding:4px 8px;font-size:12px;color:#00B4A6;">Total</th></tr></thead>
            <tbody>${paymentHtml}</tbody>
          </table>` : ""}
        </div>

        <div style="padding:12px 24px;border-top:1px solid #eee;text-align:center;">
          <p style="font-size:12px;color:#999;margin:0;">Buleje · Resumen automático</p>
        </div>
      </div>
    `,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// WhatsApp Daily Digest — Roadmap item #5 (daily-briefing-whatsapp-dueno)
// ════════════════════════════════════════════════════════════════════════════
//
// Sends a daily briefing via WhatsApp to the tenant owner's phone. Unlike the
// email digest, this ALWAYS sends (even on zero-sales days) to satisfy the
// onboarding Step 5 promise: "te mandaremos resumen por WhatsApp". Silence on
// zero-sales days was masking stores that stopped operating — we want the
// owner to be nudged.
//
// Feature flag: `DAILY_DIGEST_WA_ENABLED` (default: enabled). Set to "false"
// to disable WhatsApp delivery while keeping email intact (gradual rollout).

/** Build a plain-text WhatsApp briefing from digest data. */
export function buildDailyDigestWhatsAppMessage(data: DigestData): string {
  const tenantLabel = data.tenantName ? ` — ${data.tenantName}` : "";

  if (data.totalOrders === 0) {
    return [
      `📊 *Resumen de hoy*${tenantLabel}`,
      `${data.date}`,
      ``,
      `Hoy no se registraron ventas. ¿Todo bien?`,
      `Responde este mensaje para revisar.`,
      ``,
      `— Buleje`,
    ].join("\n");
  }

  const topProduct = data.topProducts[0];
  const topLine = topProduct
    ? `🏆 Top producto: *${topProduct.name}* (${topProduct.qty} uds)`
    : "";
  const alertLine = data.stockAlert ? `\n⚠️ ${data.stockAlert}` : "";

  return [
    `📊 *Resumen de hoy*${tenantLabel}`,
    `${data.date}`,
    ``,
    `💰 Ventas: *S/${data.totalRevenue.toFixed(2)}*`,
    `📦 Órdenes: *${data.totalOrders}* (${data.deliveredOrders} entregadas)`,
    topLine,
    alertLine,
    ``,
    `— Buleje`,
  ].filter(Boolean).join("\n");
}

/** Compute digest data for a specific tenant (orders in the last 24h, Lima TZ). */
async function buildDigestDataForTenant(tenantId: string, tenantName?: string): Promise<DigestData> {
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
    where: { tenantId, createdAt: { gte: startUTC, lt: endUTC } },
    include: { items: true },
  });

  const delivered = orders.filter((o) => o.status === "entregado").length;
  const cancelled = orders.filter((o) => o.status === "cancelado").length;
  const pending = orders.filter((o) => o.status !== "entregado" && o.status !== "cancelado").length;
  const totalRevenue = orders
    .filter((o) => o.status !== "cancelado")
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

  // Stock alert: count products flagged as low/critical for this tenant.
  let stockAlert: string | null = null;
  try {
    const lowStock = await prisma.product.count({
      where: { tenantId, stock: { lte: 5 } },
    });
    if (lowStock > 0) stockAlert = `${lowStock} productos con stock crítico`;
  } catch {
    // Non-fatal: schema may not expose `stock` in all environments.
    stockAlert = null;
  }

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
    stockAlert,
    tenantName,
  };
}

/**
 * Send the daily digest via WhatsApp to a tenant's owner phone.
 *
 * - Respects the `DAILY_DIGEST_WA_ENABLED` feature flag ("false" disables).
 * - Always sends, even on zero-sales days (explicitly requested in Roadmap #5).
 * - Fire-and-forget safe: returns a structured result instead of throwing.
 */
export async function sendDailyDigestWhatsApp(
  tenantId: string,
): Promise<{ sent: boolean; reason?: string }> {
  // Feature flag gate
  const flag = process.env.DAILY_DIGEST_WA_ENABLED;
  if (flag && flag.toLowerCase() === "false") {
    return { sent: false, reason: "flag_disabled" };
  }

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, ownerPhone: true, active: true },
    });

    if (!tenant) return { sent: false, reason: "tenant_not_found" };
    if (!tenant.active) return { sent: false, reason: "tenant_inactive" };

    const phone =
      tenant.ownerPhone ??
      process.env.NOTIFY_PHONE ??
      process.env.WHATSAPP_OWNER_PHONE ??
      null;

    if (!phone) return { sent: false, reason: "no_phone" };

    const data = await buildDigestDataForTenant(tenant.id, tenant.name);
    const message = buildDailyDigestWhatsAppMessage(data);

    const ok = await sendWhatsAppText(phone, message);
    if (!ok) return { sent: false, reason: "whatsapp_not_configured" };

    return { sent: true };
  } catch (err) {
    logger.error("[daily-digest] sendDailyDigestWhatsApp failed", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { sent: false, reason: "error" };
  }
}
