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
  }, []);
  return null;
}
