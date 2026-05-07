"use client";

import { useState, useEffect } from "react";
import { WifiOff, Loader2, CheckCircle, AlertTriangle, RefreshCw, Trash2 } from "@buleje/design-system/icons";

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
        <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30">
          <AlertTriangle className="h-4 w-4 text-[var(--data-error-500)] shrink-0" />
          <p className="text-xs font-semibold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] flex-1">
            {errorCount} {errorCount === 1 ? "venta" : "ventas"} con error. No se pudo sincronizar.
          </p>
          <div className="flex gap-1.5 shrink-0">
            {onClearErrors && (
              <button
                onClick={onClearErrors}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-[var(--data-error-100)] hover:bg-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/40 dark:hover:bg-[var(--data-error-500)]/60 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] rounded-lg text-xs font-bold transition-colors"
                title="Solo elimina las ventas con error"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Descartar
              </button>
            )}
            {onClearQueue && (
              <button
                onClick={onClearQueue}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)] text-white rounded-lg text-xs font-bold transition-colors"
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
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
          <Loader2 className="h-4 w-4 text-[var(--data-success-500)] animate-spin shrink-0" />
          <p className="text-xs font-semibold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
            Sincronizando {pendingCount} {pendingCount === 1 ? "venta" : "ventas"}...
          </p>
        </div>
      )}

      {/* Just synced success */}
      {showSyncSuccess && !isSyncing && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
          <CheckCircle className="h-4 w-4 text-[var(--data-success-500)] shrink-0" />
          <p className="text-xs font-semibold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
            {lastSyncCount} {lastSyncCount === 1 ? "venta sincronizada" : "ventas sincronizadas"}
          </p>
        </div>
      )}

      {/* Offline state */}
      {!isOnline && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30">
          <WifiOff className="h-4 w-4 text-[var(--data-warning-500)] shrink-0" />
          <p className="text-xs font-semibold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] flex-1">
            Sin conexion — Las ventas se guardan localmente
          </p>
          {pendingCount > 0 && (
            <span className="text-[length:var(--ts-2xs)] font-bold bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] px-2 py-0.5 rounded-full">
              {pendingCount} pendientes
            </span>
          )}
        </div>
      )}

      {/* Online but still has pending */}
      {isOnline && pendingCount > 0 && !isSyncing && !showSyncSuccess && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
          <Loader2 className="h-4 w-4 text-[var(--data-success-500)] animate-spin shrink-0" />
          <p className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)] flex-1">
            {pendingCount} {pendingCount === 1 ? "venta" : "ventas"} pendientes de sincronizar
          </p>
          {onSyncRun && (
            <button
              onClick={onSyncRun}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] text-white rounded-lg text-xs font-bold transition-colors shrink-0 "
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
