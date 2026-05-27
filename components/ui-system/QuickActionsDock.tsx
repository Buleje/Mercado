"use client";

/**
 * QuickActionsDock — Dock flotante con accesos rapidos estilo iOS dock.
 *
 * Grupo vertical derecho con 3-6 botones para:
 *   - Volver arriba (scroll top)
 *   - Compartir
 *   - Favorito / Guardar
 *   - Chat support
 *   - Cart mini preview
 *   - Theme toggle
 *
 * Cada boton con hover tooltip a la izquierda. Colapsa a "..." en mobile.
 *
 * Uso:
 *   <QuickActionsDock
 *     actions={[
 *       { id: "scroll-top", icon: <ArrowUp />, label: "Volver arriba", onClick: scrollTop },
 *       { id: "share", icon: <Share2 />, label: "Compartir", onClick: share },
 *     ]}
 *   />
 */

import { useState, useEffect } from "react";
import { MoreVertical } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface DockAction {
  id: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  /** Badge count opcional (ej. 3 items en carrito) */
  badge?: number;
  /** Visible solo cuando ciertas condiciones se cumplen */
  show?: boolean;
}

interface Props {
  actions: DockAction[];
  /** Posicion. Default "right" */
  position?: "right" | "left";
  /** Solo mostrar despues de scrollear N pixels. Default 200 */
  scrollThreshold?: number;
  /** Deshabilitar auto-hide. Default false */
  alwaysVisible?: boolean;
  className?: string;
}

export default function QuickActionsDock({
  actions,
  position = "right",
  scrollThreshold = 200,
  alwaysVisible = false,
  className,
}: Props) {
  const [visible, setVisible] = useState(alwaysVisible);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (alwaysVisible) {
       
      setVisible(true);
      return;
    }
    const handler = () => setVisible(window.scrollY > scrollThreshold);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, [scrollThreshold, alwaysVisible]);

  const shownActions = actions.filter((a) => a.show !== false);
  if (shownActions.length === 0 || !visible) return null;

  const positionClass = position === "right" ? "right-4" : "left-4";
  const tooltipSide = position === "right" ? "right-full mr-3" : "left-full ml-3";

  return (
    <>
      {/* Desktop dock */}
      <div
        role="toolbar"
        aria-label="Acciones rápidas"
        className={cn(
          "hidden md:flex fixed bottom-20 flex-col gap-2 z-40",
          "motion-safe:animate-[slideUp_0.3s_ease-out]",
          positionClass,
          className,
        )}
      >
        {shownActions.map((a) => (
          <div key={a.id} className="group relative">
            <button
              type="button"
              onClick={a.onClick}
              aria-label={a.label}
              className="h-11 w-11 rounded-full bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-primary)] shadow-md hover:bg-[var(--accent)] hover:text-[var(--surface-canvas)] hover:border-[var(--accent)] inline-flex items-center justify-center transition-all active:scale-95"
            >
              {a.icon}
              {a.badge !== undefined && a.badge > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-[1rem] rounded-full bg-[var(--data-error,_#e11d48)] text-white px-1 text-[length:var(--ts-2xs)] font-bold tabular-nums inline-flex items-center justify-center">
                  {a.badge > 99 ? "99+" : a.badge}
                </span>
              )}
            </button>
            <div
              className={cn(
                "absolute top-1/2 -translate-y-1/2 whitespace-nowrap",
                "rounded-lg bg-[var(--text-primary)] text-[var(--surface-canvas)] px-2.5 py-1 text-xs font-bold",
                "opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity",
                tooltipSide,
              )}
              aria-hidden
            >
              {a.label}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile toggle */}
      <div
        className={cn(
          "md:hidden fixed bottom-20 flex flex-col items-end gap-2 z-40",
          "motion-safe:animate-[slideUp_0.3s_ease-out]",
          positionClass,
          className,
        )}
      >
        {expanded &&
          shownActions.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                a.onClick();
                setExpanded(false);
              }}
              aria-label={a.label}
              className="h-11 w-11 rounded-full bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-primary)] shadow-md inline-flex items-center justify-center active:scale-95 motion-safe:animate-[fadeUp_0.2s_ease-out]"
            >
              {a.icon}
              {a.badge !== undefined && a.badge > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-[1rem] rounded-full bg-[var(--data-error,_#e11d48)] text-white px-1 text-[length:var(--ts-2xs)] font-bold tabular-nums inline-flex items-center justify-center">
                  {a.badge > 99 ? "99+" : a.badge}
                </span>
              )}
            </button>
          ))}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Cerrar acciones" : "Abrir acciones"}
          aria-expanded={expanded}
          className={cn(
            "h-12 w-12 rounded-full shadow-lg inline-flex items-center justify-center transition-all",
            expanded
              ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] rotate-90"
              : "bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--rule-base)]",
          )}
        >
          <MoreVertical className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </>
  );
}
