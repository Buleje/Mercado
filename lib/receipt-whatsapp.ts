import "server-only";
import { cierreDelNegocio, conNombreDelNegocio, type FirmaNegocio } from "@/lib/admin/membrete";
import { MembreteDB } from "@/lib/db/membrete.db";
import { logger } from "@/lib/logger";

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

/**
 * El texto del recibo, firmado por el negocio que vendió (nombre, dirección y
 * su pie). Antes decía «Bodega Buleje, Pucallpa» en el recibo de cualquier
 * tienda; sin datos del negocio sale sin firma.
 */
export function buildReceiptText(order: ReceiptOrder, customerName: string, negocio?: FirmaNegocio | null): string {
  const lines = order.items.map((i) => {
    const unit = i.unit && i.unit !== "und" ? ` ${i.unit}` : "x";
    const subtotal = (i.price * i.quantity).toFixed(2);
    return `  • ${i.quantity}${unit} *${i.name}* — S/${subtotal}`;
  });

  const pay = order.paymentMethod
    ? `💳 Pago: ${PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}\n`
    : "";

  return (
    `🧾 *${conNombreDelNegocio("Recibo", negocio)}*\n` +
    `📅 ${formatDate(order.createdAt)}\n` +
    `🆔 Pedido #${shortId(order.id)}\n` +
    `━━━━━━━━━━━━━━━━\n` +
    lines.join("\n") + "\n" +
    `━━━━━━━━━━━━━━━━\n` +
    `💰 *Total: S/${order.total.toFixed(2)}*\n` +
    pay +
    `━━━━━━━━━━━━━━━━\n` +
    // El gracias con su nombre va siempre; después, quién vende y su pie.
    [`¡Gracias por tu compra, *${customerName}*! 🙏`, ...cierreDelNegocio(negocio, "")].join("\n")
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
 * Con `tenantId`, el recibo sale con el nombre, la dirección y el pie de ese
 * negocio (`MembreteDB`); sin él, sin firma (nunca con la de otro negocio).
 */
export async function sendReceiptByWhatsApp(
  order: ReceiptOrder,
  customerPhone: string,
  customerName: string,
  tenantId?: string,
): Promise<void> {
  const apiUrl = process.env.WHATSAPP_API_URL;
  const apiToken = process.env.WHATSAPP_API_TOKEN;

  // Si la API no está configurada, no hacer nada (no es un error)
  if (!apiUrl || !apiToken || !customerPhone) return;

  const negocio = tenantId
    ? await MembreteDB.del(tenantId).catch((err) => {
        logger.warn("[receipt-whatsapp] membrete failed", { tenantId, error: String(err) });
        return null;
      })
    : null;
  const message = buildReceiptText(order, customerName, negocio);
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
