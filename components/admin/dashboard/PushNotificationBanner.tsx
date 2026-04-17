"use client";

import { useState, useEffect } from "react";
import { Bell, BellOff, X, Loader2, CheckCircle2 } from "lucide-react";
import { m, AnimatePresence } from "@/components/admin/providers";
import { cn } from "@/lib/utils";

type BannerState = "checking" | "unsupported" | "subscribed" | "unsubscribed" | "loading" | "error" | "success";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export default function PushNotificationBanner() {
  const [state, setState] = useState<BannerState>("checking");
  const [dismissed, setDismissed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "subscribed" : "unsubscribed"))
      .catch(() => setState("unsubscribed"));
  }, []);

  const handleActivate = async () => {
    setState("loading");
    setErrorMsg(null);

    try {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error("VAPID key no configurada");

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("unsubscribed");
        setErrorMsg("Permiso denegado. Actívalo desde la configuración del navegador.");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      });

      const res = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }

      setState("success");
      // Ocultar automáticamente tras 4 segundos
      setTimeout(() => setState("subscribed"), 4000);
    } catch (e) {
      setState("error");
      setErrorMsg(e instanceof Error ? e.message : "No se pudo activar las notificaciones");
    }
  };

  // No renderizar nada si ya está suscrito, no hay soporte, o fue descartado
  if (dismissed || state === "subscribed" || state === "unsupported" || state === "checking") {
    return null;
  }

  return (
    <AnimatePresence>
      {(state === "unsubscribed" || state === "loading" || state === "error" || state === "success") && (
        <m.div
          key="push-banner"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className={cn(
            "relative flex items-center gap-3 rounded-xl border px-4 py-3",
            state === "success"
              ? "border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/20"
              : state === "error"
              ? "border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20"
              : "border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/20"
          )}
        >
          {/* Icono */}
          <div
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
              state === "success"
                ? "bg-emerald-100 dark:bg-emerald-900/40"
                : state === "error"
                ? "bg-red-100 dark:bg-red-900/40"
                : "bg-emerald-100 dark:bg-emerald-900/40"
            )}
          >
            {state === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            ) : state === "error" ? (
              <BellOff className="h-4 w-4 text-red-500 dark:text-red-400" />
            ) : (
              <Bell className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            )}
          </div>

          {/* Texto */}
          <div className="flex-1 min-w-0">
            {state === "success" && (
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                Notificaciones activadas. Recibirás alertas de vencimiento.
              </p>
            )}
            {state === "error" && (
              <>
                <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                  No se pudieron activar las notificaciones
                </p>
                {errorMsg && (
                  <p className="text-[length:var(--ts-xs)] text-red-500 dark:text-red-400 mt-0.5">{errorMsg}</p>
                )}
              </>
            )}
            {(state === "unsubscribed" || state === "loading") && (
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                Activa notificaciones para recibir alertas de vencimiento
              </p>
            )}
          </div>

          {/* Botón Activar */}
          {(state === "unsubscribed" || state === "loading" || state === "error") && (
            <button
              type="button"
              onClick={handleActivate}
              disabled={state === "loading"}
              className={cn(
                "min-h-[44px] min-w-[44px] flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold transition-colors shrink-0",
                state === "error"
                  ? "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-800/50"
                  : "bg-emerald-600 dark:bg-emerald-700 text-white hover:bg-emerald-700 dark:hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {state === "loading" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Activando…
                </>
              ) : state === "error" ? (
                "Reintentar"
              ) : (
                <>
                  <Bell className="h-3.5 w-3.5" />
                  Activar
                </>
              )}
            </button>
          )}

          {/* X para descartar (solo en estado unsubscribed y error) */}
          {(state === "unsubscribed" || state === "error") && (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              title="Descartar"
              className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-foreground hover:bg-white/50 dark:hover:bg-white/10 transition-colors shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </m.div>
      )}
    </AnimatePresence>
  );
}
