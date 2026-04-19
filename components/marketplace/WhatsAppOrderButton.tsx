"use client";

import { MessageCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/* ── tipos ── */

export interface WhatsAppOrderItem {
  name: string;
  quantity: number;
  price: number;
  unit?: string | null;
}

interface Props {
  storeSlug: string;
  storeName: string;
  storePhone: string | null;
  items: WhatsAppOrderItem[];
  customerName?: string;
  customerAddress?: string;
  className?: string;
}

/* ── helpers ── */

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

/**
 * Normaliza el teléfono al formato requerido por wa.me:
 *  - Elimina espacios, guiones, paréntesis y el signo +
 *  - Si no empieza con "51" (código Perú), lo antepone
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("51")) return digits;
  return "51" + digits;
}

/**
 * Genera el cuerpo del mensaje en español natural (Pucallpa / Perú).
 */
export function buildWhatsAppMessage(
  storeName: string,
  items: WhatsAppOrderItem[],
  customerName?: string,
  customerAddress?: string,
): string {
  const lines: string[] = [
    `Hola! Quiero hacer este pedido en *${storeName}*:`,
    "",
  ];

  for (const item of items) {
    const unitLabel = item.unit ? ` ${item.unit}` : "";
    lines.push(`• ${item.quantity}x ${item.name}${unitLabel} — ${fmt(item.price * item.quantity)}`);
  }

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  lines.push("");
  lines.push(`*Total: ${fmt(total)}*`);
  lines.push("");
  lines.push("Mis datos:");
  lines.push(`- Nombre: ${customerName?.trim() || "—"}`);
  lines.push(`- Dirección: ${customerAddress?.trim() || "—"}`);
  lines.push("");
  lines.push("Gracias!");

  return lines.join("\n");
}

/* ── componente ── */

export default function WhatsAppOrderButton({
  storeSlug: _storeSlug,
  storeName,
  storePhone,
  items,
  customerName,
  customerAddress,
  className,
}: Props) {
  // Si no hay teléfono configurado, no renderizar nada
  if (!storePhone) return null;

  const handleClick = () => {
    const phone = normalizePhone(storePhone);
    const message = buildWhatsAppMessage(storeName, items, customerName, customerAddress);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener");

    // Fire-and-forget analytics — pérdida del evento no afecta UX (user ya abrió WhatsApp)
    fetch("/api/marketplace/analytics/whatsapp-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeSlug: _storeSlug, itemCount: items.length }),
    }).catch(() => {
      // Silent by design — analytics best-effort
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Pedir por WhatsApp a ${storeName}`}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-xl",
        "bg-[#25D366] hover:bg-[#1ebe5c] active:bg-[#17a34f]",
        "min-h-[44px] px-4 py-2.5 text-sm font-bold text-white",
        "transition-colors focus-visible:outline-2 focus-visible:outline-[#25D366]",
        className,
      )}
    >
      <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      Pedir por WhatsApp
    </button>
  );
}
