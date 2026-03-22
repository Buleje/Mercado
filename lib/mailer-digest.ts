import "server-only";
import nodemailer from "nodemailer";

type DigestData = {
  date: string;
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  pendingOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  topProducts: { name: string; qty: number }[];
  paymentBreakdown: { method: string; count: number; total: number }[];
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
    from: `"Bodega San Martín" <${smtpUser}>`,
    to: notifyEmail,
    subject: `📊 Resumen diario — ${data.date} — S/${data.totalRevenue.toFixed(2)}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">
        <div style="background:#2d6a4f;padding:20px 24px;">
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
            <thead><tr style="background:#f5f3ff;"><th style="text-align:left;padding:4px 8px;font-size:12px;color:#2d6a4f;">Método</th><th style="text-align:center;padding:4px 8px;font-size:12px;color:#2d6a4f;">Pedidos</th><th style="text-align:right;padding:4px 8px;font-size:12px;color:#2d6a4f;">Total</th></tr></thead>
            <tbody>${paymentHtml}</tbody>
          </table>` : ""}
        </div>

        <div style="padding:12px 24px;border-top:1px solid #eee;text-align:center;">
          <p style="font-size:12px;color:#999;margin:0;">Bodega San Martín · Resumen automático</p>
        </div>
      </div>
    `,
  });
}
