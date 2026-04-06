import "server-only";

type ReceiptItem = {
  name: string;
  quantity: number;
  price: number;
  unit?: string;
};

type ReceiptOrder = {
  id: string;
  items: ReceiptItem[];
  total: number;
  paymentMethod?: string;
  createdAt?: string;
};

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo 💵",
  yape: "Yape 📱",
  plin: "Plin 📲",
  tarjeta: "Tarjeta 💳",
};

function shortId(id: string): string {
  return id.slice(-8).toUpperCase();
}

function formatDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildReceiptText(order: ReceiptOrder, customerName: string): string {
  const lines = order.items.map((i) => {
    const unit = i.unit && i.unit !== "und" ? ` ${i.unit}` : "x";
    const subtotal = (i.price * i.quantity).toFixed(2);
    return `  • ${i.quantity}${unit} *${i.name}* — S/${subtotal}`;
  });

  const pay = order.paymentMethod
    ? `💳 Pago: ${PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}\n`
    : "";

  return (
    `🧾 *Recibo — Buleje*\n` +
    `📅 ${formatDate(order.createdAt)}\n` +
    `🆔 Pedido #${shortId(order.id)}\n` +
    `━━━━━━━━━━━━━━━━\n` +
    lines.join("\n") + "\n" +
    `━━━━━━━━━━━━━━━━\n` +
    `💰 *Total: S/${order.total.toFixed(2)}*\n` +
    pay +
    `━━━━━━━━━━━━━━━━\n` +
    `¡Gracias por tu compra, *${customerName}*! 🙏\n` +
    `_— Bodega Buleje, Pucallpa_`
  );
}

/** Formato de phone para WhatsApp Business API (agrega prefijo 51 si tiene 9 dígitos) */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 9 ? `51${digits}` : digits;
}

/**
 * Envía el recibo de compra por WhatsApp al cliente.
 * Requiere WHATSAPP_API_URL y WHATSAPP_API_TOKEN en el entorno.
 * Si no están configuradas, retorna silenciosamente.
 * Uso: sendReceiptByWhatsApp(...).catch(() => {})
 */
export async function sendReceiptByWhatsApp(
  order: ReceiptOrder,
  customerPhone: string,
  customerName: string,
): Promise<void> {
  const apiUrl = process.env.WHATSAPP_API_URL;
  const apiToken = process.env.WHATSAPP_API_TOKEN;

  // Si la API no está configurada, no hacer nada (no es un error)
  if (!apiUrl || !apiToken || !customerPhone) return;

  const message = buildReceiptText(order, customerName);
  const phone = formatPhone(customerPhone);

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: message },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhatsApp receipt error: ${res.status} ${text}`);
  }
}
