import "server-only";
import { avisoCorreoPlataformaActivo } from "@/lib/avisos-correo-plataforma";
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
  if (!(await avisoCorreoPlataformaActivo("superadmin"))) return;

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
         <a href="${alert.actionUrl}" style="background:#00A0A0;color:#fff;padding:10px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;">
           ${alert.actionLabel ?? "Ver en SuperAdmin"} →
         </a>
       </div>`
    : "";

  await transporter.sendMail({
    from: `"Buleje Platform" <${smtpUser}>`,
    to,
    subject: alert.subject,
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:500px;margin:0 auto;background:#111827;border:1px solid #374151;border-radius:12px;overflow:hidden;">
        <div style="background:#00A0A0;padding:20px 24px;">
          <h2 style="color:#fff;margin:0;font-size:18px;">${alert.title}</h2>
        </div>
        <div style="padding:20px 24px;">
          <table style="width:100%;border-collapse:collapse;">
            ${itemsHtml}
          </table>
          ${actionHtml}
        </div>
        <div style="padding:12px 24px;text-align:center;border-top:1px solid #374151;">
          <p style="margin:0;font-size:11px;color:#6b7280;">Buleje — Alerta de Plataforma</p>
        </div>
      </div>
    `,
  });
}

/** Texto del usuario dentro del HTML del correo: nunca crudo. */
function escaparHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface AvisoCorreccionGuia {
  tenantName: string;
  guiaNumero: string;
  /** «Libro TH» / «Guía de salida del CTP». */
  dondeEtiqueta: string;
  createdBy: string;
  motivo: string;
  cambios: readonly { etiqueta: string | null; clave: string; dice: string | null; correcto: string }[];
}

/**
 * ADR-512: un negocio pidió corregir una guía EMITIDA. Mismo correo de
 * plataforma (respeta el interruptor «superadmin» de avisos por correo); todo
 * lo que escribió el negocio va escapado.
 */
export async function avisarCorreccionGuiaAlSuperadmin(a: AvisoCorreccionGuia): Promise<void> {
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "https://buleje.pe").replace(/\/$/, "");
  const recorte = (v: string, n: number) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);
  const cambios = a.cambios.slice(0, 8).map((c) => ({
    label: escaparHtml(recorte(c.etiqueta ?? c.clave, 60)),
    value: `${escaparHtml(recorte(c.dice ?? "(en blanco)", 80))} → ${escaparHtml(recorte(c.correcto, 80))}`,
  }));
  if (a.cambios.length > 8) cambios.push({ label: "…", value: `y ${a.cambios.length - 8} cambio(s) más` });
  await sendSuperAdminAlert({
    subject: recorte(`Corrección de guía ${a.guiaNumero} — ${a.tenantName}`, 150),
    title: "Piden corregir una guía emitida",
    items: [
      { label: "Negocio", value: escaparHtml(a.tenantName) },
      { label: "Guía", value: `${escaparHtml(a.guiaNumero)} (${escaparHtml(a.dondeEtiqueta)})` },
      { label: "Pidió", value: escaparHtml(a.createdBy) },
      { label: "Motivo", value: escaparHtml(recorte(a.motivo, 400)) },
      ...cambios,
    ],
    actionUrl: `${base}/superadmin/support?kind=correccion_guia`,
    actionLabel: "Ver la solicitud",
  });
}
