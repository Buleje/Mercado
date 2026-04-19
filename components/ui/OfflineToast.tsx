"use client";

import { useEffect, useRef } from "react";
import { WifiOff, Wifi } from "@buleje/design-system/icons";
import { useOnlineStatus } from "@/hooks/use-online-status";

/**
 * OfflineToast — banner fijo en la parte inferior de la pantalla.
 *
 * - Aparece cuando el usuario pierde conexión.
 * - Se oculta automáticamente 2.5s después de recuperarla.
 * - No interrumpe el flujo: z-50, pointer-events solo cuando es visible.
 *
 * Uso: montar una sola vez en el layout raíz, fuera del <main>.
 *   <OfflineToast />
 */
export function OfflineToast() {
  const { isOnline } = useOnlineStatus();
  // Track whether we've ever gone offline so we show the "back online" flash
  const wentOfflineRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When we go offline, record it
  useEffect(() => {
    if (!isOnline) {
      wentOfflineRef.current = true;
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    }
  }, [isOnline]);

  // Determine display state
  const showOffline = !isOnline;
  // Show "back online" briefly only if we previously went offline
  const showOnline = isOnline && wentOfflineRef.current;

  // Reset the "back online" flag after the animation completes (2.5s)
  useEffect(() => {
    if (showOnline) {
      hideTimerRef.current = setTimeout(() => {
        wentOfflineRef.current = false;
      }, 2500);
      return () => {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      };
    }
  }, [showOnline]);

  const visible = showOffline || showOnline;

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={[
        "fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-md",
        "flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-lg",
        "text-xs sm:text-sm font-semibold",
        "transition-all duration-300 ease-out",
        "pointer-events-none select-none",
        showOffline
          ? "bg-amber-400 text-amber-950"
          : "bg-green-500 text-white",
      ].join(" ")}
    >
      {showOffline ? (
        <>
          <WifiOff className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span>Modo offline — Puedes navegar y hacer pedidos. Se enviarán al reconectarte.</span>
        </>
      ) : (
        <>
          <Wifi className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span>Conexión restaurada — Sincronizando datos</span>
        </>
      )}
    </div>
  );
}
