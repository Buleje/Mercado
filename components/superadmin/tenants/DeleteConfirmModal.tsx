"use client";

import { useState } from "react";
import { Trash2, AlertTriangle, Loader2 } from "lucide-react";

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
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
            <Trash2 className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Eliminar tienda</h3>
            <p className="text-sm text-gray-500">Esta acción no se puede deshacer</p>
          </div>
        </div>

        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4 space-y-2">
          <p className="text-sm text-red-700 dark:text-red-300 font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Se eliminará permanentemente:
          </p>
          <ul className="text-xs text-red-600 dark:text-red-400 space-y-1 ml-6 list-disc">
            <li>La tienda <strong>&ldquo;{name}&rdquo;</strong> ({slug})</li>
            <li>Todos sus productos, pedidos, ventas e historial</li>
            <li>Todos sus clientes, proveedores y usuarios</li>
            <li>Toda su configuración, inventario y datos financieros</li>
          </ul>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">
            Escribe <strong className="text-red-600 font-mono">{slug}</strong> para confirmar:
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={slug}
            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/40 font-mono"
            autoFocus
          />
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!confirmed || loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Eliminar permanentemente
          </button>
        </div>
      </div>
    </div>
  );
}
