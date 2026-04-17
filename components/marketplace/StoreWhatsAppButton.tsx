"use client";

import { MessageCircle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StoreWhatsAppButtonProps {
  whatsappNumber: string | null | undefined;
  storeName: string;
  productName?: string;
  productSlug?: string;
  variant?: "primary" | "outline" | "icon";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Limpia el número: quita todo lo que no sea dígito.
 * Devuelve null si el resultado tiene menos de 7 dígitos (inválido).
 */
function cleanNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits;
}

function buildHref(digits: string, storeName: string, productName?: string): string {
  const text = productName
    ? `Hola! Me interesa el producto '${productName}' de ${storeName} en Buleje. ¿Esta disponible?`
    : `Hola! Tengo una consulta sobre la tienda ${storeName} en Buleje`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StoreWhatsAppButton({
  whatsappNumber,
  storeName,
  productName,
  productSlug,
  variant = "primary",
}: StoreWhatsAppButtonProps) {
  const digits = cleanNumber(whatsappNumber);

  // Número inválido o ausente → no renderiza nada
  if (!digits) return null;

  const href = buildHref(digits, storeName, productName);

  const handleClick = () => {
    fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "whatsapp.store.chat.opened",
        storeName,
        productSlug: productSlug ?? null,
      }),
    }).catch((err) => {
      // Fire-and-forget analytics — no bloquear al usuario si falla el endpoint
      if (typeof console !== "undefined") console.warn("[StoreWhatsAppButton] analytics failed", String(err));
    });
  };

  // ── Variante: icon ────────────────────────────────────────────────────────

  if (variant === "icon") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        aria-label="Chatear por WhatsApp"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <MessageCircle className="h-5 w-5" aria-hidden="true" />
      </a>
    );
  }

  // ── Variante: outline ─────────────────────────────────────────────────────

  if (variant === "outline") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-800"
      >
        <MessageCircle className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
        Chatear por WhatsApp
      </a>
    );
  }

  // ── Variante: primary (default) ───────────────────────────────────────────

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1fb958]"
    >
      <MessageCircle className="h-4 w-4" aria-hidden="true" />
      Chatear por WhatsApp
    </a>
  );
}
