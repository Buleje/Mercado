"use client";

import { m } from "framer-motion";
import { Heart } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/**
 * HeartBeat — corazón que pulsa al hacer favorite.
 *
 * Uso: botón wishlist/favoritos al toggle ON.
 * Timing: scale 1 → 1.3 → 1 en 400ms.
 *
 * @example
 * <HeartBeat filled={isFavorite} onToggle={toggle} />
 */

interface Props {
  filled: boolean;
  onToggle?: () => void;
  size?: number;
  className?: string;
  /** Size del tap target — default 40px */
  tapSize?: number;
}

export function HeartBeat({ filled, onToggle, size = 20, className, tapSize = 40 }: Props) {
  return (
    <m.button
      type="button"
      onClick={onToggle}
      whileTap={{ scale: 0.9 }}
      animate={filled ? { scale: [1, 1.3, 1] } : { scale: 1 }}
      transition={{
        duration: 0.4,
        times: [0, 0.5, 1],
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(
        "inline-flex items-center justify-center rounded-full transition-colors",
        filled ? "text-[var(--data-error)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
        className,
      )}
      style={{ width: tapSize, height: tapSize }}
      aria-label={filled ? "Quitar de favoritos" : "Agregar a favoritos"}
      aria-pressed={filled}
    >
      <Heart
        className={filled ? "fill-[var(--data-error)]" : undefined}
        style={{ width: size, height: size }}
        strokeWidth={1.75}
        aria-hidden
      />
    </m.button>
  );
}
