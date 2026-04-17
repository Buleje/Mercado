"use client";

import { m } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * CheckmarkDraw — SVG path que se "dibuja" al montar.
 *
 * Uso: success states (payment verified, order placed, form saved).
 * Timing: 350ms con ease editorial. Respeta prefers-reduced-motion
 * automaticamente via framer-motion.
 *
 * @example
 * <CheckmarkDraw size={60} className="text-[var(--data-success)]" />
 */

interface Props {
  size?: number;
  strokeWidth?: number;
  /** Color del check — default currentColor (hereda del padre) */
  className?: string;
  /** Delay en ms antes de animar */
  delay?: number;
  /** Si true, muestra tambien el circulo exterior */
  withCircle?: boolean;
}

export function CheckmarkDraw({
  size = 48,
  strokeWidth = 3,
  className,
  delay = 0,
  withCircle = true,
}: Props) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("inline-block", className)}
      aria-hidden
    >
      {withCircle && (
        <m.circle
          cx="24"
          cy="24"
          r="20"
          initial={{ pathLength: 0, opacity: 0.5 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            duration: 0.5,
            ease: [0.22, 1, 0.36, 1],
            delay: delay / 1000,
          }}
        />
      )}
      <m.path
        d="M14 24l7 7l13-14"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{
          duration: 0.35,
          ease: [0.22, 1, 0.36, 1],
          delay: (delay + 200) / 1000,
        }}
      />
    </svg>
  );
}
