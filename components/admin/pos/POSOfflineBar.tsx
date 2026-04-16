"use client";

import { useState, useEffect } from "react";
import { WifiOff, Loader2, CheckCircle, AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

interface POSOfflineBarProps {
  isOnline: boolean;
  pendingCount: number;
  errorCount?: number;
  isSyncing: boolean;
  lastSyncCount: number;
  onSyncRun?: () => void;
  onClearErrors?: () => void;
  onClearQueue?: () => void;
}

export default function POSOfflineBar({
  isOnline,
  pendingCount,
  errorCount = 0,
  isSyncing,
  lastSyncCount,
  onSyncRun,
  onClearErrors,
  onClearQueue,
}: POSOfflineBarProps) {
  const [showSyncSuccess, setShowSyncSuccess] = useState(false);

  // Show success toast for 3 seconds after sync
  useEffect(() => {
    if (lastSyncCount > 0 && !isSyncing) {
      setShowSyncSuccess(true);
      const timer = setTimeout(() => setShowSyncSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [lastSyncCount, isSyncing]);

  // Don't show if online, no pending, no errors, not syncing, no recent sync
  if (isOnline && pendingCount === 0 && errorCount === 0 && !isSyncing && !showSyncSuccess) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 mb-4">
      {/* Error Banner */}
      {errorCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-xs font-semibold text-red-700 dark:text-red-400 flex-1">
            {errorCount} {errorCount === 1 ? "venta" : "ventas"} con error. No se pudo sincronizar.
          </p>
          <div className="flex gap-1.5 shrink-0">
            {onClearErrors && (
              <button
                onClick={onClearErrors}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 rounded-lg text-xs font-bold transition-colors"
                title="Solo elimina las ventas con error"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Descartar
              </button>
            )}
            {onClearQueue && (
              <button
                onClick={onClearQueue}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors"
                title="Elimina toda la cola offline (pendientes + errores)"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Vaciar cola
              </button>
            )}
          </div>
        </div>
      )}

      {/* Syncing state */}
      {isSyncing && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30">
          <Loader2 className="h-4 w-4 text-emerald-500 animate-spin shrink-0" />
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            Sincronizando {pendingCount} {pendingCount === 1 ? "venta" : "ventas"}...
          </p>
        </div>
      )}

      {/* Just synced success */}
      {showSyncSuccess && !isSyncing && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30">
          <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            {lastSyncCount} {lastSyncCount === 1 ? "venta sincronizada" : "ventas sincronizadas"}
          </p>
        </div>
      )}

      {/* Offline state */}
      {!isOnline && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30">
          <WifiOff className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex-1">
            Sin conexion — Las ventas se guardan localmente
          </p>
          {pendingCount > 0 && (
            <span className="text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
              {pendingCount} pendientes
            </span>
          )}
        </div>
      )}

      {/* Online but still has pending */}
      {isOnline && pendingCount > 0 && !isSyncing && !showSyncSuccess && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30">
          <Loader2 className="h-4 w-4 text-emerald-500 animate-spin shrink-0" />
          <p className="text-xs text-emerald-700 dark:text-emerald-300 flex-1">
            {pendingCount} {pendingCount === 1 ? "venta" : "ventas"} pendientes de sincronizar
          </p>
          {onSyncRun && (
            <button
              onClick={onSyncRun}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shrink-0 shadow-sm"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Sincronizar ahora
            </button>
          )}
        </div>
      )}
    </div>
  );
}
