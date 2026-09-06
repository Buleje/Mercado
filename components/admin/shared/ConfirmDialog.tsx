"use client";

/**
 * ConfirmDialog — dialog estandarizado para confirmaciones (Radix AlertDialog).
 *
 * Antes: 10+ implementaciones distintas de "¿Seguro?" en el admin,
 * cada una con diferente layout y copy.
 *
 * Ahora: un solo componente con 3 intents (danger/warning/info) +
 * copy Feynman en props.
 *
 * Uso vía hook:
 *   const { confirm } = useConfirm();
 *   const ok = await confirm({
 *     title: "¿Eliminar este producto?",
 *     description: "Se va del catálogo. No podrás venderlo más hasta
 *                   volver a crearlo.",
 *     intent: "danger",
 *     confirmLabel: "Sí, eliminar",
 *   });
 *   if (ok) doDelete();
 *
 * Integrar <ConfirmDialogProvider /> en el layout del admin una vez.
 */

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Info, XCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type Intent = "danger" | "warning" | "info";

interface ConfirmParams {
  title: string;
  description?: string;
  intent?: Intent;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ConfirmContextValue {
  confirm: (params: ConfirmParams) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

const INTENT_STYLES: Record<Intent, { icon: typeof AlertTriangle; color: string; bg: string; btn: string }> = {
  danger: {
    icon: XCircle,
    color: "text-[var(--data-error-500)]",
    bg: "bg-[var(--data-error-50)]",
    btn: "bg-[var(--data-error-500)] hover:opacity-90",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-[var(--data-warning-500)]",
    bg: "bg-[var(--data-warning-50)]",
    btn: "bg-[var(--data-warning-500)] hover:opacity-90",
  },
  info: {
    icon: Info,
    color: "text-[var(--accent)]",
    bg: "bg-primary/10",
    btn: "bg-[var(--accent)] hover:opacity-90",
  },
};

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [params, setParams] = useState<ConfirmParams | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((p: ConfirmParams): Promise<boolean> => {
    setParams(p);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = () => {
    resolveRef.current?.(true);
    setOpen(false);
  };

  const handleCancel = () => {
    resolveRef.current?.(false);
    setOpen(false);
  };

  const intent = params?.intent ?? "danger";
  const styles = INTENT_STYLES[intent];
  const Icon = styles.icon;

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <AlertDialog.Root open={open} onOpenChange={(v) => !v && handleCancel()}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="modal-backdrop data-[state=open]:animate-confirm-overlay-in" />
          <AlertDialog.Content
            className={cn(
              "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 max-w-md w-[calc(100vw-2rem)]",
              "bg-[var(--surface-canvas)] rounded-xl shadow-[var(--shadow-xl)] border border-[var(--rule-base)] outline-none",
              "data-[state=open]:animate-confirm-content-in",
            )}
          >
            <div className="p-5 flex gap-4">
              <div
                className={cn(
                  "shrink-0 h-10 w-10 rounded-lg flex items-center justify-center",
                  styles.bg,
                )}
              >
                <Icon className={cn("h-5 w-5", styles.color)} strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <AlertDialog.Title className="text-base font-semibold text-[var(--text-primary)]">
                  {params?.title}
                </AlertDialog.Title>
                {params?.description && (
                  <AlertDialog.Description className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                    {params.description}
                  </AlertDialog.Description>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
              <AlertDialog.Cancel asChild>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] transition-colors"
                >
                  {params?.cancelLabel ?? "Cancelar"}
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity",
                    styles.btn,
                  )}
                >
                  {params?.confirmLabel ?? "Confirmar"}
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <style jsx global>{`
        @keyframes confirm-overlay-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes confirm-content-in {
          from {
            opacity: 0;
            transform: translate(-50%, -48%) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
        [data-radix-alert-dialog-overlay].animate-confirm-overlay-in {
          animation: confirm-overlay-in 180ms ease-out;
        }
        [data-radix-alert-dialog-content].animate-confirm-content-in {
          animation: confirm-content-in 200ms ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          [data-radix-alert-dialog-overlay].animate-confirm-overlay-in,
          [data-radix-alert-dialog-content].animate-confirm-content-in {
            animation: none !important;
          }
        }
      `}</style>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmDialogProvider");
  }
  return ctx;
}
