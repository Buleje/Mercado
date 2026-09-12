import { escapeHtml } from "./escape-html";
import { Resend } from "resend";

// Defensive init: si falta RESEND_API_KEY el constructor de Resend tira al
// instanciarse, lo que rompe el build estático de Next ("Failed to collect
// page data for /api/email/send"). Pattern espejado del fix PostHog en
// lib/analytics/posthog.ts. Si falta key, retornamos no-op silencioso.
const RESEND_KEY = process.env.RESEND_API_KEY;

type EmailSendArgs = {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
};

// Audit 2026-06-10 P1: shape del resultado del SDK Resend ({data,error}).
// Las funciones NUNCA rechazan (no-throw para fire-and-forget), pero ahora
// los fallos llegan al caller como { error } en vez de tragarse en silencio.
export type EmailSendResult =
  | { data?: { id: string } | null; error?: { message?: string } | null }
  | undefined;

interface EmailClient {
  emails: { send: (args: EmailSendArgs) => Promise<EmailSendResult> };
}

const noopClient: EmailClient = {
  emails: { send: async () => undefined },
};

const resend: EmailClient = RESEND_KEY
  ? (new Resend(RESEND_KEY) as unknown as EmailClient)
  : noopClient;

const FROM = process.env.RESEND_FROM_EMAIL || "Buleje <noreply@buleje.pe>";

export async function sendOrderConfirmation(to: string, order: { id: string; total: number; items: number }) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: `Pedido #${order.id} confirmado`,
    html: `
      <h2>Tu pedido fue confirmado</h2>
      <p><strong>Pedido:</strong> #${order.id}</p>
      <p><strong>Total:</strong> S/ ${order.total.toFixed(2)}</p>
      <p><strong>Productos:</strong> ${order.items} items</p>
      <p>Te avisaremos cuando este listo para recoger o en camino.</p>
    `,
  }).catch((err: unknown): EmailSendResult => ({
    // no-throw (regla #7) — pero el fallo ya no se traga: llega como {error}
    error: { message: String(err) },
  }));
}

export async function sendFiadoReminder(to: string, fiado: { customerName: string; amount: number; dueDate: string }) {
  // SECURITY 2026-05-06 (audit email #2): escapar customerName.
  const { escapeHtml } = await import("./escape-html");
  const safeName = escapeHtml(fiado.customerName);
  const safeDate = escapeHtml(fiado.dueDate);
  return resend.emails.send({
    from: FROM,
    to,
    subject: `Recordatorio de fiado — S/ ${fiado.amount.toFixed(2)}`,
    html: `
      <h2>Hola ${safeName}</h2>
      <p>Te recordamos que tienes un fiado pendiente de <strong>S/ ${fiado.amount.toFixed(2)}</strong>.</p>
      <p>Fecha limite: ${safeDate}</p>
      <p>Puedes pagar en la bodega o por Yape.</p>
    `,
  }).catch((err: unknown): EmailSendResult => ({
    // no-throw (regla #7) — pero el fallo ya no se traga: llega como {error}
    error: { message: String(err) },
  }));
}

