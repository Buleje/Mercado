import "server-only";
import nodemailer from "nodemailer";

/**
 * Sends a new-order notification email.
 * Configure via environment variables in .env.local:
 *   SMTP_USER=bulejelauea@gmail.com
 *   SMTP_PASS=<Gmail App Password>
 *   NOTIFY_EMAIL=bulejelauea@gmail.com  (optional, defaults to SMTP_USER)
 */
export async function sendOrderNotification(order: {
  id: string;
  customerName: string;
  customerPhone?: string;
  customerLocation: string;
  total: number;
  paymentMethod?: string;
  items: { name: string; quantity: number; price: number; unit: string }[];
  tenantId?: string;
}): Promise<void> {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpUser || !smtpPass) return; // silently skip if not configured

  // Buscar email del dueño del tenant (si existe)
  let tenantEmail: string | null = null;
  let tenantName = "Mi Tienda";
  if (order.tenantId) {
    try {
      const { prisma } = await import("@/lib/prisma");
      const tenant = await prisma.tenant.findUnique({
        where: { slug: order.tenantId },
        select: { ownerEmail: true, name: true },
      });
      tenantEmail = tenant?.ownerEmail ?? null;
      tenantName = tenant?.name ?? tenantName;
    } catch { /* fallback a NOTIFY_EMAIL */ }
  }

  const notifyEmail = tenantEmail || process.env.NOTIFY_EMAIL || smtpUser;

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const itemsHtml = order.items
    .map(
      (i) =>
        `<tr>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;">${i.quantity}× ${i.name} (${i.unit})</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">S/${(i.price * i.quantity).toFixed(2)}</td>
        </tr>`
    )
    .join("");

  const paymentLabel =
    order.paymentMethod === "yape" ? "Yape" : order.paymentMethod === "efectivo" ? "Efectivo" : order.paymentMethod ?? "—";

  await transporter.sendMail({
    from: `"${tenantName}" <${smtpUser}>`,
    to: notifyEmail,
    subject: `🛒 Nuevo pedido — ${order.customerName} — S/${order.total.toFixed(2)}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">
        <div style="background:#0f766e;padding:20px 24px;">
          <h2 style="color:#fff;margin:0;font-size:18px;">🛒 Nuevo pedido recibido</h2>
          <p style="color:#a8d5ba;margin:4px 0 0;font-size:13px;">ID: ${order.id}</p>
        </div>
        <div style="padding:20px 24px;background:#f9fafb;">
          <h3 style="margin:0 0 8px;font-size:15px;color:#111;">Cliente</h3>
          <p style="margin:0;font-size:14px;color:#333;"><strong>${order.customerName}</strong></p>
          ${order.customerPhone ? `<p style="margin:2px 0;font-size:13px;color:#666;">📞 ${order.customerPhone}</p>` : ""}
          <p style="margin:2px 0;font-size:13px;color:#666;">📍 ${order.customerLocation}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#666;">💳 Pago: <strong>${paymentLabel}</strong></p>
        </div>
        <div style="padding:16px 24px;">
          <h3 style="margin:0 0 8px;font-size:15px;color:#111;">Productos</h3>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="background:#f0fdf4;">
                <th style="text-align:left;padding:6px 8px;color:#0f766e;">Producto</th>
                <th style="text-align:right;padding:6px 8px;color:#0f766e;">Subtotal</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
            <tfoot>
              <tr style="background:#f0fdf4;">
                <td style="padding:8px;font-weight:bold;color:#111;">Total</td>
                <td style="padding:8px;text-align:right;font-weight:bold;color:#0f766e;font-size:16px;">S/${order.total.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style="padding:12px 24px;border-top:1px solid #eee;text-align:center;">
          <p style="font-size:12px;color:#999;margin:0;">Buleje · Panel de administración</p>
        </div>
      </div>
    `,
  });
}

