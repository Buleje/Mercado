"use client";

import { useState } from "react";
import { Bomb, AlertTriangle, Loader2 } from "@buleje/design-system/icons";

interface NuclearResetModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  tenantCount?: number;
  tenantNames?: string[];
}

const CONFIRM_TEXT = "BORRAR TODO";

export function NuclearResetModal({ onConfirm, onCancel, loading, tenantCount, tenantNames }: NuclearResetModalProps) {
  const [typed, setTyped] = useState("");
  const confirmed = typed === CONFIRM_TEXT;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-[var(--surface-raised)] rounded-xl shadow-[var(--shadow-xl)] max-w-md w-full mx-4 p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[var(--data-error-100)] dark:bg-red-950/40 flex items-center justify-center">
            <Bomb className="w-6 h-6 text-[var(--data-error-500)]" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[var(--data-error-500)]">Borrar TODOS los datos</h3>
            <p className="text-sm text-gray-500">Reinicio total del sistema</p>
          </div>
        </div>

        <div className="bg-[var(--data-error-50)] dark:bg-red-950/30 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] rounded-xl p-4 space-y-2">
          <p className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Se eliminará TODO de TODAS las tiendas:
          </p>
          <ul className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] space-y-1 ml-6 list-disc">
            <li>Todos los productos, pedidos, ventas e historial</li>
            <li>Todos los clientes, proveedores y lotes</li>
            <li>Toda la configuración, inventario y datos financieros</li>
            <li>Todas las actividades, notificaciones y mensajes</li>
            <li>El sistema quedará <strong>completamente limpio</strong>, como recién instalado</li>
          </ul>
          <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] mt-2 font-semibold">
            Las tiendas (tenants) se mantienen, pero sin ningún dato dentro.
          </p>
          {typeof tenantCount === "number" && tenantCount > 0 && (
            <div className="mt-3 pt-3 border-t border-[var(--data-error-500)]/30 space-y-1">
              <p className="text-xs text-[var(--data-error-500)] font-bold">
                Afecta a {tenantCount} tienda{tenantCount === 1 ? "" : "s"} actualmente:
              </p>
              {tenantNames && tenantNames.length > 0 && (
                <p className="text-xs text-[var(--data-error-500)] font-mono">
                  {tenantNames.join(", ")}
                  {tenantCount > tenantNames.length && ` + ${tenantCount - tenantNames.length} más`}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm text-[var(--text-secondary)]">
            Escribe <strong className="text-[var(--data-error-500)] font-mono">{CONFIRM_TEXT}</strong> para confirmar:
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={CONFIRM_TEXT}
            className="w-full bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--data-error-500)]/40 font-mono"
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
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bomb className="w-4 h-4" />}
            Borrar todo
          </button>
        </div>
      </div>
    </div>
  );
}
