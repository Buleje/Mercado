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
  }).catch(() => {});
}

export async function sendFiadoReminder(to: string, fiado: { customerName: string; amount: number; dueDate: string }) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: `Recordatorio de fiado — S/ ${fiado.amount.toFixed(2)}`,
    html: `
      <h2>Hola ${fiado.customerName}</h2>
      <p>Te recordamos que tienes un fiado pendiente de <strong>S/ ${fiado.amount.toFixed(2)}</strong>.</p>
      <p>Fecha limite: ${fiado.dueDate}</p>
      <p>Puedes pagar en la bodega o por Yape.</p>
    `,
  }).catch(() => {});
}

export async function sendWelcomeTenant(to: string, tenant: { name: string; slug: string }) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: `Bienvenido a Buleje — ${tenant.name}`,
    html: `
      <h2>Bienvenido a Buleje</h2>
      <p>Tu bodega <strong>${tenant.name}</strong> ya esta lista.</p>
      <p>Entra a tu panel: <a href="https://buleje.pe/${tenant.slug}/admin">Panel de admin</a></p>
      <p>Empieza agregando tus productos y configura tus horarios.</p>
    `,
  }).catch(() => {});
}
