"use client";

import { AlertTriangle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import AdminModal from "@/components/admin/shared/AdminModal";
import { REJECTION_TEMPLATES } from "./types";

// ── Delete Confirmation Modal ──────────────────────────────────────────────────
interface DeleteConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({ onConfirm, onCancel }: DeleteConfirmModalProps) {
  return (
    <AdminModal
      open
      onClose={onCancel}
      title="¿Eliminar pedido?"
      variant="centered-sm"
    >
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--data-error-100)] flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)]" />
          </div>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted">Esta acción no se puede deshacer.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 h-10 rounded-lg text-sm font-semibold text-[var(--text-primary)] dark:text-foreground bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 h-10 rounded-lg text-sm font-semibold text-white bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)] transition-colors"
          >
            Sí, eliminar
          </button>
        </div>
      </div>
    </AdminModal>
  );
}

// ── Rejection Template Modal ───────────────────────────────────────────────────
interface RejectModalProps {
  rejectReason: string;
  onReasonChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RejectModal({ rejectReason, onReasonChange, onConfirm, onCancel }: RejectModalProps) {
  return (
    <AdminModal
      open
      onClose={onCancel}
      title="Rechazar pedido"
      description="Selecciona un motivo o escribe uno personalizado"
      variant="default"
    >
      <div className="p-5 space-y-3">
        <div className="grid grid-cols-1 gap-1.5">
          {REJECTION_TEMPLATES.map(t => (
            <button
              key={t}
              onClick={() => onReasonChange(t)}
              className={cn(
                "text-left px-3 py-2 rounded-lg text-sm border transition-colors",
                rejectReason === t
                  ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-500)] font-semibold"
                  : "border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          value={rejectReason}
          onChange={e => onReasonChange(e.target.value)}
          placeholder="O escribe un motivo personalizado..."
          className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm text-[var(--text-primary)] dark:text-foreground outline-none focus:border-[var(--data-error-500)]"
        />
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 h-10 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm font-bold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!rejectReason.trim()}
            className="flex-1 h-10 rounded-lg bg-[var(--data-error-500)] text-white text-sm font-bold hover:bg-[var(--data-error-500)] transition-colors disabled:opacity-50"
          >
            Rechazar pedido
          </button>
        </div>
      </div>
    </AdminModal>
  );
}
