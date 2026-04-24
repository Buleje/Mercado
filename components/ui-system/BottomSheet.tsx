"use client";

/**
 * BottomSheet — Hoja modal desde abajo, mobile-first.
 *
 * - Snap points (medio / full) con drag.
 * - Close on swipe-down (threshold 100px).
 * - Focus trap + Escape.
 * - Safe-area bottom padding automatico.
 * - Backdrop click cierra.
 * - Scroll lock del body mientras abierto.
 *
 * Uso:
 *   <BottomSheet open={open} onClose={close} title="Filtros">
 *     ...contenido...
 *   </BottomSheet>
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "@buleje/design-system/icons";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  /** Sticky footer (ej. botones de accion) */
  footer?: ReactNode;
  /** Height: "auto" (content), "half" (50vh), "full" (90vh). Default "auto" */
  size?: "auto" | "half" | "full";
  /** Permite drag para cerrar. Default true */
  draggable?: boolean;
  /** Cerrar al click en backdrop. Default true */
  dismissOnBackdrop?: boolean;
  /** ClassName del panel */
  className?: string;
}

export default function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "auto",
  draggable = true,
  dismissOnBackdrop = true,
  className,
}: Props) {
  const focusTrapRef = useFocusTrap<HTMLDivElement>({
    enabled: open,
    onEscape: onClose,
  });
  const [dragY, setDragY] = useState(0);
  const startYRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Drag handlers
  const onTouchStart = (e: React.TouchEvent) => {
    if (!draggable) return;
    startYRef.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!draggable || startYRef.current === null) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta < 0) {
      setDragY(delta / 3); // resistencia al subir
    } else {
      setDragY(delta);
    }
  };
  const onTouchEnd = () => {
    if (!draggable) return;
    if (dragY > 100) {
      onClose();
    }
    setDragY(0);
    startYRef.current = null;
  };

  if (!open) return null;

  const sizeClass =
    size === "full" ? "max-h-[90vh] h-[90vh]" : size === "half" ? "max-h-[60vh] h-[60vh]" : "max-h-[85vh]";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end motion-safe:animate-[fadeIn_0.2s]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "bsheet-title" : undefined}
      aria-describedby={description ? "bsheet-desc" : undefined}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={() => dismissOnBackdrop && onClose()}
        className="absolute inset-0 bg-[var(--text-primary)]/40 backdrop-blur-[1px]"
      />
      {/* Panel */}
      <div
        ref={(node) => {
          focusTrapRef.current = node;
          panelRef.current = node;
        }}
        className={cn(
          "relative w-full bg-[var(--surface-raised)] rounded-t-3xl shadow-2xl flex flex-col",
          sizeClass,
          "motion-safe:animate-[slideUp_0.3s_cubic-bezier(0.32,0.72,0,1)]",
          className,
        )}
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragY === 0 ? "transform 0.2s ease-out" : "none",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Drag handle */}
        {draggable && (
          <div aria-hidden className="flex items-center justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-[var(--rule-base)]" />
          </div>
        )}

        {/* Header */}
        {(title || description) && (
          <div className="px-6 pt-3 pb-3 border-b border-[var(--rule-base)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {title && (
                  <h2
                    id="bsheet-title"
                    className="text-base font-bold text-[var(--text-primary)] tracking-tight"
                  >
                    {title}
                  </h2>
                )}
                {description && (
                  <p
                    id="bsheet-desc"
                    className="mt-1 text-sm text-[var(--text-secondary)] leading-snug"
                  >
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="shrink-0 p-1.5 -m-1.5 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
          </div>
        )}

        {/* Contenido scroll */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4">{children}</div>

        {/* Footer sticky */}
        {footer && (
          <div className="shrink-0 border-t border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
