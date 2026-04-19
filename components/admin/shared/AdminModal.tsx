"use client";

/**
 * AdminModal — wrapper sobre @radix-ui/react-dialog con estilos editoriales.
 *
 * Actualizado 2026-04-18: migración de implementación custom a Radix Dialog.
 *
 * Beneficios Radix (gratis, sin código):
 *   - Focus trap (Tab no escapa del modal)
 *   - Return focus al trigger al cerrar
 *   - ESC handling
 *   - Click fuera (overlay)
 *   - Body scroll lock
 *   - Portal (no se corta por overflow)
 *   - aria-modal, aria-labelledby, role="dialog"
 *   - Screen readers anuncian apertura/cierre
 *
 * API backward-compatible con la implementación anterior:
 *   open, onClose, title, variant, children, className, hideCloseButton
 *
 * Nuevos variants:
 *   · default — centrado, max-w-lg (diálogos normales)
 *   · fullscreen — toma toda la pantalla
 *   · side — slide-in derecho (sheet/drawer)
 *   · wide — max-w-2xl (forms largos)
 *   · centered-sm — max-w-sm (confirmaciones)
 */

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type Variant = "default" | "fullscreen" | "side" | "wide" | "centered-sm";

interface AdminModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Descripción opcional debajo del título (accessibility). */
  description?: string;
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
  hideCloseButton?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  default: "max-w-lg w-[calc(100vw-2rem)] rounded-xl max-h-[85vh]",
  "centered-sm": "max-w-sm w-[calc(100vw-2rem)] rounded-xl max-h-[85vh]",
  wide: "max-w-2xl w-[calc(100vw-2rem)] rounded-xl max-h-[85vh]",
  fullscreen: "w-screen h-screen rounded-none",
  side: "ml-auto h-screen w-full max-w-md rounded-l-2xl",
};

const VARIANT_POSITION: Record<Variant, string> = {
  default: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
  "centered-sm": "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
  wide: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
  fullscreen: "top-0 left-0",
  side: "top-0 right-0",
};

export default function AdminModal({
  open,
  onClose,
  title,
  description,
  variant = "default",
  children,
  className,
  hideCloseButton,
}: AdminModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm",
            "data-[state=open]:animate-modal-overlay-in",
          )}
        />
        <Dialog.Content
          aria-describedby={description ? undefined : undefined}
          className={cn(
            "fixed z-50 bg-[var(--surface-raised)] overflow-hidden flex flex-col shadow-2xl outline-none",
            VARIANT_POSITION[variant],
            VARIANT_CLASSES[variant],
            "data-[state=open]:animate-modal-in",
            className,
          )}
        >
          {/* Header */}
          {(title || !hideCloseButton) && (
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-base)] shrink-0 gap-3">
              <div className="min-w-0">
                {title && (
                  <Dialog.Title className="font-display text-base sm:text-lg font-semibold text-[var(--text-primary)] tracking-tight truncate">
                    {title}
                  </Dialog.Title>
                )}
                {description && (
                  <Dialog.Description className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">
                    {description}
                  </Dialog.Description>
                )}
              </div>
              {!hideCloseButton && (
                <Dialog.Close asChild>
                  <button
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
                    aria-label="Cerrar"
                  >
                    <X className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </Dialog.Close>
              )}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>

      <style jsx global>{`
        @keyframes modal-overlay-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes modal-in {
          from {
            opacity: 0;
            transform: ${variant === "side" ? "translateX(16px)" : "translate(-50%, -48%) scale(0.96)"};
          }
          to {
            opacity: 1;
            transform: ${variant === "side" ? "translateX(0)" : "translate(-50%, -50%) scale(1)"};
          }
        }
        [data-radix-dialog-overlay].animate-modal-overlay-in {
          animation: modal-overlay-in 180ms ease-out;
        }
        [data-radix-dialog-content].animate-modal-in {
          animation: modal-in 200ms ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          [data-radix-dialog-overlay].animate-modal-overlay-in,
          [data-radix-dialog-content].animate-modal-in {
            animation: none !important;
          }
        }
      `}</style>
    </Dialog.Root>
  );
}
