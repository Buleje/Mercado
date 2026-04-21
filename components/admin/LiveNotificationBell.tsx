"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Bell, BellOff, Package, ShoppingBag, CreditCard,
  Truck, AlertTriangle, CheckCheck, Banknote,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useAdminSSE, type SSEEvent, type SSEEventType } from "@/hooks/use-admin-sse";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_NOTIFS = 20;

interface NotifEntry extends SSEEvent {
  id: string;
  read: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "ahora mismo";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

function playBeep(type: SSEEventType) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    const freq =
      type === "new_order"      ? 880 :
      type === "low_stock"      ? 440 :
      type === "fiado_vencido"  ? 520 :
      660;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    /* AudioContext not available */
  }
}

const TYPE_CONFIG: Record<
  SSEEventType,
  { label: string; Icon: React.FC<{ className?: string }>; dot: string; bg: string; text: string; border: string }
> = {
  new_order: {
    label: "Nuevo pedido",
    Icon: ShoppingBag,
    dot: "bg-teal-500",
    bg: "bg-teal-50 dark:bg-teal-900/20",
    text: "text-teal-700 dark:text-teal-400",
    border: "border-teal-200 dark:border-teal-800",
  },
  order_status_changed: {
    label: "Estado de pedido",
    Icon: Package,
    dot: "bg-[var(--accent-soft)]",
    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
    text: "text-[var(--data-success)] dark:text-[var(--data-success)]",
    border: "border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30",
  },
  low_stock: {
    label: "Stock bajo",
    Icon: AlertTriangle,
    dot: "bg-[var(--data-error)]",
    bg: "bg-[var(--data-error-50)] dark:bg-[var(--data-error)]/20",
    text: "text-[var(--data-error)] dark:text-[var(--data-error)]",
    border: "border-[var(--data-error)] dark:border-[var(--data-error)]",
  },
  payment: {
    label: "Pago recibido",
    Icon: CreditCard,
    dot: "bg-[var(--accent-soft)]",
    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
    text: "text-[var(--data-success)] dark:text-[var(--data-success)]",
    border: "border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30",
  },
  delivery: {
    label: "Delivery",
    Icon: Truck,
    dot: "bg-[var(--data-warning)]",
    bg: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning)]/20",
    text: "text-[var(--data-warning)] dark:text-[var(--data-warning)]",
    border: "border-[var(--data-warning)] dark:border-[var(--data-warning)]",
  },
  fiado_vencido: {
    label: "Fiado vencido",
    Icon: Banknote,
    dot: "bg-[var(--data-warning)]",
    bg: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning)]/20",
    text: "text-[var(--data-warning)] dark:text-[var(--data-warning)]",
    border: "border-[var(--data-warning)] dark:border-[var(--data-warning)]",
  },
};

// ── Toast mini ────────────────────────────────────────────────────────────────

