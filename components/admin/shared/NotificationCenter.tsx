"use client";

/**
 * components/admin/shared/NotificationCenter.tsx
 *
 * Centro de notificaciones standalone con dropdown panel.
 * Muestra campana con badge + dropdown con notificaciones de ejemplo.
 * Tipos: order, stock, message, system.
 *
 * Nota: El sistema real de notificaciones usa NotificationBell + NotificationHub.
 * Este componente es una alternativa ligera con datos hardcodeados de demo.
 */

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bell, ShoppingCart, Package, MessageSquare, Shield,
  CheckCheck, X,
} from "@buleje/design-system/icons";
import { m, AnimatePresence } from "@/components/admin/providers";
import { cn } from "@/lib/utils";

// ── Tipos ───────────────────────────────────────────────────────────────────

type NotificationType = "order" | "stock" | "message" | "system";

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  timestamp: number;
  read: boolean;
}

// ── Constantes ──────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  NotificationType,
  { icon: typeof Bell; color: string; bg: string }
> = {
  order: {
    icon: ShoppingCart,
    color: "text-[var(--data-success-500)]",
    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
  },
  stock: {
    icon: Package,
    color: "text-[var(--data-warning-500)]",
    bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30",
  },
  message: {
    icon: MessageSquare,
    color: "text-[var(--data-success-500)]",
    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
  },
  system: {
    icon: Shield,
    color: "text-[var(--text-secondary)]",
    bg: "bg-gray-100 dark:bg-zinc-800",
  },
};

// ── Seed notifications ──────────────────────────────────────────────────────

function createSeedNotifications(): Notification[] {
  const now = Date.now();
  return [
    {
      id: "n1",
      type: "order",
      title: "Nuevo pedido #1042",
      description: "Cliente Juan Perez - S/125.50",
      timestamp: now - 5 * 60 * 1000,
      read: false,
    },
    {
      id: "n2",
      type: "stock",
      title: "Stock bajo: Arroz Extra 5kg",
      description: "Solo quedan 3 unidades en inventario",
      timestamp: now - 32 * 60 * 1000,
      read: false,
    },
    {
      id: "n3",
      type: "message",
      title: "Nuevo mensaje de proveedor",
      description: "Distribuidora Lima confirma envio para manana",
      timestamp: now - 2 * 60 * 60 * 1000,
      read: false,
    },
    {
      id: "n4",
      type: "system",
      title: "Backup completado",
      description: "Copia de seguridad automatica exitosa",
      timestamp: now - 6 * 60 * 60 * 1000,
      read: true,
    },
  ];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return "ahora";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `hace ${diffHrs}h`;
  return `hace ${Math.floor(diffHrs / 24)}d`;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(createSeedNotifications);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Cerrar con click fuera
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const timeout = setTimeout(() => {
      document.addEventListener("mousedown", handler);
    }, 50);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("mousedown", handler);
    };
  }, [open]);

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return (
    <div className="relative">
      {/* Boton campana */}
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        title={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ""}`}
        className={cn(
          "relative flex items-center justify-center h-8 w-8 rounded-lg transition-colors",
          open
            ? "bg-primary/10 text-primary"
            : "text-[var(--text-tertiary)] dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary"
        )}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4.5 h-4.5 flex items-center justify-center text-[length:var(--ts-2xs)] font-bold text-white bg-[var(--data-error-500)] rounded-full px-1 ">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <m.div
            ref={panelRef}
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 max-h-[400px] flex flex-col bg-white dark:bg-zinc-900 rounded-xl border border-[var(--rule-soft)] dark:border-zinc-800 z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-[var(--rule-soft)] dark:border-zinc-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-bold">
                  Notificaciones
                </CardTitle>
                {unreadCount > 0 && (
                  <span className="text-[length:var(--ts-2xs)] font-bold text-white bg-[var(--data-error-500)] rounded-full px-1.5 py-0.5 min-w-4 text-center">
                    {unreadCount}
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[length:var(--ts-xs)] font-medium text-primary hover:underline"
                >
                  <CheckCheck className="h-3 w-3" />
                  Marcar todas como leidas
                </button>
              )}
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <div className="w-12 h-12 rounded-xl bg-gray-50 dark:bg-zinc-800 flex items-center justify-center mb-3">
                    <Bell className="h-6 w-6 text-[var(--text-tertiary)] dark:text-zinc-600" />
                  </div>
                  <p className="text-sm font-medium text-[var(--text-secondary)] dark:text-muted">
                    Sin notificaciones
                  </p>
                </div>
              ) : (
                notifications.map((notif) => {
                  const config = TYPE_CONFIG[notif.type];
                  const Icon = config.icon;
                  return (
                    <div
                      key={notif.id}
                      onClick={() => markAsRead(notif.id)}
                      className={cn(
                        "px-4 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800/50 border-b border-gray-50 dark:border-zinc-800/50 cursor-pointer transition-colors flex items-start gap-3 group",
                        !notif.read && "bg-[var(--accent-soft)]/40 dark:bg-[var(--accent-muted)]/40"
                      )}
                    >
                      {/* Icono */}
                      <div
                        className={cn(
                          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                          config.bg
                        )}
                      >
                        <Icon className={cn("h-4 w-4", config.color)} />
                      </div>

                      {/* Contenido */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn(
                            "text-sm leading-tight",
                            notif.read
                              ? "text-[var(--text-secondary)]"
                              : "text-[var(--text-primary)] dark:text-foreground font-semibold"
                          )}>
                            {notif.title}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {!notif.read && (
                              <span className="w-2 h-2 rounded-full bg-[var(--accent)] shrink-0" />
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); dismiss(notif.id); }}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-tertiary)] transition-opacity"
                              title="Descartar"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5 truncate">
                          {notif.description}
                        </p>
                        <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] dark:text-muted mt-1 block">
                          {timeAgo(notif.timestamp)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
