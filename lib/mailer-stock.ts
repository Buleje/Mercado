import "server-only";
import nodemailer from "nodemailer";
import { escapeHtml } from "@/lib/email/escape-html";

type LowStockProduct = {
  name: string;
  stock: number;
  stockMin: number;
  category: string;
  unit: string;
};

/** Producto que se agota pronto por su ritmo de venta (velocidad de 14 días). */
export type ProductoSeAgota = {
  name: string;
  stock: number;
  unit: string;
  daysLeft: number;
};

/** A quién va el correo de UNA tienda (21-10). Sin destino = el dueño de la plataforma. */
export type DestinoAvisoStock = {
  to: string;
  negocio: string;
};

/**
 * Correo de stock bajo con una tabla de los productos bajo su mínimo.
 *
 * Sin `destino`: el resumen de la plataforma a NOTIFY_EMAIL (o SMTP_USER).
 * Con `destino`: el de UNA tienda a su dueño, sólo con sus productos, más los
 * que se agotan pronto. Todo texto de la tienda o del producto va escapado.
 * Devuelve true si salió.
 */
export async function sendStockAlertEmail(
  products: LowStockProduct[],
  opciones: { destino?: DestinoAvisoStock; pronto?: ProductoSeAgota[] } = {},
): Promise<boolean> {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const pronto = opciones.pronto ?? [];
  if (!smtpUser || !smtpPass || (products.length === 0 && pronto.length === 0)) return false;

  const destino = opciones.destino;
  const to = destino?.to ?? (process.env.NOTIFY_EMAIL || smtpUser);
  const negocio = destino ? escapeHtml(destino.negocio) : null;

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
          <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;">${escapeHtml(p.name)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:center;">${escapeHtml(p.category)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:center;color:#dc2626;font-weight:bold;">${p.stock} ${escapeHtml(p.unit)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:center;">${p.stockMin} ${escapeHtml(p.unit)}</td>
        </tr>`,
    )
    .join("");

  const prontoHtml = pronto.length
    ? `
        <div style="padding:0 24px 16px;">
          <p style="font-size:13px;color:#92400e;font-weight:bold;margin:8px 0;">Se agotan pronto (por lo que se vende)</p>
          <table style="width:100%;border-collapse:collapse;">
            <tbody>${pronto
              .map(
                (p) => `
              <tr>
                <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;">${escapeHtml(p.name)}</td>
                <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:center;">${p.stock} ${escapeHtml(p.unit)}</td>
                <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:center;color:#b45309;">~${p.daysLeft} días</td>
              </tr>`,
              )
              .join("")}</tbody>
          </table>
        </div>`
    : "";

  const total = products.length + pronto.length;
  const asunto = products.length > 0
    ? `⚠️ Alerta de stock bajo — ${products.length} producto${products.length > 1 ? "s" : ""}`
    : `⚠️ ${pronto.length} producto${pronto.length > 1 ? "s se agotan" : " se agota"} pronto`;

  await transporter.sendMail({
    from: `"Buleje" <${smtpUser}>`,
    to,
    // El asunto no es HTML: el nombre va tal cual, sin saltos de línea.
    subject: destino ? `${asunto} — ${destino.negocio.replace(/[\r\n]+/g, " ").slice(0, 80)}` : asunto,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">
        <div style="background:#dc2626;padding:20px 24px;">
          <h2 style="color:#fff;margin:0;font-size:18px;">⚠️ Alerta de Stock Bajo${negocio ? ` — ${negocio}` : ""}</h2>
          <p style="color:#fecaca;margin:4px 0 0;font-size:13px;">${total} producto${total > 1 ? "s necesitan" : " necesita"} reabastecimiento</p>
        </div>
        ${products.length ? `<div style="padding:16px 24px;">
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
        </div>` : ""}
        ${prontoHtml}
        <div style="padding:16px 24px;background:#fef2f2;text-align:center;">
          <a href="${process.env.NEXT_PUBLIC_SITE_URL || "https://www.buleje.pe"}/admin?tab=inventario"
             style="display:inline-block;background:#dc2626;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:bold;">
            Ver inventario
          </a>
        </div>
        <div style="padding:12px 24px;border-top:1px solid #eee;text-align:center;">
          <p style="font-size:12px;color:#999;margin:0;">Buleje · Sistema automático de alertas</p>
        </div>
      </div>
    `,
  });
  return true;
}
