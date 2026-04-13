"use client";

import { useEffect, useState } from "react";
import { m, AnimatePresence } from "@/components/admin/providers";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { WifiOff, Wifi, Loader2, Check } from "lucide-react";

type BannerState = "offline" | "syncing" | "synced" | "hidden";

/**
 * Indicador visual de estado de conexión para el POS.
 * Aparece como barra fija en la parte superior cuando no hay conexión.
 */
export default function OfflineIndicator() {
  const { isOnline, pendingCount, isSyncing } = useOnlineStatus();
  const [bannerState, setBannerState] = useState<BannerState>("hidden");

  useEffect(() => {
    if (!isOnline) {
      setBannerState("offline");
      return;
    }

    if (isSyncing) {
      setBannerState("syncing");
      return;
    }

    if (bannerState === "syncing" || bannerState === "offline") {
      // Acababa de sincronizar — mostrar confirmación y luego ocultar
      setBannerState("synced");
      const timer = setTimeout(() => setBannerState("hidden"), 3000);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, isSyncing]);

  const variants = {
    initial: { y: -60, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: -60, opacity: 0 },
  };

  return (
    <AnimatePresence>
      {bannerState !== "hidden" && (
        <m.div
          key={bannerState}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.25, ease: "easeOut" }}
          className={`
            w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold
            ${bannerState === "offline"
              ? "bg-amber-400 dark:bg-amber-500 text-amber-900 dark:text-amber-950"
              : bannerState === "syncing"
              ? "bg-blue-500 dark:bg-blue-600 text-white"
              : "bg-emerald-500 dark:bg-emerald-600 text-white"
            }
          `}
          role="status"
          aria-live="polite"
        >
          {bannerState === "offline" && (
            <>
              <WifiOff className="h-4 w-4 shrink-0" />
              <span className="flex-1">
                Sin conexion — Las ventas se guardan localmente
              </span>
              {pendingCount > 0 && (
                <span className="ml-auto bg-amber-700/20 dark:bg-amber-950/30 text-amber-900 dark:text-amber-950 text-xs font-bold px-2 py-0.5 rounded-full">
                  {pendingCount} pendiente{pendingCount !== 1 ? "s" : ""}
                </span>
              )}
            </>
          )}

          {bannerState === "syncing" && (
            <>
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              <span className="flex-1">
                Conexion restaurada — Sincronizando {pendingCount > 0 ? `${pendingCount} venta${pendingCount !== 1 ? "s" : ""}` : "ventas"}...
              </span>
            </>
          )}

          {bannerState === "synced" && (
            <>
              <Check className="h-4 w-4 shrink-0" />
              <span className="flex-1">Todo sincronizado</span>
              <Wifi className="h-4 w-4 shrink-0 opacity-70" />
            </>
          )}
        </m.div>
      )}
    </AnimatePresence>
  );
}
