"use client";

/**
 * CompartirListaWhatsApp — Botón que arma un mensaje de WhatsApp con la
 * lista de items del carrito para que el cliente lo envíe a su familia
 * y consensúen lo que falta. Ideal para casos familiares en Pucallpa.
 *
 * Recibe la lista directa (los items del cart context) — no toca el cart
 * para no acoplar lógica.
 */

import { useState, useCallback } from "react";
import { Share2 } from "lucide-react";

interface SimpleCartItem {
  name: string;
  quantity: number;
  price: number;
  storeName?: string;
}

interface CompartirListaWhatsAppProps {
  items: SimpleCartItem[];
  /** Si querés agregar un encabezado custom (ej. nombre de la tienda) */
  heading?: string;
  /** Texto del botón */
  label?: string;
  className?: string;
  /**
   * Brandon 2026-05-18: variante icon-only (40px circular) para mostrar
   * en headers donde el botón verde full-width compete con CTAs primarios.
   * Mantiene a11y via aria-label.
   */
  compact?: boolean;
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(n);
}

function buildMessage(items: SimpleCartItem[], heading?: string): string {
  const lines: string[] = [];
  if (heading) {
    lines.push(`*${heading}*`);
    lines.push("");
  } else {
    lines.push("🛒 *Mi lista de compras Buleje*");
    lines.push("");
  }
  let total = 0;
  for (const it of items) {
    const subtotal = it.price * it.quantity;
    total += subtotal;
    lines.push(
      `• ${it.quantity}× ${it.name}${it.storeName ? ` (${it.storeName})` : ""} — ${fmtCurrency(subtotal)}`,
    );
  }
  lines.push("");
  lines.push(`*Total: ${fmtCurrency(total)}*`);
  lines.push("");
  lines.push("👉 ¿Falta algo? Avisame antes que cierre el pedido.");
  lines.push("");
  lines.push("Comprá en Buleje: https://buleje.pe/tiendas");
  return lines.join("\n");
}

export default function CompartirListaWhatsApp({
  items,
  heading,
  label = "Compartir lista por WhatsApp",
  className,
  compact = false,
}: CompartirListaWhatsAppProps) {
  const [opening, setOpening] = useState(false);

  const handleShare = useCallback(() => {
    if (items.length === 0) return;
    const text = buildMessage(items, heading);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    setOpening(true);
    window.open(url, "_blank", "noopener");
    setTimeout(() => setOpening(false), 800);
  }, [items, heading]);

  if (items.length === 0) return null;

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleShare}
        disabled={opening}
        aria-label={label}
        className={
          className ??
          "inline-flex items-center justify-center h-10 w-10 rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[#25D366] hover:border-[#25D366] hover:bg-[#25D366]/10 active:scale-95 disabled:opacity-60 transition-all"
        }
      >
        <Share2 className="h-4 w-4" strokeWidth={2.25} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={opening}
      aria-label={label}
      className={
        className ??
        "inline-flex items-center gap-2 rounded-full bg-[var(--data-success-500)] text-white px-4 py-2.5 text-sm font-bold hover:bg-[var(--data-success-600)] disabled:opacity-60 transition-colors"
      }
    >
      <Share2 className="h-4 w-4" strokeWidth={2.25} />
      {label}
    </button>
  );
}
