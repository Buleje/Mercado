"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    // Desactivar Service Worker durante desarrollo para evitar conflictos
    if (process.env.NODE_ENV === "development") {
      navigator.serviceWorker?.getRegistrations().then(registrations => {
        registrations.forEach(reg => reg.unregister());
      });
      return;
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // PWA enhancement 2026-05-12 (ADR-105): solicitar persistent storage.
    // Por defecto el browser puede purgar caches/IndexedDB en presión de
    // memoria. Con persist(), Buleje queda en la lista "protegida" — crítico
    // para POS offline (pendingSales) y catálogo cacheado en señal inestable.
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      navigator.storage.persisted?.().then((already) => {
        if (!already) {
          // Solo solicita 1 vez, browser muestra prompt si la heurística lo justifica
          navigator.storage.persist().catch(() => {});
        }
      }).catch(() => {});
    }

    // PWA enhancement 2026-05-12: App Badging API.
    // Si el browser soporta (Chrome Android, Edge), muestra count de pedidos
    // pending del usuario como badge en el icono home screen. Lee del cache
    // local (no fetch — el SW ya cacheó /api/orders).
    type NavigatorWithBadging = Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    const navWithBadge = navigator as NavigatorWithBadging;
    if (typeof window !== "undefined" && typeof navWithBadge.setAppBadge === "function") {
      // Leer count desde localStorage que la app actualiza al fetcher pedidos
      const pendingCount = Number(localStorage.getItem("buleje-pending-orders") ?? "0");
      if (pendingCount > 0) {
        navWithBadge.setAppBadge(pendingCount).catch(() => {});
      } else {
        navWithBadge.clearAppBadge?.().catch(() => {});
      }
    }
  }, []);
  return null;
}
