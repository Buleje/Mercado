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
  position = "right",
  bubbleText,
}: {
  phone: string;
  displayName: string;
  message?: string;
  // Lote C (Brandon 2026-06-27): posición + texto de burbuja configurables.
  position?: "right" | "left";
  bubbleText?: string;
}) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  const text = encodeURIComponent(message?.trim() || `Hola ${displayName}, quiero hacer un pedido.`);
  const side = position === "left" ? "left-5 flex-row-reverse" : "right-5";

  return (
    <div className={`fixed bottom-5 z-40 flex items-center gap-2 ${side}`}>
      {bubbleText && bubbleText.trim() && (
        <span className="hidden max-w-48 rounded-xl bg-[var(--surface-raised)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-lg)] ring-1 ring-black/5 sm:block">
          {bubbleText}
        </span>
      )}
      <a
        href={`https://wa.me/${digits}?text=${text}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Pedir por WhatsApp"
        className="relative inline-flex h-14 w-14 items-center justify-center rounded-full shadow-[var(--shadow-xl)] ring-1 ring-black/5 transition-transform hover:scale-105 active:scale-95"
        style={{ background: "#25D366" }}
      >
        <MessageCircle className="h-7 w-7 text-white" strokeWidth={2.25} aria-hidden />
        <span className="absolute inset-0 -z-10 animate-ping rounded-full opacity-30" style={{ background: "#25D366" }} />
      </a>
    </div>
  );
}
