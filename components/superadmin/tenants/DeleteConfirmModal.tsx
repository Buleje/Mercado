"use client";

import { useState } from "react";
import { Trash2, AlertTriangle, Loader2 } from "@buleje/design-system/icons";

interface DeleteConfirmModalProps {
  name: string;
  slug: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

export function DeleteConfirmModal({ name, slug, onConfirm, onCancel, loading }: DeleteConfirmModalProps) {
  const [typed, setTyped] = useState("");
  const confirmed = typed === slug;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-[var(--surface-raised)] rounded-xl shadow-[var(--shadow-xl)] max-w-md w-full mx-4 p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[var(--data-error-100)] dark:bg-red-950/40 flex items-center justify-center">
            <Trash2 className="w-6 h-6 text-[var(--data-error)]" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">Eliminar tienda</h3>
            <p className="text-sm text-gray-500">Esta acción no se puede deshacer</p>
          </div>
        </div>

        <div className="bg-[var(--data-error-50)] dark:bg-red-950/30 border border-[var(--data-error)] dark:border-[var(--data-error)] rounded-xl p-4 space-y-2">
          <p className="text-sm text-[var(--data-error)] dark:text-[var(--data-error)] font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Se eliminará permanentemente:
          </p>
          <ul className="text-xs text-[var(--data-error)] dark:text-[var(--data-error)] space-y-1 ml-6 list-disc">
            <li>La tienda <strong>&ldquo;{name}&rdquo;</strong> ({slug})</li>
            <li>Todos sus productos, pedidos, ventas e historial</li>
            <li>Todos sus clientes, proveedores y usuarios</li>
            <li>Toda su configuración, inventario y datos financieros</li>
          </ul>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-[var(--text-secondary)]">
            Escribe <strong className="text-[var(--data-error)] font-mono">{slug}</strong> para confirmar:
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={slug}
            className="w-full bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--data-error)]/40 font-mono"
            autoFocus
          />
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!confirmed || loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--data-error)] hover:bg-[var(--data-error)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Eliminar permanentemente
          </button>
        </div>
      </div>
    </div>
  );
}
