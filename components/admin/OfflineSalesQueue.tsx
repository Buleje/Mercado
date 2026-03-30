"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  WifiOff,
  Wifi,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type SyncStatus = "pending" | "syncing" | "synced" | "error";

interface QueuedSale {
  queueId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  status: SyncStatus;
  error?: string;
  syncedAt?: string;
}

const STORAGE_KEY = "offline_sales_queue";

// ─── Storage helpers ──────────────────────────────────────────────────────────

function loadQueue(): QueuedSale[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedSale[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedSale[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // localStorage full or unavailable
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const STATUS_CONFIG: Record<
  SyncStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  pending: { label: "Pendiente", color: "text-amber-600 dark:text-amber-400", icon: Clock },
  syncing: { label: "Sincronizando...", color: "text-blue-600 dark:text-blue-400", icon: Loader2 },
  synced: { label: "Sincronizado", color: "text-green-600 dark:text-green-400", icon: CheckCircle },
  error: { label: "Error", color: "text-red-600 dark:text-red-400", icon: AlertCircle },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function OfflineSalesQueue() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [queue, setQueue] = useState<QueuedSale[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);

  // Load queue on mount
  useEffect(() => {
    setQueue(loadQueue());
  }, []);

  // Listen to online/offline
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const updateQueue = useCallback((updater: (prev: QueuedSale[]) => QueuedSale[]) => {
    setQueue((prev) => {
      const next = updater(prev);
      saveQueue(next);
      return next;
    });
  }, []);

  const syncOne = useCallback(
    async (sale: QueuedSale): Promise<boolean> => {
      updateQueue((prev) =>
        prev.map((s) => (s.queueId === sale.queueId ? { ...s, status: "syncing" } : s))
      );

      try {
        const res = await fetch("/api/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sale.payload),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        updateQueue((prev) =>
          prev.map((s) =>
            s.queueId === sale.queueId
              ? { ...s, status: "synced", syncedAt: new Date().toISOString(), error: undefined }
              : s
          )
        );
        return true;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Error desconocido";
        updateQueue((prev) =>
          prev.map((s) =>
            s.queueId === sale.queueId ? { ...s, status: "error", error: errMsg } : s
          )
        );
        return false;
      }
    },
    [updateQueue]
  );

  const syncAll = useCallback(async () => {
    if (syncingRef.current || !isOnline) return;

    const pending = queue.filter((s) => s.status === "pending" || s.status === "error");
    if (pending.length === 0) return;

    syncingRef.current = true;
    setIsSyncing(true);

    for (const sale of pending) {
      await syncOne(sale);
    }

    syncingRef.current = false;
    setIsSyncing(false);
  }, [queue, isOnline, syncOne]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline) {
      const timer = setTimeout(() => {
        syncAll();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isOnline, syncAll]);

  const removeItem = useCallback(
    (queueId: string) => {
      updateQueue((prev) => prev.filter((s) => s.queueId !== queueId));
    },
    [updateQueue]
  );

  const clearSynced = useCallback(() => {
    updateQueue((prev) => prev.filter((s) => s.status !== "synced"));
  }, [updateQueue]);

  // Demo: add a fake offline sale
  const addDemoSale = useCallback(() => {
    const demo: QueuedSale = {
      queueId: generateId(),
      payload: {
        items: [{ productId: 1, quantity: 2, price: 22.5 }],
        total: 45.0,
        customerName: "Cliente demo",
        paymentMethod: "efectivo",
      },
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    updateQueue((prev) => [demo, ...prev]);
  }, [updateQueue]);

  const pendingCount = queue.filter((s) => s.status === "pending" || s.status === "error").length;
  const syncedCount = queue.filter((s) => s.status === "synced").length;

  return (
    <div className="flex flex-col gap-4">
      {/* Status bar */}
      <div
        className={cn(
          "flex items-center justify-between rounded-xl border p-4 transition",
          isOnline
            ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
            : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
        )}
      >
        <div className="flex items-center gap-3">
          {isOnline ? (
            <Wifi className="h-5 w-5 text-green-600 dark:text-green-400" />
          ) : (
            <WifiOff className="h-5 w-5 text-red-600 dark:text-red-400" />
          )}
          <div>
            <p
              className={cn(
                "text-sm font-semibold",
                isOnline ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
              )}
            >
              {isOnline ? "Conectado" : "Sin conexión"}
            </p>
            {!isOnline && (
              <p className="text-xs text-red-600 dark:text-red-400">
                Las ventas se guardan localmente hasta recuperar conexión.
              </p>
            )}
          </div>
        </div>

        {pendingCount > 0 && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            {pendingCount} pendiente{pendingCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={syncAll}
          disabled={isSyncing || !isOnline || pendingCount === 0}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition",
            "bg-[#0f766e] hover:bg-[#245a40] disabled:opacity-40"
          )}
        >
          <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
          {isSyncing ? "Sincronizando..." : "Forzar sincronización"}
        </button>

        {syncedCount > 0 && (
          <button
            onClick={clearSynced}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Trash2 className="h-4 w-4" />
            Limpiar sincronizados ({syncedCount})
          </button>
        )}

        <button
          onClick={addDemoSale}
          className="ml-auto rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-400 hover:border-gray-400 dark:border-gray-600"
        >
          + Venta demo
        </button>
      </div>

      {/* Queue list */}
      {queue.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-10 dark:border-gray-700">
          <CheckCircle className="mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-400">Sin ventas en cola</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="border-b border-gray-100 px-5 py-3 dark:border-gray-700">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Cola de ventas ({queue.length})
            </p>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {queue.map((sale) => {
              const cfg = STATUS_CONFIG[sale.status];
              const StatusIcon = cfg.icon;
              const d = new Date(sale.createdAt);
              const timeStr = d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
              const dateStr = d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
              const total = (sale.payload.total as number) ?? 0;

              return (
                <div key={sale.queueId} className="flex items-center gap-3 px-5 py-3">
                  <StatusIcon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      cfg.color,
                      sale.status === "syncing" && "animate-spin"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      Venta · S/ {total.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {dateStr} {timeStr}
                      {sale.error && (
                        <span className="ml-2 text-red-500">· {sale.error}</span>
                      )}
                      {sale.syncedAt && (
                        <span className="ml-2 text-green-600 dark:text-green-400">
                          · Sincronizado a las{" "}
                          {new Date(sale.syncedAt).toLocaleTimeString("es-PE", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className={cn("text-xs font-medium", cfg.color)}>{cfg.label}</span>
                  {(sale.status === "pending" || sale.status === "error" || sale.status === "synced") && (
                    <button
                      onClick={() => removeItem(sale.queueId)}
                      className="ml-1 rounded-md p-1 text-gray-300 hover:text-red-500 dark:text-gray-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary footer */}
          <div className="flex gap-6 border-t border-gray-100 bg-gray-50 px-5 py-3 text-xs dark:border-gray-700 dark:bg-gray-800/50">
            {(["pending", "syncing", "synced", "error"] as SyncStatus[]).map((s) => {
              const count = queue.filter((q) => q.status === s).length;
              const cfg = STATUS_CONFIG[s];
              return (
                <div key={s} className="flex items-center gap-1">
                  <span className={cn("font-bold", cfg.color)}>{count}</span>
                  <span className="text-gray-400">{cfg.label.toLowerCase()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