function MiniToast({
  notif,
  onDismiss,
}: {
  notif: NotifEntry;
  onDismiss: () => void;
}) {
  const cfg = TYPE_CONFIG[notif.type] ?? TYPE_CONFIG.new_order;
  const { Icon } = cfg;

  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 rounded-xl border min-w-[260px] max-w-xs",
        cfg.bg,
        cfg.border,
        "animate-in slide-in-from-right-4 fade-in duration-[var(--dur-base)]"
      )}
    >
      <span className={cn("mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center", cfg.bg)}>
        <Icon className={cn("h-4 w-4", cfg.text)} />
      </span>
      <div className="flex-1 min-w-0">
        <p className={cn("text-xs font-bold", cfg.text)}>{cfg.label}</p>
        <p className="text-xs text-[var(--text-secondary)] truncate">{notif.message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-gray-200 flex-shrink-0 min-w-[28px] min-h-[28px] flex items-center justify-center"
      >
        <span className="sr-only">Cerrar</span>
        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
          <path d="M6 4.586L1.707.293.293 1.707 4.586 6 .293 10.293l1.414 1.414L6 7.414l4.293 4.293 1.414-1.414L7.414 6l4.293-4.293L10.293.293z" />
        </svg>
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function LiveNotificationBell() {
  const { lastEvent, isConnected } = useAdminSSE();
  const [notifs, setNotifs] = useState<NotifEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<NotifEntry | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Process incoming SSE event
  useEffect(() => {
    if (!lastEvent) return;

    const entry: NotifEntry = {
      ...lastEvent,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      read: false,
    };

    setNotifs((prev) => [entry, ...prev].slice(0, MAX_NOTIFS));
    setToast(entry);
    playBeep(lastEvent.type);
  }, [lastEvent]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const unreadCount = notifs.filter((n) => !n.read).length;

  const markAllRead = useCallback(() => {
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  return (
    <>
      {/* ── Bell button ───────────────────────────────────────────── */}
      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          aria-label="Notificaciones en tiempo real"
          aria-expanded={open}
          onClick={() => {
            setOpen((v) => !v);
            if (!open) markAllRead();
          }}
          className={cn(
            "relative flex items-center justify-center w-10 h-10 rounded-xl transition-colors",
            "bg-[var(--surface-sunken)] hover:bg-gray-200 dark:hover:bg-gray-700",
            open && "bg-teal-50 dark:bg-teal-900/30",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          )}
        >
          {isConnected ? (
            <Bell className={cn("h-5 w-5", open ? "text-primary" : "text-[var(--text-secondary)]")} />
          ) : (
            <BellOff className="h-5 w-5 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]" />
          )}

          {/* Unread badge */}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--data-error)] text-white text-[length:var(--ts-2xs)] font-bold flex items-center justify-center leading-none ">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}

          {/* Connection dot */}
          <span
            className={cn(
              "absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full border-2 border-white dark:border-[var(--rule-base)]",
              isConnected ? "bg-teal-500" : "bg-gray-400"
            )}
          />
        </button>

        {/* ── Dropdown ─────────────────────────────────────────────── */}
        {open && (
          <div className="absolute right-0 mt-2 w-80 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] z-50 overflow-hidden animate-in slide-in-from-top-2 fade-in duration-[var(--dur-fast)]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)]/50">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold text-[var(--text-primary)]">Tiempo real</span>
                {unreadCount > 0 && (
                  <span className="bg-[var(--data-error)] text-white text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              {notifs.length > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-primary dark:hover:text-teal-400 transition-colors"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Leer todas
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-[360px] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
              {notifs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] gap-2">
                  <Bell className="h-9 w-9 opacity-30" />
                  <p className="text-sm font-medium text-[var(--text-tertiary)]">No hay notificaciones</p>
                  <p className="text-xs text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">Las alertas aparecen aquí en tiempo real</p>
                </div>
              ) : (
                notifs.map((n) => {
                  const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.new_order;
                  const { Icon } = cfg;
                  return (
                    <div
                      key={n.id}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 transition-colors",
                        n.read
                          ? "bg-[var(--surface-raised)]"
                          : "bg-[var(--surface-sunken)]/60"
                      )}
                    >
                      <span className={cn("mt-0.5 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center", cfg.bg)}>
                        <Icon className={cn("h-4 w-4", cfg.text)} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn("text-xs font-bold", cfg.text)}>{cfg.label}</span>
                          {!n.read && (
                            <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", cfg.dot)} />
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-snug">
                          {n.message}
                        </p>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-1">
                          {relativeTime(n.timestamp)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-[var(--rule-base)] bg-[var(--surface-sunken)]/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full",
                      isConnected ? "bg-teal-500 animate-pulse" : "bg-gray-400"
                    )}
                  />
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">
                    {isConnected ? "Conectado en tiempo real" : "Reconectando..."}
                  </p>
                </div>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-[var(--text-primary)]">
                  {notifs.length}/{MAX_NOTIFS}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Toast portal-style (fixed bottom-right) ───────────────── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999] pointer-events-auto">
          <MiniToast notif={toast} onDismiss={dismissToast} />
        </div>
      )}
    </>
  );
}
