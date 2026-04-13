"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, CheckCheck, Bell, RefreshCw,
  AlertTriangle, Package, Clock,
  ShoppingCart, DollarSign, Calendar, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import NotificationItem from "./NotificationItem";
import type {
  NotificationItem as NotificationItemType,
  NotificationFilter,
} from "./useNotificationCenter";

// ── Tipos para alertas consolidadas ──────────────────────────────────────────

type AlertSource = "sistema" | "stock" | "vencimientos" | "finanzas" | "pedidos" | "recordatorios";

interface ConsolidatedAlert {
  id: string;
  source: AlertSource;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  timestamp: number;
  action?: { label: string; href?: string; moduleId?: string; tabId?: string };
}

// ── Tabs del hub ─────────────────────────────────────────────────────────────

type HubTab = "todas" | "alertas" | "vencimientos" | "recordatorios";

const HUB_TABS: { key: HubTab; label: string; icon: React.ElementType }[] = [
  { key: "todas", label: "Todas", icon: Bell },
  { key: "alertas", label: "Alertas", icon: AlertTriangle },
  { key: "vencimientos", label: "Vencimientos", icon: Calendar },
  { key: "recordatorios", label: "Recordatorios", icon: Clock },
];

// ── Severity styles ──────────────────────────────────────────────────────────

const SEVERITY_STYLES = {
  critical: {
    border: "border-l-red-500",
    icon: "text-red-500",
    bg: "bg-red-50 dark:bg-red-950/10",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  warning: {
    border: "border-l-amber-400",
    icon: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/10",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  info: {
    border: "border-l-blue-400",
    icon: "text-blue-500",
    bg: "bg-blue-50/50 dark:bg-blue-950/10",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
};

const SOURCE_ICONS: Record<AlertSource, React.ElementType> = {
  sistema: Shield,
  stock: Package,
  vencimientos: Calendar,
  finanzas: DollarSign,
  pedidos: ShoppingCart,
  recordatorios: Clock,
};

// ── Skeleton ─────────────────────────────────────────────────────────────────

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

// ── Helper: timeAgo ──────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return "ahora";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `hace ${diffHrs}h`;
  return `hace ${Math.floor(diffHrs / 24)}d`;
}

// ── Grouping ─────────────────────────────────────────────────────────────────

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

  for (const [label, list] of Object.entries(buckets)) {
    if (list.length > 0) groups.push({ label, items: list });
  }

  return groups;
}

// ── Alert Item ───────────────────────────────────────────────────────────────

