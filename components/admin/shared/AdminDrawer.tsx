"use client";

/**
 * AdminDrawer — drawer lateral desde la derecha (basado en vaul).
 *
 * Para formularios largos (crear/editar producto, cliente, pedido) que
 * merecen más espacio que un modal centrado. El drawer desde la derecha
 * NO tapa la lista — el dueño puede comparar mientras edita.
 *
 * Mobile: se convierte en bottom sheet (comportamiento nativo de vaul).
 *
 * Uso:
 *   <AdminDrawer open={open} onClose={() => setOpen(false)} title="Nuevo producto">
 *     <form>...</form>
 *   </AdminDrawer>
 */

import { Drawer as VaulDrawer } from "vaul";
import { X } from "@buleje/design-system/icons";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  /** Ancho máximo desktop. Default 480. */
  maxWidthPx?: number;
  /** Footer con botones de acción (save/cancel). */
  footer?: ReactNode;
  className?: string;
}

export function AdminDrawer({
  open,
  onClose,
  title,
  description,
  children,
  maxWidthPx = 480,
  footer,
  className,
}: Props) {
  return (
    <VaulDrawer.Root
      open={open}
      onOpenChange={(v) => !v && onClose()}
      direction="right"
    >
      <VaulDrawer.Portal>
        <VaulDrawer.Overlay className="modal-backdrop data-[state=open]:animate-drawer-overlay-in" />
        <VaulDrawer.Content
          aria-describedby={description ? undefined : undefined}
          className={cn(
            "fixed top-0 right-0 bottom-0 z-50",
            "bg-[var(--surface-canvas)] shadow-[var(--shadow-xl)] outline-none",
            "flex flex-col",
            "data-[state=open]:animate-drawer-slide-in",
            "w-full",
            className,
          )}
          style={{ maxWidth: `${maxWidthPx}px` }}
        >
          {/* Handle invisible — vaul usa esto para drag */}
          <VaulDrawer.Handle className="sr-only" />

          {/* Header */}
          {(title || description) && (
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--rule-base)] shrink-0">
              <div className="min-w-0">
                {title && (
                  <VaulDrawer.Title className="font-display text-lg font-normal text-[var(--text-primary)] tracking-tight">
                    {title}
                  </VaulDrawer.Title>
                )}
                {description && (
                  <VaulDrawer.Description className="text-xs text-[var(--text-tertiary)] mt-0.5">
                    {description}
                  </VaulDrawer.Description>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          )}

          {/* Content — scrollable */}
          <div className="flex-1 overflow-y-auto p-5">{children}</div>

          {/* Footer — sticky */}
          {footer && (
            <div className="border-t border-[var(--rule-base)] bg-[var(--surface-sunken)] px-5 py-3 shrink-0">
              {footer}
            </div>
          )}
        </VaulDrawer.Content>
      </VaulDrawer.Portal>

      <style jsx global>{`
        @keyframes drawer-overlay-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes drawer-slide-in {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        [vaul-drawer-direction="right"][data-state="open"].animate-drawer-slide-in {
          animation: drawer-slide-in 280ms cubic-bezier(0.32, 0.72, 0, 1);
        }
        [vaul-overlay][data-state="open"].animate-drawer-overlay-in {
          animation: drawer-overlay-in 180ms ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          [vaul-drawer-direction="right"].animate-drawer-slide-in,
          [vaul-overlay].animate-drawer-overlay-in {
            animation: none !important;
          }
        }
      `}</style>
    </VaulDrawer.Root>
  );
}

export default AdminDrawer;
