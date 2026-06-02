"use client";

/**
 * ShareStoreButton — botón circular "Compartir tienda por WhatsApp"
 * (Brandon 2026-06-02). Cada cliente que comparte trae 2-3 vecinos → crecimiento
 * viral por card. Abre wa.me con un mensaje + link directo a la tienda.
 *
 * Reusable: PremiumStoreCard (al lado de Vista rápida) y StoreCardCanonical
 * (al lado de Seguir). `className` se MERGEA con el estilo base (para
 * posicionamiento absolute en la card premium).
 */

import { Share2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Props {
  slug: string;
  name: string;
  className?: string;
}

export default function ShareStoreButton({ slug, name, className }: Props) {
  const onShare = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://buleje.pe";
    const msg = `Mirá *${name}* en Buleje — pedí con delivery a domicilio 🛵: ${origin}/marketplace/${slug}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(msg)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <button
      type="button"
      onClick={onShare}
      aria-label={`Compartir ${name} por WhatsApp`}
      title="Compartir por WhatsApp"
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-canvas)]/95 text-[var(--accent)] shadow-md ring-1 ring-[var(--accent)]/30 backdrop-blur-sm transition-all hover:bg-[var(--accent)] hover:text-white active:scale-95",
        className,
      )}
    >
      <Share2 className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
    </button>
  );
}
