import "server-only";
import nodemailer from "nodemailer";

interface SuperAdminAlert {
  subject: string;
  title: string;
  items: { label: string; value: string; color?: string }[];
  actionUrl?: string;
  actionLabel?: string;
}

/**
 * Send an email alert to the superadmin.
 * Uses SUPERADMIN_NOTIFY_EMAIL (falls back to SMTP_USER).
 */
export async function sendSuperAdminAlert(alert: SuperAdminAlert): Promise<void> {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpUser || !smtpPass) return;

  const to = process.env.SUPERADMIN_NOTIFY_EMAIL ?? smtpUser;

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const itemsHtml = alert.items
    .map(
      (i) =>
        `<tr>
          <td style="padding:6px 12px;font-size:13px;color:#999;border-bottom:1px solid #374151;">${i.label}</td>
          <td style="padding:6px 12px;font-size:13px;color:${i.color ?? "#fff"};font-weight:600;border-bottom:1px solid #374151;">${i.value}</td>
        </tr>`
    )
    .join("");

  const actionHtml = alert.actionUrl
    ? `<div style="text-align:center;margin:24px 0 8px;">
         <a href="${alert.actionUrl}" style="background:#6366f1;color:#fff;padding:10px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;">
           ${alert.actionLabel ?? "Ver en SuperAdmin"} →
         </a>
       </div>`
    : "";

  await transporter.sendMail({
    from: `"BSM Platform" <${smtpUser}>`,
    to,
    subject: alert.subject,
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:500px;margin:0 auto;background:#111827;border:1px solid #374151;border-radius:12px;overflow:hidden;">
        <div style="background:#6366f1;padding:20px 24px;">
          <h2 style="color:#fff;margin:0;font-size:18px;">${alert.title}</h2>
        </div>
        <div style="padding:20px 24px;">
          <table style="width:100%;border-collapse:collapse;">
            ${itemsHtml}
          </table>
          ${actionHtml}
        </div>
        <div style="padding:12px 24px;text-align:center;border-top:1px solid #374151;">
          <p style="margin:0;font-size:11px;color:#6b7280;">Bodega San Martín — Alerta de Plataforma</p>
        </div>
      </div>
    `,
  });
}
