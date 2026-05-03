"use client";

/**
 * ConfirmModal — diálogo de confirmación para acciones destructivas.
 *
 * Wrapper sobre @radix-ui/react-alert-dialog con estilos del DS y soporte
 * de 3 intents (danger / warning / info). Reemplaza window.confirm() nativo
 * que bloqueaba el event loop y se veía nativo en iOS rompiendo la inmersión.
 *
 * Imperative API:
 *   const ok = await confirmAction({
 *     title: "¿Vaciar el carrito?",
 *     description: "Esta acción no se puede deshacer.",
 *     intent: "danger",
 *     confirmLabel: "Sí, vaciar",
 *   });
 *   if (ok) doAction();
 *
 * O componente declarativo si preferís:
 *   <ConfirmModal open={open} onClose={...} onConfirm={...} title="..." />
 */

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { AlertTriangle, Info, XCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useEffect, useState, type ReactNode } from "react";

export type ConfirmIntent = "danger" | "warning" | "info";

interface ConfirmParams {
  title: string;
  description?: string;
  intent?: ConfirmIntent;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ConfirmModalProps extends ConfirmParams {
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

const INTENT_STYLES: Record<ConfirmIntent, { icon: typeof AlertTriangle; iconColor: string; iconBg: string; btn: string }> = {
  danger: {
    icon: XCircle,
    iconColor: "text-[var(--data-error)]",
    iconBg: "bg-[var(--data-error-50)]",
    btn: "bg-[var(--data-error)] hover:opacity-90",
  },
  warning: {
    icon: AlertTriangle,
    iconColor: "text-[var(--data-warning)]",
    iconBg: "bg-[var(--data-warning-50)]",
    btn: "bg-[var(--data-warning)] hover:opacity-90",
  },
  info: {
    icon: Info,
    iconColor: "text-[var(--accent)]",
    iconBg: "bg-[var(--accent-soft)]",
    btn: "bg-[var(--accent)] hover:opacity-90",
  },
};

export function ConfirmModal({
  open,
  onConfirm,
  onClose,
  title,
  description,
  intent = "danger",
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
}: ConfirmModalProps) {
  const styles = INTENT_STYLES[intent];
  const Icon = styles.icon;

  return (
    <AlertDialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="modal-backdrop data-[state=open]:animate-confirm-overlay-in" />
        <AlertDialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 max-w-md w-[calc(100vw-2rem)]",
            "bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-xl)] border border-[var(--rule-base)] outline-none",
            "data-[state=open]:animate-confirm-content-in",
          )}
        >
          <div className="p-5 flex gap-4">
            <div className={cn("shrink-0 h-10 w-10 rounded-lg flex items-center justify-center", styles.iconBg)}>
              <Icon className={cn("h-5 w-5", styles.iconColor)} strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <AlertDialog.Title className="text-base font-semibold text-[var(--text-primary)]">
                {title}
              </AlertDialog.Title>
              {description && (
                <AlertDialog.Description className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                  {description}
                </AlertDialog.Description>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] transition-colors"
              >
                {cancelLabel}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                onClick={onConfirm}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity",
                  styles.btn,
                )}
              >
                {confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
      <style jsx global>{`
        @keyframes confirm-overlay-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes confirm-content-in {
          from { opacity: 0; transform: translate(-50%, -48%) scale(0.96); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
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
    </AlertDialog.Root>
  );
}

/**
 * Hook + helper para uso imperativo. Ejemplo:
 *   const { confirm, ConfirmDialog } = useConfirm();
 *   <ConfirmDialog />  // mount once en el componente
 *   const ok = await confirm({ title: "...", intent: "danger" });
 */
export function useConfirm() {
  const [params, setParams] = useState<ConfirmParams | null>(null);
  const [resolver, setResolver] = useState<((v: boolean) => void) | null>(null);

  const confirm = (p: ConfirmParams): Promise<boolean> => {
    return new Promise((resolve) => {
      setParams(p);
      setResolver(() => resolve);
    });
  };

  const handleConfirm = () => {
    resolver?.(true);
    setParams(null);
    setResolver(null);
  };

  const handleClose = () => {
    resolver?.(false);
    setParams(null);
    setResolver(null);
  };

  // Cleanup en unmount: si hay diálogo pendiente, resolver false
  useEffect(() => () => { resolver?.(false); }, [resolver]);

  const ConfirmDialog: () => ReactNode = () =>
    params ? (
      <ConfirmModal
        open={!!params}
        onConfirm={handleConfirm}
        onClose={handleClose}
        {...params}
      />
    ) : null;

  return { confirm, ConfirmDialog };
}

export default ConfirmModal;
