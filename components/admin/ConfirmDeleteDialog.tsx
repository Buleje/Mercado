"use client";

import AdminModal from "@/components/admin/shared/AdminModal";
import { AlertTriangle } from "@buleje/design-system/icons";

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
  return (
    <AdminModal open={open} onClose={onClose} variant="centered-sm" hideCloseButton>
      <div className="p-5 space-y-4">
        {/* Icon + title + description */}
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-11 h-11 rounded-full bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-extrabold text-[var(--text-primary)] dark:text-foreground">
              {title}
            </p>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)] dark:text-muted">
              {description}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-2">
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
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)] active:scale-95 text-white text-sm font-bold transition-all disabled:opacity-50"
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
      </div>
    </AdminModal>
  );
}
