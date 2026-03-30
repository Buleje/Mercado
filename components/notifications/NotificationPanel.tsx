"use client";

import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCheck, Bell, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import NotificationItem from "./NotificationItem";
import type {
  NotificationItem as NotificationItemType,
  NotificationFilter,
} from "./useNotificationCenter";

type Props = {
  open: boolean;
  onClose: () => void;
  notifications: NotificationItemType[];
  unreadCount: number;
  isLoading: boolean;
  filter: NotificationFilter;
  setFilter: (f: NotificationFilter) => void;
  markAsRead: (id: string) => void;
  markAllRead: () => void;
  refetch: () => void;
};

const FILTER_TABS: { key: NotificationFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "unread", label: "Sin leer" },
  { key: "high", label: "Alta prioridad" },
];

function groupByDay(items: NotificationItemType[]) {
  const groups: { label: string; items: NotificationItemType[] }[] = [];
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const weekStart = todayStart - 6 * 86_400_000;

  const buckets: Record<string, NotificationItemType[]> = {
    Hoy: [],
    Ayer: [],
    "Esta semana": [],
    Anteriores: [],
  };

  for (const item of items) {
    const t = new Date(item.createdAt).getTime();
    if (t >= todayStart) buckets["Hoy"].push(item);
    else if (t >= yesterdayStart) buckets["Ayer"].push(item);
    else if (t >= weekStart) buckets["Esta semana"].push(item);
    else buckets["Anteriores"].push(item);
  }

  for (const [label, items] of Object.entries(buckets)) {
    if (items.length > 0) groups.push({ label, items });
  }

  return groups;
}

// Skeleton for loading state
function SkeletonItem() {
  return (
    <div className="px-4 py-3 flex items-start gap-3 animate-pulse">
      <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-surface shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 bg-gray-200 dark:bg-surface rounded w-3/4" />
        <div className="h-3 bg-gray-200 dark:bg-surface rounded w-1/2" />
        <div className="h-2.5 bg-gray-200 dark:bg-surface rounded w-1/4" />
      </div>
    </div>
  );
}

export default function NotificationPanel({
  open,
  onClose,
  notifications,
  unreadCount,
  isLoading,
  filter,
  setFilter,
  markAsRead,
  markAllRead,
  refetch,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid immediately closing on the same click that opens
    const timeout = setTimeout(() => {
      document.addEventListener("mousedown", handler);
    }, 100);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("mousedown", handler);
    };
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const groups = groupByDay(notifications);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            key="notif-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/20 dark:bg-black/40 z-[60]"
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            key="notif-panel"
            ref={panelRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full sm:w-96 bg-white dark:bg-card border-l border-gray-200 dark:border-card-border shadow-2xl z-[61] flex flex-col"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-card-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                <h2 className="font-bold text-gray-900 dark:text-foreground text-base">
                  Notificaciones
                </h2>
                {unreadCount > 0 && (
                  <span className="text-xs bg-red-500 text-white font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors"
                    title="Marcar todas como leídas"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Leer todo</span>
                  </button>
                )}
                <button
                  onClick={refetch}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-accent transition-colors"
                  title="Actualizar"
                >
                  <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors"
                  title="Cerrar (Esc)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Filter tabs */}
            <div className="px-4 py-2 border-b border-gray-100 dark:border-card-border flex gap-1 shrink-0">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                    filter === tab.key
                      ? "bg-primary text-white"
                      : "text-gray-500 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div>
                  <SkeletonItem />
                  <SkeletonItem />
                  <SkeletonItem />
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-green-50 dark:bg-green-950/30 flex items-center justify-center mb-4">
                    <CheckCheck className="h-7 w-7 text-green-500" />
                  </div>
                  <p className="font-semibold text-gray-900 dark:text-foreground text-sm">
                    Todo al día
                  </p>
                  <p className="text-xs text-gray-500 dark:text-muted mt-1">
                    No tienes notificaciones{filter === "unread" ? " sin leer" : filter === "high" ? " de alta prioridad" : ""}
                  </p>
                </div>
              ) : (
                groups.map((group) => (
                  <div key={group.label}>
                    <div className="px-4 py-2 bg-gray-50 dark:bg-surface/50 border-b border-gray-100 dark:border-card-border">
                      <span className="text-[11px] font-semibold text-gray-400 dark:text-muted uppercase tracking-wider">
                        {group.label}
                      </span>
                    </div>
                    {group.items.map((notif) => (
                      <NotificationItem
                        key={notif.id}
                        notification={notif}
                        onMarkRead={markAsRead}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
