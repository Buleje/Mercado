"use client";

/**
 * AdminTooltip — wrapper sobre @radix-ui/react-tooltip con estilos editoriales.
 *
 * Por qué: muchos admin tienen botones icon-only (solo icono, sin label
 * visible) — sin tooltip el usuario no sabe qué hace. Este componente
 * envuelve cualquier elemento para mostrar tooltip al hover/focus.
 *
 * Usa Radix Tooltip (ya instalado):
 *   - delayDuration 300ms (sensación natural, ni instant ni lento)
 *   - Portal (no se corta por overflow)
 *   - Follow-focus para accessibility con teclado
 *   - aria-* correcto
 *
 * Uso:
 *   <AdminTooltip content="Exportar a CSV">
 *     <button aria-label="Exportar"><Download className="h-4 w-4" /></button>
 *   </AdminTooltip>
 *
 *   <AdminTooltip content="Guardar cambios" side="bottom">
 *     <Save className="h-4 w-4" />
 *   </AdminTooltip>
 */

import * as Tooltip from "@radix-ui/react-tooltip";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  /** Alineación respecto al trigger. */
  align?: "start" | "center" | "end";
  /** Delay antes de mostrar el tooltip (ms). Default: 300. */
  delayDuration?: number;
  /** Clase extra en el content. */
  className?: string;
  /** Si false, no muestra el tooltip (útil para condicionales). */
  enabled?: boolean;
}

export function AdminTooltip({
  content,
  children,
  side = "top",
  align = "center",
  delayDuration = 300,
  className,
  enabled = true,
}: Props) {
  if (!enabled) return <>{children}</>;

  return (
    <Tooltip.Provider delayDuration={delayDuration}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side={side}
            align={align}
            sideOffset={6}
            collisionPadding={8}
            className={cn(
              "z-50 rounded-md bg-[var(--text-primary)] px-2.5 py-1.5 text-xs font-medium text-[var(--surface-canvas)] shadow-md",
              "data-[state=delayed-open]:animate-tooltip-in",
              className,
            )}
          >
            {content}
            <Tooltip.Arrow className="fill-[var(--text-primary)]" width={10} height={5} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>

      <style jsx global>{`
        @keyframes tooltip-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        [data-radix-tooltip-content].animate-tooltip-in {
          animation: tooltip-in 150ms ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          [data-radix-tooltip-content].animate-tooltip-in {
            animation: none !important;
          }
        }
      `}</style>
    </Tooltip.Provider>
  );
}

export default AdminTooltip;
