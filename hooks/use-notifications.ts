"use client";

import { useCallback, useEffect, useState, startTransition } from "react";

type NotifPermission = "default" | "granted" | "denied";

const STORAGE_KEY = "bsm-notif-asked";
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function registerPushSubscription(phone?: string): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const sub = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
    });
    await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: { endpoint: sub.endpoint, keys: { p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")!))), auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth")!))) } }, phone }),
    });
  } catch { /* Push not supported or blocked */ }
}

export function useNotifications() {
  const [permission, setPermission] = useState<NotifPermission>("default");
  const [hasAsked, setHasAsked] = useState(false);

  // Hydrate browser-only values after mount
  useEffect(() => {
    startTransition(() => {
      if (typeof Notification !== "undefined") {
        setPermission(Notification.permission as NotifPermission);
      }
      setHasAsked(localStorage.getItem(STORAGE_KEY) === "true");
    });
  }, []);

  const requestPermission = useCallback(async (phone?: string) => {
    if (typeof Notification === "undefined") return "denied" as NotifPermission;
    if (Notification.permission === "granted") {
      setPermission("granted");
      await registerPushSubscription(phone);
      return "granted" as NotifPermission;
    }
    if (Notification.permission === "denied") {
      setPermission("denied");
      return "denied" as NotifPermission;
    }
    const result = await Notification.requestPermission();
    setPermission(result as NotifPermission);
    localStorage.setItem(STORAGE_KEY, "true");
    setHasAsked(true);
    if (result === "granted") {
      await registerPushSubscription(phone);
    }
    return result as NotifPermission;
  }, []);

  const sendNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      new Notification(title, {
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-192x192.png",
        ...options,
      });
    } catch { /* SW notification fallback not needed for basic usage */ }
  }, []);

  return { permission, requestPermission, sendNotification, hasAsked };
}