export async function sendCashSummaryEmail(summary: {
  registerId: string;
  openedAt: string;
  closedAt: string;
  openingAmount: number;
  closingAmount: number;
  expectedAmount: number;
  difference: number;
  salesEfectivo: number;
  salesDigital: number;
  salesCount: number;
  totalIn: number;
  totalOut: number;
  notes?: string;
}): Promise<void> {
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

  const diffColor = summary.difference >= 0 ? "#16a34a" : "#dc2626";
  const diffSign = summary.difference >= 0 ? "+" : "";
  const fmt = (n: number) => `S/${n.toFixed(2)}`;
  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
    catch { return iso; }
  };

  await transporter.sendMail({
    from: `"${tenantName}" <${smtpUser}>`,
    to: notifyEmail,
    subject: `🏦 Cierre de caja — ${fmtDate(summary.closedAt)} — ${fmt(summary.closingAmount)}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">
        <div style="background:#0a0f0d;padding:20px 24px;">
          <h2 style="color:#fff;margin:0;font-size:18px;">🏦 Resumen de Cierre de Caja</h2>
          <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">ID: ${summary.registerId}</p>
        </div>
        <div style="padding:16px 24px;background:#f8fafc;">
          <p style="margin:0 0 4px;font-size:13px;color:#64748b;">Apertura: <strong>${fmtDate(summary.openedAt)}</strong></p>
          <p style="margin:0;font-size:13px;color:#64748b;">Cierre: <strong>${fmtDate(summary.closedAt)}</strong></p>
        </div>
        <div style="padding:16px 24px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:8px 4px;color:#475569;">Fondo inicial</td>
              <td style="padding:8px 4px;text-align:right;font-weight:600;">${fmt(summary.openingAmount)}</td>
            </tr>
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:8px 4px;color:#475569;">Ventas efectivo (${summary.salesCount} pedidos)</td>
              <td style="padding:8px 4px;text-align:right;font-weight:600;color:#16a34a;">${fmt(summary.salesEfectivo)}</td>
            </tr>
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:8px 4px;color:#475569;">Ventas digital (Yape/etc.)</td>
              <td style="padding:8px 4px;text-align:right;font-weight:600;color:#0ea5e9;">${fmt(summary.salesDigital)}</td>
            </tr>
            ${summary.totalIn > 0 ? `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px 4px;color:#475569;">Ingresos manuales</td><td style="padding:8px 4px;text-align:right;color:#2563eb;">${fmt(summary.totalIn)}</td></tr>` : ""}
            ${summary.totalOut > 0 ? `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px 4px;color:#475569;">Egresos</td><td style="padding:8px 4px;text-align:right;color:#dc2626;">−${fmt(summary.totalOut)}</td></tr>` : ""}
            <tr style="border-bottom:2px solid #cbd5e1;background:#f1f5f9;">
              <td style="padding:10px 4px;font-weight:700;color:#0a0f0d;">Efectivo esperado</td>
              <td style="padding:10px 4px;text-align:right;font-weight:700;color:#0f766e;">${fmt(summary.expectedAmount)}</td>
            </tr>
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:8px 4px;color:#475569;">Efectivo contado</td>
              <td style="padding:8px 4px;text-align:right;font-weight:600;">${fmt(summary.closingAmount)}</td>
            </tr>
            <tr style="background:#f8fafc;">
              <td style="padding:10px 4px;font-weight:700;color:#0a0f0d;">Diferencia</td>
              <td style="padding:10px 4px;text-align:right;font-weight:700;color:${diffColor};">${diffSign}${fmt(summary.difference)}</td>
            </tr>
          </table>
          ${summary.notes ? `<div style="margin-top:12px;padding:10px;background:#fef9c3;border-radius:8px;font-size:13px;color:#854d0e;"><strong>Notas:</strong> ${summary.notes}</div>` : ""}
        </div>
        <div style="padding:12px 24px;border-top:1px solid #eee;text-align:center;">
          <p style="font-size:12px;color:#999;margin:0;">Buleje · Cierre de caja automático</p>
        </div>
      </div>
    `,
  });
}
