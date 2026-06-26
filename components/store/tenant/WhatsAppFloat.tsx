import { MessageCircle } from "lucide-react";

/**
 * WhatsAppFloat — burbuja fija de WhatsApp en la tienda `/t/<slug>` (Brandon
 * 2026-06-26, Modo Creativo). El cliente pide en 1 toque. Server component
 * (es solo un enlace, sin interactividad). Se monta cuando el dueño la activa
 * y hay número. Verde oficial de WhatsApp (color de marca externa, no del DS).
 */
export default function WhatsAppFloat({
  phone,
  displayName,
  message,
}: {
  phone: string;
  displayName: string;
  message?: string;
}) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  const text = encodeURIComponent(message?.trim() || `Hola ${displayName}, quiero hacer un pedido.`);

  return (
    <a
      href={`https://wa.me/${digits}?text=${text}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Pedir por WhatsApp"
      className="fixed bottom-5 right-5 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full shadow-[var(--shadow-xl)] ring-1 ring-black/5 transition-transform hover:scale-105 active:scale-95"
      style={{ background: "#25D366" }}
    >
      <MessageCircle className="h-7 w-7 text-white" strokeWidth={2.25} aria-hidden />
      <span className="absolute inset-0 -z-10 animate-ping rounded-full opacity-30" style={{ background: "#25D366" }} />
    </a>
  );
}
