"use client";

import { useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

export type TrackedAction =
  | "precio_cambio"
  | "producto_eliminar"
  | "venta_anular"
  | "permiso_cambio"
  | "producto_crear"
  | "orden_actualizar"
  | "config_cambio"
  | "exportar";

export interface ActivityEntry {
  action: TrackedAction;
  entity: string;
  details: string;
  userId: string;
  timestamp: string;
}

interface ActivityTrackerProps {
  userId: string;
  action: TrackedAction;
  details: string;
  children: ReactNode;
  onBeforeTrack?: () => boolean | Promise<boolean>; // return false to cancel
  className?: string;
}

// ── localStorage helper ───────────────────────────────────────────────────────

const LS_KEY = "activity_log_local";

function appendToLocalLog(entry: ActivityEntry): void {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const log: ActivityEntry[] = raw ? JSON.parse(raw) : [];
    log.unshift(entry);
    // Keep last 200 entries
    if (log.length > 200) log.splice(200);
    localStorage.setItem(LS_KEY, JSON.stringify(log));
  } catch {
    // ignore storage errors
  }
}

// ── Toast (minimal inline — avoids import coupling) ──────────────────────────

function showToast(message: string) {
  const id = `activity-toast-${Date.now()}`;
  const el = document.createElement("div");
  el.id = id;
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.style.cssText = [
    "position:fixed",
    "bottom:1.5rem",
    "right:1.5rem",
    "z-index:9999",
    "padding:0.65rem 1.1rem",
    "border-radius:0.75rem",
    "background:#0f766e",
    "color:#fff",
    "font-size:0.875rem",
    "font-weight:500",
    "box-shadow:0 4px 16px rgba(0,0,0,0.18)",
    "display:flex",
    "align-items:center",
    "gap:0.5rem",
    "animation:fadeInUp 0.25s ease",
  ].join(";");
  el.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>${message}`;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity 0.3s ease";
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ── Standalone trackActivity function (importable elsewhere) ──────────────────

export async function trackActivity(
  userId: string,
  action: TrackedAction,
  entity: string,
  details: string,
  silent = false
): Promise<void> {
  const entry: ActivityEntry = {
    action,
    entity,
    details,
    userId,
    timestamp: new Date().toISOString(),
  };

  // 1. Save locally first (always works)
  appendToLocalLog(entry);

  // 2. POST to API (fire-and-forget)
  fetch("/api/activity-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  }).catch(() => {});

  // 3. Toast notification
  if (!silent) {
    const labels: Record<TrackedAction, string> = {
      precio_cambio:    "Cambio de precio registrado",
      producto_eliminar: "Eliminacion registrada",
      venta_anular:      "Anulacion registrada",
      permiso_cambio:    "Cambio de permiso registrado",
      producto_crear:    "Creacion registrada",
      orden_actualizar:  "Actualizacion registrada",
      config_cambio:     "Cambio de configuracion registrado",
      exportar:          "Exportacion registrada",
    };
    showToast(labels[action] ?? "Accion registrada");
  }
}

// ── HOC Component (wraps any clickable element) ───────────────────────────────

export default function ActivityTracker({
  userId,
  action,
  details,
  children,
  onBeforeTrack,
  className,
}: ActivityTrackerProps) {
  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      // Allow the original click to proceed, then track
      if (onBeforeTrack) {
        const shouldProceed = await onBeforeTrack();
        if (!shouldProceed) return;
      }

      // We don't stopPropagation — let child handle its own click
      void trackActivity(userId, action, "ActivityTracker", details);
    },
    [userId, action, details, onBeforeTrack]
  );

  return (
    <div
      onClick={handleClick}
      className={cn("contents", className)}
      data-activity-action={action}
    >
      {children}
    </div>
  );
}

// ── Local log reader (for SuspiciousActivityAlert) ────────────────────────────

export function getLocalActivityLog(): ActivityEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as ActivityEntry[]) : [];
  } catch {
    return [];
  }
}