export async function sendWelcomeTenant(to: string, tenant: { name: string; slug: string }) {
  // SECURITY 2026-05-06 (audit email #7): escapar tenant.name (controlado por
  // el usuario al registrar la tienda).
  const { escapeHtml } = await import("./escape-html");
  const safeName = escapeHtml(tenant.name);
  const safeSlug = encodeURIComponent(tenant.slug);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://www.buleje.pe";
  const adminUrl = `${baseUrl}/admin`;
  const storeUrl = `${baseUrl}/marketplace/${safeSlug}`;
  return resend.emails.send({
    from: FROM,
    to,
    subject: `🎉 ¡${safeName} ya está en Buleje!`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; color: #111;">
        <h1 style="font-size: 24px; margin: 0 0 12px;">¡Tu tienda fue aprobada! 🎉</h1>
        <p style="font-size: 16px; line-height: 1.5; margin: 0 0 16px;">
          Hola, <strong>${safeName}</strong> ya está visible en el Marketplace
          de Buleje. Los clientes pueden encontrarte y hacer pedidos directo a tu panel.
        </p>

        <h2 style="font-size: 18px; margin: 24px 0 8px;">Próximos pasos</h2>
        <ol style="font-size: 15px; line-height: 1.6; padding-left: 20px;">
          <li>Entrá a tu panel y revisá tus productos</li>
          <li>Configurá horarios y zonas de delivery</li>
          <li>Subí logo y banner para tu tienda</li>
          <li>Activá WhatsApp para recibir pedidos</li>
        </ol>

        <div style="margin: 32px 0; text-align: center;">
          <a href="${adminUrl}" style="display: inline-block; background: #00A0A0; color: white; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: bold; margin-right: 8px;">
            Entrar al panel
          </a>
          <a href="${storeUrl}" style="display: inline-block; background: #f3f4f6; color: #111; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: bold;">
            Ver mi tienda
          </a>
        </div>

        <p style="font-size: 14px; color: #666; line-height: 1.5; margin: 24px 0 0;">
          <strong>Recordá:</strong> tenés 15 días de prueba completa. Después podés
          elegir un plan en <a href="${baseUrl}/planes" style="color: #00A0A0;">${baseUrl}/planes</a>.
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 13px; color: #999; text-align: center; margin: 0;">
          ¿Necesitás ayuda? Escribinos por WhatsApp al +51 929 340 532.<br />
          Buleje · Pucallpa, Perú
        </p>
      </div>
    `,
  }).catch((err): EmailSendResult => {
    // no-throw (regla #7) — pero el fallo ya no se traga: llega como {error}
    if (process.env.NODE_ENV !== "production") {
      console.warn("[email] sendWelcomeTenant failed", err);
    }
    return { error: { message: String(err) } };
  });
}

/**
 * Aviso de plazos del Libro CTP por correo (Brandon, 2026-09-12: «avisos dentro
 * del sistema y además correo de aviso de vencimiento del lote»).
 *
 * El cron ya avisaba por la campana del panel y por WhatsApp. El correo suma el
 * canal que queda escrito y se reenvía al contador o al regente, que es a quién
 * termina llegando un vencimiento del libro.
 *
 * El cuerpo lo arma quien llama —el mismo texto del aviso, sin los emojis de
 * WhatsApp— y acá sólo se maqueta. Todo lo que viene de datos se escapa: los
 * códigos de lote y los nombres de especie los tipea una persona.
 */
export async function sendAvisoPlazosCtp(
  to: string,
  aviso: { titulo: string; resumen: string; lineas: readonly string[]; negocio?: string | null; urgente: boolean },
) {
  const lista = aviso.lineas.length
    ? `<ul style="margin:16px 0;padding-left:20px;line-height:1.7">${aviso.lineas
        .map((l) => `<li>${escapeHtml(l)}</li>`)
        .join("")}</ul>`
    : "";
  return resend.emails
    .send({
      from: FROM,
      to,
      subject: `${aviso.urgente ? "[Urgente] " : ""}${aviso.titulo}${aviso.negocio ? ` — ${aviso.negocio}` : ""}`,
      html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px">
        <h2 style="margin:0 0 4px">${escapeHtml(aviso.titulo)}</h2>
        <p style="margin:0 0 12px;color:#555">${escapeHtml(aviso.resumen)}</p>
        ${lista}
        <p style="margin:20px 0 0">
          <a href="https://buleje.pe/admin?tab=ctp-libro-operaciones"
             style="background:#00A0A0;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">
            Abrir el Libro CTP
          </a>
        </p>
        <p style="margin:16px 0 0;color:#888;font-size:12px">
          Este aviso sale del Libro de Operaciones CTP de tu panel.
        </p>
      </div>
    `,
    })
    .catch((err: unknown): EmailSendResult => ({
      error: { message: err instanceof Error ? err.message : String(err) },
    }));
}
