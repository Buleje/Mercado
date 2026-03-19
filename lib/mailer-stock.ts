import "server-only";
import nodemailer from "nodemailer";

type LowStockProduct = {
  name: string;
  stock: number;
  stockMin: number;
  category: string;
  unit: string;
};

/**
 * Sends a stock-alert email to the admin with a summary table
 * of products that have fallen below their minimum stock level.
 */
export async function sendStockAlertEmail(products: LowStockProduct[]): Promise<void> {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpUser || !smtpPass || products.length === 0) return;

  const notifyEmail = process.env.NOTIFY_EMAIL || smtpUser;

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const rowsHtml = products
    .map(
      (p) => `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;">${p.name}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:center;">${p.category}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:center;color:#dc2626;font-weight:bold;">${p.stock} ${p.unit}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:center;">${p.stockMin} ${p.unit}</td>
        </tr>`,
    )
    .join("");

  await transporter.sendMail({
    from: `"Bodega San Martín" <${smtpUser}>`,
    to: notifyEmail,
    subject: `⚠️ Alerta de stock bajo — ${products.length} producto${products.length > 1 ? "s" : ""}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">
        <div style="background:#dc2626;padding:20px 24px;">
          <h2 style="color:#fff;margin:0;font-size:18px;">⚠️ Alerta de Stock Bajo</h2>
          <p style="color:#fecaca;margin:4px 0 0;font-size:13px;">${products.length} producto${products.length > 1 ? "s necesitan" : " necesita"} reabastecimiento</p>
        </div>
        <div style="padding:16px 24px;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#fef2f2;">
                <th style="text-align:left;padding:8px 10px;color:#991b1b;font-size:12px;text-transform:uppercase;">Producto</th>
                <th style="text-align:center;padding:8px 10px;color:#991b1b;font-size:12px;text-transform:uppercase;">Categoría</th>
                <th style="text-align:center;padding:8px 10px;color:#991b1b;font-size:12px;text-transform:uppercase;">Stock actual</th>
                <th style="text-align:center;padding:8px 10px;color:#991b1b;font-size:12px;text-transform:uppercase;">Mínimo</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <div style="padding:16px 24px;background:#fef2f2;text-align:center;">
          <a href="${process.env.NEXT_PUBLIC_SITE_URL || "https://www.bodegasanmartin.pe"}/admin?tab=inventario"
             style="display:inline-block;background:#dc2626;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:bold;">
            Ver inventario
          </a>
        </div>
        <div style="padding:12px 24px;border-top:1px solid #eee;text-align:center;">
          <p style="font-size:12px;color:#999;margin:0;">Bodega San Martín · Sistema automático de alertas</p>
        </div>
      </div>
    `,
  });
}
