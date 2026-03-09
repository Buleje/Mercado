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
}): Promise<void> {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpUser || !smtpPass) return; // silently skip if not configured

  const notifyEmail = process.env.NOTIFY_EMAIL || smtpUser;

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
    from: `"Bodega San Martín" <${smtpUser}>`,
    to: notifyEmail,
    subject: `🛒 Nuevo pedido — ${order.customerName} — S/${order.total.toFixed(2)}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">
        <div style="background:#2d6a4f;padding:20px 24px;">
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
                <th style="text-align:left;padding:6px 8px;color:#2d6a4f;">Producto</th>
                <th style="text-align:right;padding:6px 8px;color:#2d6a4f;">Subtotal</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
            <tfoot>
              <tr style="background:#f0fdf4;">
                <td style="padding:8px;font-weight:bold;color:#111;">Total</td>
                <td style="padding:8px;text-align:right;font-weight:bold;color:#2d6a4f;font-size:16px;">S/${order.total.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style="padding:12px 24px;border-top:1px solid #eee;text-align:center;">
          <p style="font-size:12px;color:#999;margin:0;">Bodega San Martín · Panel de administración</p>
        </div>
      </div>
    `,
  });
}