function AlertItem({ alert, onNavigate }: { alert: ConsolidatedAlert; onNavigate?: (moduleId: string, tabId?: string) => void }) {
  const severity = SEVERITY_STYLES[alert.severity];
  const SourceIcon = SOURCE_ICONS[alert.source] || Bell;

  const handleActionClick = () => {
    if (alert.action?.moduleId && onNavigate) {
      onNavigate(alert.action.moduleId, alert.action.tabId);
    }
  };

  return (
    <div
      className={cn(
        "px-4 py-3 border-l-4 flex items-start gap-3 transition-colors hover:bg-gray-50 dark:hover:bg-accent/50",
        severity.border
      )}
    >
      <div className={cn("shrink-0 w-8 h-8 rounded-lg flex items-center justify-center", severity.bg)}>
        <SourceIcon className={cn("h-4 w-4", severity.icon)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-foreground leading-tight">
          {alert.title}
        </p>
        <p className="text-xs text-gray-500 dark:text-muted mt-0.5 line-clamp-2">
          {alert.description}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[11px] text-gray-400 dark:text-muted">
            {timeAgo(alert.timestamp)}
          </span>
          <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full", severity.badge)}>
            {alert.severity === "critical" ? "Urgente" : alert.severity === "warning" ? "Atención" : "Info"}
          </span>
          {alert.action && (
            <button
              onClick={handleActionClick}
              className="text-[11px] font-medium text-primary cursor-pointer hover:underline"
            >
              {alert.action.label} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

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

// ── Component ────────────────────────────────────────────────────────────────

export default function NotificationHub({
  open,
  onClose,
  notifications,
  unreadCount,
  isLoading,
  filter,
  setFilter: _setFilter,
  markAsRead,
  markAllRead,
  refetch,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [hubTab, setHubTab] = useState<HubTab>("todas");
  const [alerts, setAlerts] = useState<ConsolidatedAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch consolidated alerts from multiple sources when panel opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function loadAlerts() {
    setAlertsLoading(true);
    const consolidated: ConsolidatedAlert[] = [];

    try {
      // Fetch stats (stock bajo, pedidos pendientes, pagos vencidos)
      const [statsRes, batchRes, remindersRes] = await Promise.all([
        fetch("/api/admin/stats", { credentials: "include" }).catch(() => null),
        fetch("/api/batches/expiring", { credentials: "include" }).catch(() => null),
        fetch("/api/reminders", { credentials: "include" }).catch(() => null),
      ]);

      // Stats → alertas de stock, pedidos, finanzas
      if (statsRes?.ok) {
        const stats = await statsRes.json();
        if (stats?.lowStockProducts > 0) {
          consolidated.push({
            id: "stock-bajo",
            source: "stock",
            severity: stats.lowStockProducts > 10 ? "critical" : "warning",
            title: `${stats.lowStockProducts} productos con stock bajo`,
            description: "Revisa tu inventario — hay productos que se están acabando",
            timestamp: Date.now(),
            action: { label: "Ver inventario", moduleId: "inventario", tabId: "alertas-stock" },
          });
        }
        if (stats?.pendingOrders > 0) {
          consolidated.push({
            id: "pedidos-pendientes",
            source: "pedidos",
            severity: stats.pendingOrders > 5 ? "critical" : "warning",
            title: `${stats.pendingOrders} pedidos pendientes`,
            description: "Tienes pedidos que necesitan atención",
            timestamp: Date.now(),
            action: { label: "Ver pedidos", moduleId: "pedidos", tabId: "pedidos" },
          });
        }
        if (stats?.overduePayables > 0) {
          consolidated.push({
            id: "pagos-vencidos",
            source: "finanzas",
            severity: "warning",
            title: `${stats.overduePayables} pagos a proveedores vencidos`,
            description: "Tienes deudas con proveedores que ya pasaron su fecha",
            timestamp: Date.now(),
            action: { label: "Ver deudas", moduleId: "compras", tabId: "cuentas-pagar" },
          });
        }
      }

      // Batch expiry → alertas de vencimiento
      if (batchRes?.ok) {
        const batches = await batchRes.json();
        const items = Array.isArray(batches) ? batches : batches?.items ?? [];
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        let critical = 0;
        let warning = 0;
        for (const b of items) {
          const exp = new Date(b.expiryDate || b.fechaVencimiento);
          const days = Math.round((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (days <= 3) critical++;
          else if (days <= 7) warning++;
        }

        if (critical > 0) {
          consolidated.push({
            id: "vencimiento-critico",
            source: "vencimientos",
            severity: "critical",
            title: `${critical} productos vencen en 3 días o menos`,
            description: "¡Vende o retira estos productos antes de que venzan!",
            timestamp: Date.now(),
            action: { label: "Ver lotes", moduleId: "inventario", tabId: "lotes" },
          });
        }
        if (warning > 0) {
          consolidated.push({
            id: "vencimiento-pronto",
            source: "vencimientos",
            severity: "warning",
            title: `${warning} productos vencen esta semana`,
            description: "Ponlos en oferta para que salgan rápido",
            timestamp: Date.now(),
            action: { label: "Ver lotes", moduleId: "inventario", tabId: "lotes" },
          });
        }
      }

      // Reminders → recordatorios
      if (remindersRes?.ok) {
        const reminders = await remindersRes.json();
        const list = Array.isArray(reminders) ? reminders : [];
        const pending = list.filter((r: { status: string }) => r.status === "pendiente");
        const overdue = list.filter((r: { status: string }) => r.status === "vencido");
        const highPriority = pending.filter((r: { priority: string }) => r.priority === "alta");

        if (overdue.length > 0) {
          consolidated.push({
            id: "recordatorios-vencidos",
            source: "recordatorios",
            severity: "critical",
            title: `${overdue.length} recordatorio${overdue.length > 1 ? "s" : ""} vencido${overdue.length > 1 ? "s" : ""}`,
            description: "Tienes tareas que ya pasaron su fecha límite",
            timestamp: Date.now(),
          });
        }
        if (highPriority.length > 0) {
          consolidated.push({
            id: "recordatorios-alta",
            source: "recordatorios",
            severity: "warning",
            title: `${highPriority.length} recordatorio${highPriority.length > 1 ? "s" : ""} de alta prioridad`,
            description: "Tareas importantes que necesitan tu atención hoy",
            timestamp: Date.now(),
          });
        }
      }
    } catch {
      // Silent fail — graceful degradation
    }

    // Sort: critical first, then warning, then info
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    consolidated.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    if (!cancelled) {
      setAlerts(consolidated);
      setAlertsLoading(false);
    }
    }

    loadAlerts();
    return () => { cancelled = true; };
  }, [open, refreshKey]);

  // Total alert count for badge
  const totalAlertCount = useMemo(() => {
    const critical = alerts.filter(a => a.severity === "critical").length;
    return critical + unreadCount;
  }, [alerts, unreadCount]);

  // Filtered alerts by hub tab
  const filteredAlerts = useMemo(() => {
    if (hubTab === "todas") return alerts;
    if (hubTab === "alertas") return alerts.filter(a => a.source === "stock" || a.source === "pedidos" || a.source === "finanzas" || a.source === "sistema");
    if (hubTab === "vencimientos") return alerts.filter(a => a.source === "vencimientos");
    if (hubTab === "recordatorios") return alerts.filter(a => a.source === "recordatorios");
    return alerts;
  }, [alerts, hubTab]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
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
  const _notifFilter = filter;

  // Navigate to module from alert action
  const handleAlertNavigate = useCallback((moduleId: string, tabId?: string) => {
    // Dispatch custom event that admin page listens to
    window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { moduleId, tabId } }));
    onClose();
  }, [onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            key="hub-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/20 dark:bg-black/40 z-60"
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            key="hub-panel"
            ref={panelRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full sm:w-105 bg-white dark:bg-card border-l border-gray-200 dark:border-card-border shadow-2xl z-61 flex flex-col"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-card-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Bell className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 dark:text-foreground text-sm">
                    Centro de Notificaciones
                  </h2>
                  <p className="text-[10px] text-gray-400 dark:text-muted">
                    Todo lo que necesitas saber en un solo lugar
                  </p>
                </div>
                {totalAlertCount > 0 && (
                  <span className="text-xs bg-red-500 text-white font-bold px-1.5 py-0.5 rounded-full min-w-5 text-center">
                    {totalAlertCount > 99 ? "99+" : totalAlertCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { refetch(); setRefreshKey(k => k + 1); }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-accent transition-colors"
                  title="Actualizar todo"
                >
                  <RefreshCw className={cn("h-4 w-4", (isLoading || alertsLoading) && "animate-spin")} />
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

            {/* Hub Tabs */}
            <div className="px-3 py-2 border-b border-gray-100 dark:border-card-border flex gap-1 shrink-0 overflow-x-auto">
              {HUB_TABS.map((tab) => {
                const TabIcon = tab.icon;
                const count = tab.key === "todas"
                  ? alerts.length + unreadCount
                  : tab.key === "alertas"
                    ? alerts.filter(a => a.source !== "vencimientos" && a.source !== "recordatorios").length
                    : tab.key === "vencimientos"
                      ? alerts.filter(a => a.source === "vencimientos").length
                      : alerts.filter(a => a.source === "recordatorios").length;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setHubTab(tab.key)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
                      hubTab === tab.key
                        ? "bg-primary text-white"
                        : "text-gray-500 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                    )}
                  >
                    <TabIcon className="h-3 w-3" />
                    {tab.label}
                    {count > 0 && (
                      <span className={cn(
                        "text-[9px] font-bold px-1 py-0 rounded-full min-w-3.5 text-center",
                        hubTab === tab.key ? "bg-white/20 text-white" : "bg-gray-200 dark:bg-surface text-gray-600 dark:text-muted"
                      )}>
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {hubTab === "todas" ? (
                <>
                  {/* Critical alerts first */}
                  {alerts.filter(a => a.severity === "critical").length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-red-50 dark:bg-red-950/20 border-b border-red-100 dark:border-red-900/30">
                        <span className="text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Urgente
                        </span>
                      </div>
                      {alerts.filter(a => a.severity === "critical").map(alert => (
                        <AlertItem key={alert.id} alert={alert} onNavigate={handleAlertNavigate} />
                      ))}
                    </div>
                  )}

                  {/* Warning alerts */}
                  {alerts.filter(a => a.severity === "warning").length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-100 dark:border-amber-900/30">
                        <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Atención
                        </span>
                      </div>
                      {alerts.filter(a => a.severity === "warning").map(alert => (
                        <AlertItem key={alert.id} alert={alert} onNavigate={handleAlertNavigate} />
                      ))}
                    </div>
                  )}

                  {/* Divider */}
                  {alerts.length > 0 && notifications.length > 0 && (
                    <div className="px-4 py-2 bg-gray-50 dark:bg-surface/50 border-y border-gray-100 dark:border-card-border flex items-center justify-between">
                      <span className="text-[11px] font-bold text-gray-500 dark:text-muted uppercase tracking-wider">
                        Notificaciones recientes
                      </span>
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllRead}
                          className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
                        >
                          <CheckCheck className="h-3 w-3" />
                          Leer todo
                        </button>
                      )}
                    </div>
                  )}

                  {/* Notifications */}
                  {isLoading ? (
                    <>
                      <SkeletonItem />
                      <SkeletonItem />
                      <SkeletonItem />
                    </>
                  ) : notifications.length === 0 && alerts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-green-50 dark:bg-green-950/30 flex items-center justify-center mb-4">
                        <CheckCheck className="h-7 w-7 text-green-500" />
                      </div>
                      <p className="font-semibold text-gray-900 dark:text-foreground text-sm">
                        Todo al día
                      </p>
                      <p className="text-xs text-gray-500 dark:text-muted mt-1">
                        No tienes notificaciones ni alertas pendientes
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
                </>
              ) : (
                /* Filtered views for alertas/vencimientos/recordatorios */
                <>
                  {alertsLoading ? (
                    <>
                      <SkeletonItem />
                      <SkeletonItem />
                    </>
                  ) : filteredAlerts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-green-50 dark:bg-green-950/30 flex items-center justify-center mb-4">
                        <CheckCheck className="h-7 w-7 text-green-500" />
                      </div>
                      <p className="font-semibold text-gray-900 dark:text-foreground text-sm">
                        Sin {hubTab === "alertas" ? "alertas" : hubTab === "vencimientos" ? "vencimientos" : "recordatorios"}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-muted mt-1">
                        {hubTab === "alertas"
                          ? "No hay alertas de stock, pedidos ni finanzas"
                          : hubTab === "vencimientos"
                            ? "Ningún producto está por vencer próximamente"
                            : "No tienes recordatorios pendientes"}
                      </p>
                    </div>
                  ) : (
                    filteredAlerts.map(alert => (
                      <AlertItem key={alert.id} alert={alert} onNavigate={handleAlertNavigate} />
                    ))
                  )}
                </>
              )}
            </div>

            {/* Footer summary */}
            {alerts.length > 0 && (
              <div className="px-4 py-2.5 border-t border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface/50 shrink-0">
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-3">
                    {alerts.filter(a => a.severity === "critical").length > 0 && (
                      <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-bold">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        {alerts.filter(a => a.severity === "critical").length} urgente{alerts.filter(a => a.severity === "critical").length > 1 ? "s" : ""}
                      </span>
                    )}
                    {alerts.filter(a => a.severity === "warning").length > 0 && (
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        {alerts.filter(a => a.severity === "warning").length} atención
                      </span>
                    )}
                  </div>
                  <span className="text-gray-400 dark:text-muted">
                    Actualizado ahora
                  </span>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
