"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { REJECTION_TEMPLATES } from "./types";

// ── Delete Confirmation Modal ──────────────────────────────────────────────────
interface DeleteConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({ onConfirm, onCancel }: DeleteConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 bg-black/60"
      style={{ zIndex: 200 }}
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-card rounded-xl w-full max-w-sm p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900 dark:text-foreground">¿Eliminar pedido?</h3>
            <p className="text-sm text-gray-500 dark:text-muted">Esta acción no se puede deshacer.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-gray-700 dark:text-foreground bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
          >
            Sí, eliminar
          </button>
        </div>
      </div>
    </div>
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
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-card rounded-xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--rule-soft)] dark:border-card-border">
          <h3 className="font-extrabold text-gray-900 dark:text-foreground">Rechazar pedido</h3>
          <p className="text-xs text-gray-400 dark:text-muted mt-0.5">Selecciona un motivo o escribe uno personalizado</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-1 gap-1.5">
            {REJECTION_TEMPLATES.map(t => (
              <button
                key={t}
                onClick={() => onReasonChange(t)}
                className={cn(
                  "text-left px-3 py-2 rounded-lg text-sm border transition-colors",
                  rejectReason === t
                    ? "border-red-400 bg-red-50 text-red-700 font-semibold"
                    : "border-[var(--rule-base)] dark:border-card-border text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
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
            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm text-gray-900 dark:text-foreground outline-none focus:border-red-400"
          />
          <div className="flex gap-2 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm font-bold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={!rejectReason.trim()}
              className="flex-1 py-2.5 rounded-lg bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              Rechazar pedido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
