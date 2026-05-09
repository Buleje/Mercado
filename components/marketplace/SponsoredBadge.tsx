"use client";

/**
 * SponsoredBadge
 * Badge sutil "Patrocinado" para productos con isSponsored = true.
 * Con tooltip al hover. No agresivo, gris claro.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

export default function SponsoredBadge({ className }: Props) {
  const [tooltipVisible, setTooltipVisible] = useState(false);

  return (
    <div
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setTooltipVisible(true)}
      onMouseLeave={() => setTooltipVisible(false)}
      onFocus={() => setTooltipVisible(true)}
      onBlur={() => setTooltipVisible(false)}
    >
      <span
        role="note"
        aria-label="Producto patrocinado"
        className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[var(--surface-sunken)] dark:bg-gray-800 text-gray-400 dark:text-gray-500 text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wide cursor-help select-none"
      >
        Patrocinado
      </span>

      {/* Tooltip */}
      {tooltipVisible && (
        <div
          role="tooltip"
          className={cn(
            "absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50",
            "w-52 rounded-xl px-3 py-2",
            "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900",
            "text-[length:var(--ts-2xs)] leading-snug shadow-xl",
            "pointer-events-none"
          )}
        >
          Este producto destaca porque el vendedor lo esta promocionando.
          {/* Flecha */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-100" />
        </div>
      )}
    </div>
  );
}
