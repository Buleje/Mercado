"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Bell } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { shouldIgnoreShortcut } from "@/lib/keyboard-guards";
import { cachedJson } from "@/lib/client-cache-fetch";
import { useNotificationCenter } from "./useNotificationCenter";
import NotificationHub from "./NotificationHub";

// ── Fetch critical alert count silently ──────────────────────────────────────

function useCriticalAlertCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        // cachedJson: comparte stats/batches con NotificationHub + widgets del
        // dashboard (antes cada uno disparaba su request). TTL 30s = el intervalo
        // de 2min re-chequea fresco. Perf 2026-05-29.
        const [stats, batches] = await Promise.all([
          cachedJson<{ lowStockProducts?: number; pendingOrders?: number }>("/api/admin/stats", 30_000),
          cachedJson<{ items?: unknown[] } | unknown[]>("/api/batches/expiring", 30_000),
        ]);

        if (cancelled) return;
        let critical = 0;

        if (stats) {
          if ((stats.lowStockProducts ?? 0) > 10) critical++;
          if ((stats.pendingOrders ?? 0) > 5) critical++;
        }

        if (batches) {
          const items = (Array.isArray(batches) ? batches : batches.items ?? []) as Array<{ expiryDate?: string; fechaVencimiento?: string }>;
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          for (const b of items) {
            const exp = new Date(b.expiryDate || b.fechaVencimiento || 0);
            const days = Math.round((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (days <= 3) { critical++; break; }
          }
        }

        setCount(critical);
      } catch { /* silent */ }
    }

    check();
    const interval = setInterval(check, 120_000); // Re-check every 2 min
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return count;
}

// Track whether the user has interacted with the page (required for vibrate)
let _userHasInteracted = false;
if (typeof window !== "undefined") {
  const markInteracted = () => { _userHasInteracted = true; };
  window.addEventListener("pointerdown", markInteracted, { once: true, capture: true });
  window.addEventListener("keydown", markInteracted, { once: true, capture: true });
}

// ── Sound & vibration helper ─────────────────────────────────────────────────

function alertFeedback() {
  // Short vibration (mobile) — only after real user interaction to avoid [Intervention] warning
  try {
    if (
      _userHasInteracted &&
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function" &&
      document.hasFocus()
    ) {
      navigator.vibrate([100, 50, 100]);
    }
  } catch { /* ignore — blocked by permissions policy */ }

  // Soft notification beep using Web Audio API — requires prior user gesture
  try {
    if (typeof window !== "undefined" && typeof AudioContext !== "undefined") {
      const ctx = new AudioContext();
      if (ctx.state === "suspended") {
        void ctx.close();
        return;
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.1;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.stop(ctx.currentTime + 0.3);
      setTimeout(() => void ctx.close(), 500);
    }
  } catch { /* ignore — some browsers block AudioContext */ }
}

export default function NotificationBell() {
  const {
    notifications,
    unreadCount,
    isLoading,
    filter,
    setFilter,
    markAsRead,
    markAllRead,
    refetch,
  } = useNotificationCenter();

  const criticalCount = useCriticalAlertCount();
  const totalBadge = unreadCount + criticalCount;

  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const prevCount = useRef(unreadCount);
  const prevCritical = useRef(criticalCount);

  // Pulse animation + sound when count increases
  useEffect(() => {
    if (unreadCount > prevCount.current || criticalCount > prevCritical.current) {
      setPulse(true);
      // Sound/vibration only for new critical alerts
      if (criticalCount > prevCritical.current) {
        alertFeedback();
      }
      const timeout = setTimeout(() => setPulse(false), 2000);
      prevCount.current = unreadCount;
      prevCritical.current = criticalCount;
      return () => clearTimeout(timeout);
    }
    prevCount.current = unreadCount;
    prevCritical.current = criticalCount;
  }, [unreadCount, criticalCount]);

  // Keyboard shortcut: "N" abre el panel — SOLO como tecla simple deliberada.
  // FIX 2026-07-08 (reporte QA Compras): antes se disparaba con cualquier "n"
  // aunque hubiera un modal abierto o el usuario tuviera Ctrl/Cmd/Alt pulsado
  // (ej. Cmd+N del navegador) → abría el Centro de Notificaciones sin pedirlo.
  // `shouldIgnoreShortcut` centraliza el guard (campo editable + modal abierto +
  // modificadores).
  const handleKeydown = useCallback((e: KeyboardEvent) => {
    if (e.key !== "n" && e.key !== "N") return;
    if (shouldIgnoreShortcut(e)) return;
    e.preventDefault();
    setOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [handleKeydown]);

  const toggle = () => setOpen((prev) => !prev);

  return (
    <>
      <button
        onClick={toggle}
        title={`Notificaciones${totalBadge > 0 ? ` (${totalBadge} pendientes)` : ""} — tecla N`}
        className={cn(
          "relative flex items-center justify-center h-8 w-8 rounded-lg transition-colors",
          open
            ? "bg-primary/10 text-primary"
            : "text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary"
        )}
      >
        <Bell className={cn("h-4 w-4", pulse && "animate-bounce")} />
        {/* Badge */}
        {totalBadge > 0 && (
          <span
            className={cn(
              "absolute -top-1 -right-1 min-w-4.5 h-4.5 flex items-center justify-center text-[length:var(--ts-2xs)] font-bold text-white rounded-full px-1 shadow-sm",
              criticalCount > 0 ? "bg-[var(--data-error-600)] animate-pulse" : "bg-[var(--data-error-500)]",
              pulse && "animate-pulse"
            )}
          >
            {totalBadge > 9 ? "9+" : totalBadge}
          </span>
        )}
      </button>

      <NotificationHub
        open={open}
        onClose={() => setOpen(false)}
        notifications={notifications}
        unreadCount={unreadCount}
        isLoading={isLoading}
        filter={filter}
        setFilter={setFilter}
        markAsRead={markAsRead}
        markAllRead={markAllRead}
        refetch={refetch}
      />
    </>
  );
}
