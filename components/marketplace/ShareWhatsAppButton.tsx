"use client";

import { MessageCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Props {
  storeSlug: string;
  storeName: string;
  productName: string;
  productId: number;
  price: number;
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "icon" | "full";
}

const SIZES = {
  sm: "h-7 w-7",
  md: "h-9 w-9",
  lg: "h-11 w-11",
};

const ICON_SIZES = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export default function ShareWhatsAppButton({
  storeSlug,
  storeName,
  productName,
  productId,
  price,
  className,
  size = "md",
  variant = "icon",
}: Props) {
  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://www.buleje.pe";
    const url = `${origin}/marketplace/${storeSlug}?p=${productId}`;
    const text = `Mira *${productName}* en ${storeName} — S/${price.toFixed(2)}\n\n${url}`;

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      navigator
        .share({ title: productName, text, url })
        .catch(() => fallback(text));
      return;
    }
    fallback(text);
  };

  const fallback = (text: string) => {
    const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
    if (typeof window !== "undefined") window.open(wa, "_blank", "noopener,noreferrer");
  };

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={handleShare}
        className={cn(
          "inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors",
          className,
        )}
      >
        <MessageCircle className={ICON_SIZES[size]} aria-hidden="true" />
        Compartir
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label="Compartir por WhatsApp"
      onClick={handleShare}
      className={cn(
        "inline-flex items-center justify-center rounded-full border bg-white/90 backdrop-blur border-gray-200 text-gray-400 hover:text-emerald-600 hover:border-emerald-200 transition-all active:scale-90",
        SIZES[size],
        className,
      )}
    >
      <MessageCircle className={ICON_SIZES[size]} aria-hidden="true" />
    </button>
  );
}
