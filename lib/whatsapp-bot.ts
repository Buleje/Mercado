import "server-only";

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 9 ? `51${digits}` : digits;
}

export async function sendBotReply(phone: string, message: string): Promise<boolean> {
  if (!WHATSAPP_API_URL || !WHATSAPP_API_TOKEN) return false;
  const res = await fetch(WHATSAPP_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${WHATSAPP_API_TOKEN}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to: formatPhone(phone), type: "text", text: { body: message } }),
  });
  return res.ok;
}

export async function sendInteractiveButtons(phone: string, body: string, buttons: { id: string; title: string }[]): Promise<boolean> {
  if (!WHATSAPP_API_URL || !WHATSAPP_API_TOKEN) return false;
  const res = await fetch(WHATSAPP_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${WHATSAPP_API_TOKEN}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: formatPhone(phone),
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: { buttons: buttons.slice(0, 3).map(b => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })) },
      },
    }),
  });
  return res.ok;
}

export function formatCatalog(products: { name: string; price: number; stock: number }[]): string {
  const lines = products.map((p, i) => `${i + 1}. *${p.name}* — S/${p.price.toFixed(2)} ${p.stock > 0 ? `(${p.stock} disp.)` : "⛔ Agotado"}`);
  return `🏪 *Buleje — Catálogo*\n━━━━━━━━━━━━━━━━━━━\n${lines.join("\n")}\n━━━━━━━━━━━━━━━━━━━\n📝 Escribe "QUIERO 2 arroz, 1 aceite" para pedir\n💬 O escribe "PRECIO arroz" para consultar`;
}

export function formatOrderDetail(order: { id: string; status: string; total: number; items: { name: string; quantity: number; price: number }[] }): string {
  const shortId = order.id.slice(-8).toUpperCase();
  const statusEmoji: Record<string, string> = { pendiente: "⏳", confirmado: "✅", en_camino: "🛵", entregado: "🎉", cancelado: "❌" };
  const itemLines = order.items.map(i => `  • ${i.quantity}x *${i.name}* — S/${(i.price * i.quantity).toFixed(2)}`).join("\n");
  return `🏪 *Buleje*\n━━━━━━━━━━━━━━━━━━━\n${statusEmoji[order.status] || "📋"} Pedido #${shortId}\nEstado: *${order.status.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━━\n${itemLines}\n\n💰 *Total: S/${order.total.toFixed(2)}*`;
}

export function formatWelcome(): string {
  return `🏪 *¡Hola! Soy el asistente de Buleje* 👋\n\nPuedo ayudarte con:\n\n📋 *CATALOGO* — Ver productos y precios\n💰 *PRECIO* [producto] — Consultar precio\n🛒 *QUIERO* 2 arroz, 1 azúcar — Hacer pedido\n✅ *CONFIRMO* — Confirmar pedido pendiente\n📦 *ESTADO* — Ver mis pedidos\n💳 *PAGO* — Instrucciones de pago\n\n_Escribe cualquier opción para comenzar_`;
}

export function formatPaymentInstructions(): string {
  return `🏪 *Buleje — Métodos de Pago*\n━━━━━━━━━━━━━━━━━━━\n\n📱 *Yape:* 916 409 675\n   Nombre: Buleje\n\n💵 *Efectivo:* Pagas al recibir tu pedido\n\n🏦 *Transferencia:*\n   BCP / Interbank\n   Consultar número de cuenta\n\n━━━━━━━━━━━━━━━━━━━\n✅ Después de pagar por Yape, envía captura aquí\n📝 O escribe CONFIRMO para confirmar tu pedido`;
}
