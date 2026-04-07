"use client";

import { useState } from "react";
import { Bomb, AlertTriangle, Loader2 } from "lucide-react";

interface NuclearResetModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

const CONFIRM_TEXT = "BORRAR TODO";

export function NuclearResetModal({ onConfirm, onCancel, loading }: NuclearResetModalProps) {
  const [typed, setTyped] = useState("");
  const confirmed = typed === CONFIRM_TEXT;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
            <Bomb className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-red-600">Borrar TODOS los datos</h3>
            <p className="text-sm text-gray-500">Reinicio total del sistema</p>
          </div>
        </div>

        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4 space-y-2">
          <p className="text-sm text-red-700 dark:text-red-300 font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Se eliminará TODO de TODAS las tiendas:
          </p>
          <ul className="text-xs text-red-600 dark:text-red-400 space-y-1 ml-6 list-disc">
            <li>Todos los productos, pedidos, ventas e historial</li>
            <li>Todos los clientes, proveedores y lotes</li>
            <li>Toda la configuración, inventario y datos financieros</li>
            <li>Todas las actividades, notificaciones y mensajes</li>
            <li>El sistema quedará <strong>completamente limpio</strong>, como recién instalado</li>
          </ul>
          <p className="text-xs text-red-700 dark:text-red-300 mt-2 font-semibold">
            Las tiendas (tenants) se mantienen, pero sin ningún dato dentro.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">
            Escribe <strong className="text-red-600 font-mono">{CONFIRM_TEXT}</strong> para confirmar:
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={CONFIRM_TEXT}
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
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bomb className="w-4 h-4" />}
            Borrar todo
          </button>
        </div>
      </div>
    </div>
  );
}
