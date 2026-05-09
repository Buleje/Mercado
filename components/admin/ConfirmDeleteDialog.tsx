"use client";

import { CardTitle } from "@buleje/design-system";
import { useEffect } from "react";
import { m, AnimatePresence } from "@/components/admin/providers";
import { AlertTriangle, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface ConfirmDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
}

export function ConfirmDeleteDialog({
  open,
  onClose,
  onConfirm,
  title = "¿Estás seguro?",
  description = "Esta acción no se puede deshacer",
  confirmText = "Sí, eliminar",
  cancelText = "Cancelar",
  loading = false,
}: ConfirmDeleteDialogProps) {
  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <m.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Overlay */}
          <m.div
            className="modal-backdrop absolute"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Dialog */}
          <m.div
            className={cn(
              "relative z-10 w-full max-w-md",
              "bg-white dark:bg-card",
              "rounded-xl border border-[var(--rule-base)] dark:border-card-border",
              "overflow-hidden"
            )}
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 12 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start gap-4 px-6 pt-6 pb-4">
              <div className="shrink-0 w-11 h-11 rounded-full bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" />
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base font-extrabold text-[var(--text-primary)] dark:text-foreground">
                  {title}
                </CardTitle>
                <p className="mt-0.5 text-sm text-[var(--text-secondary)] dark:text-muted">
                  {description}
                </p>
              </div>
              <button
                onClick={onClose}
                disabled={loading}
                className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] dark:hover:bg-surface transition-colors disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 bg-[var(--surface-alt)] dark:bg-surface border-t border-[var(--rule-soft)] dark:border-card-border">
              <button
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--rule-soft)] dark:hover:bg-accent transition-colors disabled:opacity-40"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)] active:scale-95 text-white text-sm font-bold  transition-all disabled:opacity-50"
              >
                {loading && (
                  <svg
                    className="h-4 w-4 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16 8 8 0 01-8-8z"
                    />
                  </svg>
                )}
                {confirmText}
              </button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
