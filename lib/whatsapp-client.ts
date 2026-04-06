/**
 * Genera URL de WhatsApp con mensaje de pedido de compra
 */
export function buildPurchaseWhatsAppUrl(params: {
  phone?: string | null;
  businessName?: string;
  items: Array<{ name: string; quantity: number; unit: string }>;
  total: number;
  deliveryDate?: string;
  paymentMethod?: string;
}): string {
  const lines = params.items.map(i => `• ${i.quantity}x ${i.name} (${i.unit})`);
  const text = [
    `Hola! Soy ${params.businessName || "Buleje"}.`,
    `Te hago el siguiente pedido:`,
    ...lines,
    `TOTAL: S/${params.total.toFixed(2)}`,
    params.deliveryDate ? `Entrega: ${params.deliveryDate}` : null,
    params.paymentMethod ? `Pago: ${params.paymentMethod}` : null,
    `Gracias!`,
  ].filter(Boolean).join("\n");

  const phone = (params.phone || "").replace(/\D/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
