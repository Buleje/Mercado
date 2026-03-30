"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Bell, BellOff, Package, ShoppingBag, CreditCard, Truck, AlertTriangle, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminSSE, type SSEEvent, type SSEEventType } from "@/hooks/use-admin-sse";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_NOTIFS = 10;

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
    // Pitch by type: orders → higher, stock warnings → lower
    const freq = type === "new_order" ? 880 : type === "low_stock" ? 440 : 660;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    /* AudioContext not available */
  }
}

const TYPE_CONFIG: Record<
  SSEEventType,
  { label: string; Icon: React.FC<{ className?: string }>; dot: string; bg: string; text: string }
> = {
  new_order: {
    label: "Nuevo pedido",
    Icon: ShoppingBag,
    dot: "bg-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  order_status_changed: {
    label: "Estado de pedido",
    Icon: Package,
    dot: "bg-blue-500",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    text: "text-blue-700 dark:text-blue-400",
  },
  low_stock: {
    label: "Stock bajo",
    Icon: AlertTriangle,
    dot: "bg-red-500",
    bg: "bg-red-50 dark:bg-red-900/20",
    text: "text-red-700 dark:text-red-400",
  },
  payment: {
    label: "Pago recibido",
    Icon: CreditCard,
    dot: "bg-blue-500",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    text: "text-blue-700 dark:text-blue-400",
  },
  delivery: {
    label: "Delivery",
    Icon: Truck,
    dot: "bg-orange-500",
    bg: "bg-orange-50 dark:bg-orange-900/20",
    text: "text-orange-700 dark:text-orange-400",
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
        "flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border border-white/10 min-w-[260px] max-w-xs",
        cfg.bg,
        "animate-in slide-in-from-right-4 fade-in duration-300"
      )}
    >
      <span className={cn("mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center", cfg.bg)}>
        <Icon className={cn("h-4 w-4", cfg.text)} />
      </span>
      <div className="flex-1 min-w-0">
        <p className={cn("text-xs font-bold", cfg.text)}>{cfg.label}</p>
        <p className="text-xs text-gray-700 dark:text-gray-300 truncate">{notif.message}</p>
      </div>
      <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0">
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
          aria-label="Notificaciones"
          aria-expanded={open}
          onClick={() => {
            setOpen((v) => !v);
            if (!open) markAllRead();
          }}
          className={cn(
            "relative flex items-center justify-center w-10 h-10 rounded-xl transition-colors",
            "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          )}
        >
          {isConnected ? (
            <Bell className="h-5 w-5 text-gray-600 dark:text-gray-300" />
          ) : (
            <BellOff className="h-5 w-5 text-gray-400 dark:text-gray-600" />
          )}

          {/* Unread badge */}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}

          {/* Connection dot */}
          <span
            className={cn(
              "absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-900",
              isConnected ? "bg-emerald-500" : "bg-gray-400"
            )}
          />
        </button>

        {/* ── Dropdown ─────────────────────────────────────────────── */}
        {open && (
          <div className="absolute right-0 mt-2 w-80 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 z-50 overflow-hidden animate-in slide-in-from-top-2 fade-in duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                <span className="text-sm font-bold text-gray-900 dark:text-white">Notificaciones</span>
                {unreadCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-primary transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Leer todas
              </button>
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
              {notifs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-gray-300 dark:text-gray-600">
                  <Bell className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">Sin notificaciones</p>
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
                          ? "bg-white dark:bg-gray-900"
                          : "bg-gray-50 dark:bg-gray-800/60"
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
                        <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5 leading-snug">
                          {n.message}
                        </p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                          {relativeTime(n.timestamp)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800">
              <p className="text-[10px] text-gray-400 dark:text-gray-600 text-center">
                {isConnected ? "Conectado en tiempo real" : "Reconectando..."}
              </p>
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
