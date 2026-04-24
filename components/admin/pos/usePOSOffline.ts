"use client";

import { useState, useEffect, useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";

const QUEUE_KEY = "pos-offline-queue";

export interface OfflineSale {
  _offlineId: number;
  _synced: boolean;
  _hasError?: boolean;
  _errorMessage?: string;
  [key: string]: unknown;
}

export function usePOSOffline() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncCount, setLastSyncCount] = useState(0);

  const getQueue = useCallback((): OfflineSale[] => {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    } catch {
      return [];
    }
  }, []);

  const syncQueue = useCallback(async () => {
    const queue = getQueue();
    if (queue.length === 0) return;
    // Don't run if every item is already marked as errored
    if (queue.every(s => s._hasError)) return;

    setIsSyncing(true);

    const remaining: OfflineSale[] = [];
    let synced = 0;
    let newErrors = 0;

    for (const sale of queue) {
      if (sale._hasError) {
        remaining.push(sale);
        newErrors++;
        continue;
      }

      try {
        // Strip ALL internal offline metadata before posting
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _offlineId, _synced, _hasError, _errorMessage, ...salePayload } = sale;
        const res = await fetch("/api/sales", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(salePayload),
        });

        if (res.ok) {
          synced++;
        } else {
          // Any non-ok HTTP response: mark as fatal error so it doesn't block the queue indefinitely
          let errMsg = `Error HTTP ${res.status}`;
          try {
            const errData = await res.json();
            if (errData?.error) {
              errMsg = typeof errData.error === "string" ? errData.error : JSON.stringify(errData.error);
            }
          } catch { /* ignore parse error */ }

          remaining.push({ ...sale, _hasError: true, _errorMessage: errMsg });
          newErrors++;
        }
      } catch {
        // Network failure — keep as pending for retry
        remaining.push(sale);
      }
    }

    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    setPendingCount(remaining.filter(s => !s._hasError).length);
    setErrorCount(newErrors);
    setLastSyncCount(synced);
    setIsSyncing(false);
  }, [getQueue]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      syncQueue();
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Count pending and errors on mount
    const q = getQueue();
    const pending = q.filter(s => !s._hasError);
    const errors = q.filter(s => s._hasError);
    setPendingCount(pending.length);
    setErrorCount(errors.length);

    // Auto-sync on mount if online and there are pending items
    if (typeof navigator !== "undefined" && navigator.onLine && pending.length > 0) {
      syncQueue();
    }

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [getQueue, syncQueue]);

  /** Remove only items marked as errored */
  const clearErrors = useCallback(() => {
    const queue = getQueue().filter(s => !s._hasError);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    setErrorCount(0);
    setPendingCount(queue.length);
  }, [getQueue]);

  /** Wipe the ENTIRE offline queue (both pending and errored items) */
  const clearQueue = useCallback(() => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([]));
    setPendingCount(0);
    setErrorCount(0);
  }, []);

  const addToQueue = useCallback(
    (sale: Record<string, unknown>) => {
      const queue = getQueue();
      queue.push({
        ...sale,
        _offlineId: Date.now(),
        _synced: false,
      } as OfflineSale);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      setPendingCount(queue.filter(s => !s._hasError).length);
    },
    [getQueue]
  );

  return {
    isOnline,
    pendingCount,
    errorCount,
    isSyncing,
    lastSyncCount,
    addToQueue,
    syncQueue,
    clearErrors,
    clearQueue,
  };
}
