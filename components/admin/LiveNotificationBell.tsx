"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Bell, BellOff, Package, ShoppingBag, CreditCard,
  Truck, AlertTriangle, CheckCheck, Banknote,
} from "lucide-react";
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
    dot: "bg-blue-500",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    text: "text-blue-700 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-800",
  },
  low_stock: {
    label: "Stock bajo",
    Icon: AlertTriangle,
    dot: "bg-red-500",
    bg: "bg-red-50 dark:bg-red-900/20",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-800",
  },
  payment: {
    label: "Pago recibido",
    Icon: CreditCard,
    dot: "bg-green-500",
    bg: "bg-green-50 dark:bg-green-900/20",
    text: "text-green-700 dark:text-green-400",
    border: "border-green-200 dark:border-green-800",
  },
  delivery: {
    label: "Delivery",
    Icon: Truck,
    dot: "bg-orange-500",
    bg: "bg-orange-50 dark:bg-orange-900/20",
    text: "text-orange-700 dark:text-orange-400",
    border: "border-orange-200 dark:border-orange-800",
  },
  fiado_vencido: {
    label: "Fiado vencido",
    Icon: Banknote,
    dot: "bg-amber-500",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    text: "text-amber-700 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-800",
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
        "flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border min-w-[260px] max-w-xs",
        cfg.bg,
        cfg.border,
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
      <button
        type="button"
        onClick={onDismiss}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0 min-w-[28px] min-h-[28px] flex items-center justify-center"
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
            "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700",
            open && "bg-teal-50 dark:bg-teal-900/30",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e]"
          )}
        >
          {isConnected ? (
            <Bell className={cn("h-5 w-5", open ? "text-[#0f766e]" : "text-gray-600 dark:text-gray-300")} />
          ) : (
            <BellOff className="h-5 w-5 text-gray-400 dark:text-gray-600" />
          )}

          {/* Unread badge */}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-sm">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}

          {/* Connection dot */}
          <span
            className={cn(
              "absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full border-2 border-white dark:border-gray-900",
              isConnected ? "bg-teal-500" : "bg-gray-400"
            )}
          />
        </button>

        {/* ── Dropdown ─────────────────────────────────────────────── */}
        {open && (
          <div className="absolute right-0 mt-2 w-80 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 z-50 overflow-hidden animate-in slide-in-from-top-2 fade-in duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-[#0f766e]" />
                <span className="text-sm font-bold text-gray-900 dark:text-white">Tiempo real</span>
                {unreadCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              {notifs.length > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-[#0f766e] dark:hover:text-teal-400 transition-colors"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Leer todas
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-[360px] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
              {notifs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-300 dark:text-gray-600 gap-2">
                  <Bell className="h-9 w-9 opacity-30" />
                  <p className="text-sm font-medium text-gray-400 dark:text-gray-500">No hay notificaciones</p>
                  <p className="text-xs text-gray-300 dark:text-gray-600">Las alertas aparecen aquí en tiempo real</p>
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
            <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full",
                      isConnected ? "bg-teal-500 animate-pulse" : "bg-gray-400"
                    )}
                  />
                  <p className="text-[10px] text-gray-400 dark:text-gray-600">
                    {isConnected ? "Conectado en tiempo real" : "Reconectando..."}
                  </p>
                </div>
                <p className="text-[10px] text-gray-300 dark:text-gray-700">
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
