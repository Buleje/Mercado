/**
 * WhatsApp Cloud API — Meta Business Messaging
 * Sends messages, templates, and catalog links via WhatsApp Business
 * Env: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

const WA_API = "https://graph.facebook.com/v21.0";
const WA_TOKEN = process.env.WHATSAPP_TOKEN || "";
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";

async function waFetch(endpoint: string, body: Record<string, unknown>) {
  if (!WA_TOKEN || !WA_PHONE_ID) return null;

  const res = await fetch(`${WA_API}/${WA_PHONE_ID}/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WA_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

/** Send a plain text message */
export async function sendTextMessage(to: string, text: string) {
  return waFetch("messages", {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to.replace(/\D/g, ""), // clean to digits only
    type: "text",
    text: { body: text },
  }).catch(() => {});
}

/** Send order confirmation with details */
export async function sendOrderConfirmation(
  to: string,
  order: { id: string; total: number; items: string[]; deliveryTime?: string }
) {
  const itemsList = order.items.slice(0, 10).join("\n• ");
  const text = [
    `✅ *Pedido #${order.id} confirmado*`,
    ``,
    `📦 Productos:`,
    `• ${itemsList}`,
    ``,
    `💰 Total: S/ ${order.total.toFixed(2)}`,
    order.deliveryTime ? `🚚 Entrega estimada: ${order.deliveryTime}` : "",
    ``,
    `Gracias por tu compra! 🙏`,
  ]
    .filter(Boolean)
    .join("\n");

  return sendTextMessage(to, text);
}

/** Send fiado reminder */
export async function sendFiadoReminder(
  to: string,
  data: { name: string; amount: number; dueDate: string }
) {
  const text = [
    `👋 Hola ${data.name}`,
    ``,
    `Te recordamos que tienes un fiado pendiente:`,
    `💰 Monto: S/ ${data.amount.toFixed(2)}`,
    `📅 Vence: ${data.dueDate}`,
    ``,
    `Puedes pagar en la bodega o por Yape.`,
    `Gracias! 🙏`,
  ].join("\n");

  return sendTextMessage(to, text);
}

/** Send welcome message to new customer */
export async function sendWelcome(to: string, storeName: string) {
  const text = [
    `🎉 Bienvenido a *${storeName}*!`,
    ``,
    `Ahora puedes:`,
    `📱 Ver nuestros productos`,
    `🛒 Hacer pedidos por WhatsApp`,
    `🚚 Recibir tu pedido en casa`,
    ``,
    `Escribe "catalogo" para ver nuestros productos.`,
    `Escribe "ayuda" si tienes alguna duda.`,
  ].join("\n");

  return sendTextMessage(to, text);
}
