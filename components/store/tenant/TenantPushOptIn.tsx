"use client";

/**
 * TenantPushOptIn — opt-in de notificaciones push en el storefront /t/<slug>
 * (Brandon 2026-06-28, audit #8). Flujo COMPLETO: pide permiso → registra el SW
 * (/sw.js, que ya maneja 'push') → pushManager.subscribe con la VAPID pública →
 * POST a /api/store-page/push-subscribe (público, CSRF por cookie). No intrusivo:
 * card dismissable, una vez por navegador (localStorage). Solo se monta si el
 * dueño lo activó Y hay VAPID key (en dev sin key, no se renderiza).
 */
import { useCallback, useEffect, useState } from "react";
import { Bell, Check, X } from "@buleje/design-system/icons";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const KEY = (slug: string) => `buleje-push-optin-${slug}`;

export default function TenantPushOptIn({ slug, vapidKey, message }: { slug: string; vapidKey: string; message?: string }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("preview") === "true") return; // no en el editor
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission !== "default") return; // ya respondió antes
    let dismissed = false;
    try { dismissed = localStorage.getItem(KEY(slug)) === "1"; } catch { /* private */ }
    if (dismissed) return;
    const t = setTimeout(() => setShow(true), 2500);
    return () => clearTimeout(t);
  }, [slug]);

  const close = useCallback((persist: boolean) => {
    setShow(false);
    if (persist) { try { localStorage.setItem(KEY(slug), "1"); } catch { /* ignore */ } }
  }, [slug]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { close(true); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const csrf = decodeURIComponent(document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1] || "");
      const res = await fetch("/api/store-page/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ slug, subscription: { endpoint: json.endpoint, keys: json.keys } }),
      });
      if (res.ok) { setDone(true); try { localStorage.setItem(KEY(slug), "1"); } catch { /* ignore */ } }
      else close(false);
    } catch {
      close(false);
    } finally {
      setBusy(false);
    }
  }, [slug, vapidKey, close]);

  if (!vapidKey || (!show && !done)) return null;

  if (done) {
    return (
      <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--surface-raised)] px-4 py-2 shadow-[var(--shadow-lg)] ring-1 ring-black/5">
        <Check className="h-4 w-4" style={{ color: "var(--tenant-primary, var(--accent))" }} aria-hidden />
        <span className="text-sm font-semibold text-[var(--text-primary)]">¡Listo! Vas a recibir nuestras ofertas.</span>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-xl)] ring-1 ring-black/5 sm:inset-x-auto sm:right-5">
      <button type="button" onClick={() => close(true)} aria-label="Ahora no" className="absolute right-2.5 top-2.5 rounded-md p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]">
        <X className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--tenant-primary, var(--accent))", color: "#fff" }}>
          <Bell className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--text-primary)]">{message?.trim() || "Recibí nuestras ofertas y novedades"}</p>
          <button type="button" onClick={enable} disabled={busy} className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-4 h-9 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50" style={{ background: "var(--tenant-primary, var(--accent))" }}>
            <Bell className="h-4 w-4" strokeWidth={2} aria-hidden />
            {busy ? "Activando…" : "Activar notificaciones"}
          </button>
        </div>
      </div>
    </div>
  );
}
