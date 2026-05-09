import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
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
  }).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
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
  }).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
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
          <a href="${adminUrl}" style="display: inline-block; background: #00B4A6; color: white; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: bold; margin-right: 8px;">
            Entrar al panel
          </a>
          <a href="${storeUrl}" style="display: inline-block; background: #f3f4f6; color: #111; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: bold;">
            Ver mi tienda
          </a>
        </div>

        <p style="font-size: 14px; color: #666; line-height: 1.5; margin: 24px 0 0;">
          <strong>Recordá:</strong> tenés 15 días de prueba completa. Después podés
          elegir un plan en <a href="${baseUrl}/planes" style="color: #00B4A6;">${baseUrl}/planes</a>.
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 13px; color: #999; text-align: center; margin: 0;">
          ¿Necesitás ayuda? Escribinos por WhatsApp al +51 916 409 675.<br />
          Buleje · Pucallpa, Perú
        </p>
      </div>
    `,
  }).catch((err) => {
    // Logger silencioso — el envio es fire-and-forget desde el caller.
    if (process.env.NODE_ENV !== "production") {
      console.warn("[email] sendWelcomeTenant failed", err);
    }
  });
}
