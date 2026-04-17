"use client";

import { useState, useEffect, useCallback } from "react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// ── Types ────────────────────────────────────────────────────────────────────

export type PushPermissionState = "prompt" | "granted" | "denied" | "unsupported";

export interface UsePushNotificationsReturn {
  /** Whether the browser supports Web Push */
  isSupported: boolean;
  /** Current notification permission state */
  permission: PushPermissionState;
  /** Whether the user has an active push subscription */
  isSubscribed: boolean;
  /** Whether a subscribe/unsubscribe operation is in progress */
  isLoading: boolean;
  /** Last error message (null if none) */
  error: string | null;
  /** Request permission + subscribe to push */
  requestPermission: () => Promise<boolean>;
  /** Unsubscribe from push notifications */
  unsubscribe: () => Promise<void>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePushNotifications(): UsePushNotificationsReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<PushPermissionState>("prompt");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check support + current subscription on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    setIsSupported(supported);

    if (!supported) {
      setPermission("unsupported");
      return;
    }

    // Read current permission
    setPermission(Notification.permission as PushPermissionState);

    // Check if already subscribed
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setIsSubscribed(!!sub))
      .catch(() => setIsSubscribed(false));
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError("Tu navegador no soporta notificaciones push");
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        throw new Error("Configuracion de notificaciones no disponible");
      }

      // Request permission
      const result = await Notification.requestPermission();
      setPermission(result as PushPermissionState);

      if (result !== "granted") {
        setError("Permiso denegado. Puedes activarlo desde la configuracion del navegador.");
        return false;
      }

      // Subscribe via PushManager
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      });

      // Send subscription to our marketplace API
      const res = await fetch("/api/marketplace/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error ?? `Error ${res.status} al guardar la suscripcion`,
        );
      }

      setIsSubscribed(true);
      return true;
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "No se pudieron activar las notificaciones";
      setError(msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();

      if (subscription) {
        // Notify server
        await fetch("/api/marketplace/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => {});

        // Unsubscribe locally
        await subscription.unsubscribe();
      }

      setIsSubscribed(false);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "No se pudo desactivar las notificaciones";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    error,
    requestPermission,
    unsubscribe,
  };
}
