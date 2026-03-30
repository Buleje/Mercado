"use client";

import { Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ShareProductButtonProps {
  productName: string;
  productPrice: number;
  productUrl: string;
  className?: string;
}

export function ShareProductButton({
  productName,
  productPrice,
  productUrl,
  className,
}: ShareProductButtonProps) {
  function handleShare() {
    const text = encodeURIComponent(
      `Mira este producto: ${productName} a S/${productPrice.toFixed(2)} - ${productUrl}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium",
        "transition-colors duration-150",
        // Light mode
        "border-[#0f766e] bg-transparent text-[#0f766e]",
        "hover:bg-[#0f766e]/10",
        // Dark mode
        "dark:border-[#3a8a65] dark:text-[#3a8a65]",
        "dark:hover:bg-[#0f766e]/20",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e] focus-visible:ring-offset-2",
        "dark:focus-visible:ring-offset-gray-900",
        className
      )}
      aria-label={`Compartir ${productName} por WhatsApp`}
    >
      <Share2 className="h-4 w-4" aria-hidden="true" />
      Compartir
    </button>
  );
}

export default ShareProductButton;
