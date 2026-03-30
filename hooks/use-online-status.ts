"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { syncPendingSales, pendingCount } from "@/lib/pos-offline-queue";

interface OnlineStatus {
  isOnline: boolean;
  lastOnline: Date | null;
  pendingCount: number;
  isSyncing: boolean;
}

/**
 * Hook que detecta el estado de conexión a internet.
 * Cuando vuelve la conexión, auto-sincroniza la cola offline del POS.
 */
export function useOnlineStatus(): OnlineStatus {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [lastOnline, setLastOnline] = useState<Date | null>(null);
  const [pending, setPending] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const syncingRef = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await pendingCount();
      setPending(count);
    } catch {
      // ignorar
    }
  }, []);

  const handleOnline = useCallback(async () => {
    setIsOnline(true);
    setLastOnline(new Date());

    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);

    try {
      await syncPendingSales();
      await refreshPendingCount();
    } catch {
      // ignorar fallos de sync
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [refreshPendingCount]);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
  }, []);

  useEffect(() => {
    // Carga inicial del conteo
    void refreshPendingCount();

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [handleOnline, handleOffline, refreshPendingCount]);

  return { isOnline, lastOnline, pendingCount: pending, isSyncing };
}
