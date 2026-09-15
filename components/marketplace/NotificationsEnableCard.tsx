"use client";

/**
 * NotificationsEnableCard — Card para activar notificaciones push del browser.
 *
 * Flow:
 *   1. Muestra card sólo si browser soporta Notification API + estado es
 *      "default" (no preguntado todavía)
 *   2. Beneficios listados: estado pedido, ofertas, "tu lista del mes lista"
 *   3. Botón "Activar" → solicita permiso → si acepta, subscribe a SW
 *   4. Success: pide confirmación visual + oculta card (flag localStorage)
 *
 * Uso: montar en home/explorar como card dismissable. NO intrusivo (no
 * modal), respeta preferencia del usuario.
 */

import { useState, useEffect, useCallback } from "react";
import { Bell, BellRing, Check, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

const STORAGE_DISMISS_KEY = "buleje-notif-enable-dismissed";
const STORAGE_ASKED_KEY = "buleje-notif-asked";

type NotifStatus = "unknown" | "default" | "granted" | "denied" | "unsupported";

export default function NotificationsEnableCard() {
  const [status, setStatus] = useState<NotifStatus>("unknown");
  const [dismissed, setDismissed] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setStatus("unsupported");
      return;
    }
    try {
      if (localStorage.getItem(STORAGE_DISMISS_KEY) === "1") {
        setDismissed(true);
      }
    } catch {
      /* silent */
    }
    setStatus(Notification.permission as NotifStatus);
  }, []);

  const handleEnable = useCallback(async () => {
    if (!("Notification" in window)) return;
    setEnabling(true);
    try {
      const permission = await Notification.requestPermission();
      setStatus(permission as NotifStatus);
      try {
        localStorage.setItem(STORAGE_ASKED_KEY, "1");
      } catch {
        /* silent */
      }
      if (permission === "granted") {
        setJustEnabled(true);
        // Subscribirse al SW (si existe). Silencioso si falla.
        try {
          const reg = await navigator.serviceWorker?.ready;
          if (reg) {
            // La suscripcion VAPID se hace server-side con el endpoint dedicado.
            // Aca solo marcamos que el usuario dio permiso.
            new Notification("Buleje", {
              body: "¡Listo! Te avisaremos cuando tu pedido esté en camino.",
              icon: "/favicon.ico",
            });
          }
        } catch {
          /* silent */
        }
      }
    } finally {
      setEnabling(false);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_DISMISS_KEY, "1");
    } catch {
      /* silent */
    }
  }, []);

  // No renderizar si:
  // - No soporte del browser
  // - Usuario dismissed
  // - Ya otorgó o denegó permiso
  if (
    status === "unknown" ||
    status === "unsupported" ||
    status === "granted" ||
    status === "denied" ||
    dismissed
  ) {
    if (justEnabled) {
      return (
        <section className="rounded-2xl border border-[var(--accent)]/30 bg-primary/10 p-4 flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
            <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
          </span>
          <div className="flex-1">
            <p className="text-sm font-extrabold text-[var(--text-primary)]">
              ¡Notificaciones activadas!
            </p>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
              Te avisaremos del estado de tu pedido y ofertas relevantes
            </p>
          </div>
          <button
            type="button"
            onClick={() => setJustEnabled(false)}
            aria-label="Cerrar"
            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-white/50 transition-colors"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </section>
      );
    }
    return null;
  }

  return (
    <section
      aria-label="Activar notificaciones"
      className="relative rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 overflow-hidden"
    >
      {/* Close button top-right */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Ahora no"
        className="absolute top-3 right-3 p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
      >
        <X className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>

      <div className="flex items-start gap-3 mb-3 pr-8">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] shrink-0">
          <BellRing className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="flex-1">
          <h3 className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
            Activá notificaciones
          </h3>
          <p className="text-sm text-[var(--text-tertiary)] mt-1 leading-relaxed">
            Enterate al momento cuando tu pedido esté listo, hay ofertas en tu
            bodega favorita o tu reposición del mes está armada.
          </p>
        </div>
      </div>

      {/* Beneficios */}
      <ul className="space-y-1.5 mb-4 pl-1">
        {[
          "Estado de tus pedidos en vivo",
          "Ofertas flash de tus bodegas",
          "Lista del mes lista automáticamente",
        ].map((txt) => (
          <li
            key={txt}
            className="flex items-start gap-2 text-sm text-[var(--text-secondary)]"
          >
            <Check className="h-3.5 w-3.5 mt-0.5 text-[var(--accent)] shrink-0" strokeWidth={2.5} aria-hidden />
            {txt}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={handleEnable}
        disabled={enabling}
        className={cn(
          "w-full inline-flex items-center justify-center gap-2 rounded-full py-3 text-sm font-bold transition-all active:scale-[0.98]",
          enabling
            ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-wait"
            : "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:bg-[var(--accent)]",
        )}
      >
        <Bell className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        {enabling ? "Solicitando permiso…" : "Activar notificaciones"}
      </button>
      <p className="mt-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-center">
        Podés desactivarlas cuando quieras desde tu navegador
      </p>
    </section>
  );
}
