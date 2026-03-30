"use client";

import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type WhatsAppContext =
  | { type: "order_ready"; orderId: string }
  | { type: "payment_reminder"; amount: number }
  | { type: "custom"; message: string };

interface WhatsAppButtonProps {
  phone: string;
  context: WhatsAppContext;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMessage(context: WhatsAppContext): string {
  switch (context.type) {
    case "order_ready":
      return `Hola! Tu pedido #${context.orderId} está listo para entrega/recojo. 🛍️`;
    case "payment_reminder":
      return `Hola! Te recordamos que tienes una deuda pendiente de S/ ${context.amount.toFixed(2)}. Por favor, acércate a regularizarla. Gracias!`;
    case "custom":
      return context.message;
  }
}

function sanitizePhone(phone: string): string {
  // Elimina todo excepto dígitos
  return phone.replace(/\D/g, "");
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WhatsAppButton({
  phone,
  context,
  label,
  size = "md",
  className,
}: WhatsAppButtonProps) {
  const message = buildMessage(context);
  const cleanPhone = sanitizePhone(phone);
  const href = `https://wa.me/51${cleanPhone}?text=${encodeURIComponent(message)}`;

  const defaultLabel =
    context.type === "order_ready"
      ? "Notificar pedido"
      : context.type === "payment_reminder"
      ? "Recordar deuda"
      : "WhatsApp";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 font-bold rounded-xl transition-colors",
        "bg-[#25D366] hover:bg-[#20bd5a] text-white",
        size === "sm"
          ? "px-2.5 py-1 text-[11px]"
          : "px-3.5 py-2 text-sm",
        className,
      )}
      title={`Enviar mensaje a ${phone}`}
    >
      <MessageCircle className={cn("shrink-0", size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} />
      {label ?? defaultLabel}
    </a>
  );
}

// Re-export the context type so consumers can import it alongside the component
export type { WhatsAppContext };
