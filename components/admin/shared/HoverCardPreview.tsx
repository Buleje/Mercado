"use client";

/**
 * HoverCardPreview — muestra preview con Radix HoverCard.
 *
 * Al pasar mouse sobre algo (fila de tabla, avatar, link) muestra popup
 * con info extendida SIN tener que abrir modal. Desaparece al salir.
 *
 * Uso:
 *   <HoverCardPreview
 *     trigger={<a>María López</a>}
 *     content={<CustomerQuickView customer={maria} />}
 *   />
 */

import * as HoverCard from "@radix-ui/react-hover-card";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  trigger: ReactNode;
  content: ReactNode;
  /** Open/close delay en ms. Default: 300/100. */
  openDelay?: number;
  closeDelay?: number;
  /** Lado donde aparece. Default "right". */
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
  /** Width del popup. Default 320px. */
  width?: number;
}

export function HoverCardPreview({
  trigger,
  content,
  openDelay = 300,
  closeDelay = 100,
  side = "right",
  align = "start",
  width = 320,
  className,
}: Props) {
  return (
    <HoverCard.Root openDelay={openDelay} closeDelay={closeDelay}>
      <HoverCard.Trigger asChild>{trigger}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            "z-50 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4 shadow-xl",
            "data-[state=open]:animate-hover-card-in",
            className,
          )}
          style={{ width }}
        >
          {content}
          <HoverCard.Arrow className="fill-[var(--surface-canvas)] stroke-[var(--rule-base)]" />
        </HoverCard.Content>
      </HoverCard.Portal>

      <style jsx global>{`
        @keyframes hover-card-in {
          from {
            opacity: 0;
            transform: scale(0.97);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        [data-radix-hover-card-content].animate-hover-card-in {
          animation: hover-card-in 140ms ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          [data-radix-hover-card-content].animate-hover-card-in {
            animation: none !important;
          }
        }
      `}</style>
    </HoverCard.Root>
  );
}

export default HoverCardPreview;
