"use client";

import { useState, useMemo } from "react";
import { Bell, ShoppingCart, AlertTriangle, TrendingUp, Package, X, Clock, ChevronRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface AlertItem {
  id: string;
  type: "pedido" | "stock" | "venta" | "tarea" | "sistema" | "tiempo";
  title: string;
  body: string;
  tab?: string;
  time: string;
  read: boolean;
  urgent?: boolean;
}

const TYPE_META = {
  pedido:  { icon: ShoppingCart, color: "text-[var(--data-warning-500)]",  bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30"  },
  stock:   { icon: AlertTriangle,color: "text-[var(--data-error-500)]",    bg: "bg-[var(--data-error-50)] dark:bg-red-950/30"      },
  venta:   { icon: TrendingUp,   color: "text-[var(--data-success-500)]",bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]"},
  tarea:   { icon: Package,      color: "text-[var(--data-success-500)]",   bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]"    },
  sistema: { icon: Bell,         color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]"},
  tiempo:  { icon: Clock,        color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)] dark:bg-orange-950/30"},
};

interface Props {
  pendingOrders: number;
  lowStock: number;
  todayRevenue: number;
  overduePayables?: number;
  oldPendingOrders?: number;
  onNavigate: (tab: string) => void;
}

export default function AlertCenter({ pendingOrders, lowStock, todayRevenue, overduePayables = 0, oldPendingOrders = 0, onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const now = useMemo(() => new Date().toISOString(), []);

  const baseAlerts = useMemo<AlertItem[]>(() => {
    const items: AlertItem[] = [];
    if (oldPendingOrders > 0) items.push({ id: "old-pending", type: "tiempo", title: `${oldPendingOrders} pedido${oldPendingOrders > 1 ? "s" : ""} sin atender +30 min`, body: "Hay pedidos pendientes esperando más de 30 minutos. Actúa ahora.", tab: "pedidos", time: now, read: false, urgent: true });
    if (pendingOrders > 0) items.push({ id: "pending-orders", type: "pedido", title: `${pendingOrders} pedido${pendingOrders > 1 ? "s" : ""} pendiente${pendingOrders > 1 ? "s" : ""}`, body: "Pedidos esperando confirmación. Responde rápido para no perder clientes.", tab: "pedidos", time: now, read: false, urgent: pendingOrders >= 3 });
    if (overduePayables > 0) items.push({ id: "overdue-payables", type: "stock", title: `${overduePayables} pago${overduePayables > 1 ? "s" : ""} a proveedor${overduePayables > 1 ? "es" : ""} vencido${overduePayables > 1 ? "s" : ""}`, body: "Cuentas por pagar vencidas. Regulariza para mantener buenas relaciones.", tab: "proveedores", time: now, read: false, urgent: overduePayables > 0 });
    if (lowStock > 0) items.push({ id: "low-stock", type: "stock", title: `${lowStock} producto${lowStock > 1 ? "s" : ""} con stock bajo`, body: "Algunos productos están por debajo del mínimo de inventario.", tab: "inventario", time: now, read: false, urgent: false });
    if (todayRevenue > 0) items.push({ id: "today-revenue", type: "venta", title: `S/${todayRevenue.toFixed(2)} en ventas hoy`, body: "Resumen del día en curso. Ver detalle en Dashboard.", tab: "dashboard", time: now, read: false, urgent: false });
    return items;
  }, [pendingOrders, lowStock, todayRevenue, overduePayables, oldPendingOrders, now]);

  const alerts = useMemo(() => baseAlerts.map(a => ({ ...a, read: readIds.has(a.id) })), [baseAlerts, readIds]);

  const unread = alerts.filter(a => !a.read).length;
  const urgent = alerts.filter(a => a.urgent && !a.read).length;

  const markRead = (id: string) => setReadIds(prev => new Set([...prev, id]));
  const markAllRead = () => setReadIds(new Set(alerts.map(a => a.id)));

  const handleClick = (alert: AlertItem) => {
    markRead(alert.id);
    if (alert.tab) onNavigate(alert.tab);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          "relative flex items-center justify-center h-8 w-8 rounded-lg transition-colors",
          urgent > 0
            ? "text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/30"
            : unread > 0
            ? "text-[var(--data-warning-500)] hover:bg-[var(--data-warning-50)] dark:hover:bg-amber-950/30"
            : "text-[var(--text-tertiary)] dark:text-muted hover:bg-[var(--surface-sunken)] dark:hover:bg-accent"
        )}
        title="Centro de Alertas"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[length:var(--ts-2xs)] font-extrabold text-white px-0.5"
            style={{ background: urgent > 0 ? "#ef4444" : "#ff6b5b" }}>
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <div className="flex flex-wrap items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <span className="text-sm font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Alertas</span>
                {unread > 0 && <span className="px-1.5 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-extrabold bg-primary text-white">{unread}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {unread > 0 && (
                  <button onClick={markAllRead} className="text-[length:var(--ts-2xs)] font-semibold text-primary hover:underline">
                    Marcar todo leído
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-surface transition-colors">
                  <X className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                </button>
              </div>
            </div>

            {/* Alerts list */}
            <div className="max-h-72 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-[var(--text-tertiary)] dark:text-muted">
                  <Bell className="h-8 w-8 mb-2 opacity-40" />
                  <span className="text-sm font-medium">Todo en orden</span>
                </div>
              ) : (
                alerts.map(alert => {
                  const meta = TYPE_META[alert.type];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={alert.id}
                      onClick={() => handleClick(alert)}
                      className={cn(
                        "w-full flex items-start gap-3 px-2 sm:px-4 py-2 sm:py-3 hover:bg-[var(--surface-alt)] dark:hover:bg-surface transition-colors text-left border-b border-[var(--rule-base)] last:border-0",
                        !alert.read && "bg-primary/[0.03]"
                      )}
                    >
                      <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5", meta.bg)}>
                        <Icon className={cn("h-4 w-4", meta.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={cn("text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] leading-tight", !alert.read && "font-extrabold")}>{alert.title}</p>
                          {alert.urgent && <span className="px-1 py-0.5 rounded text-[length:var(--ts-2xs)] font-extrabold bg-[var(--data-error-500)] text-white shrink-0">URGENTE</span>}
                        </div>
                        <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] dark:text-muted mt-0.5 line-clamp-2">{alert.body}</p>
                      </div>
                      {alert.tab && <ChevronRight className="h-3.5 w-3.5 text-[var(--text-tertiary)] dark:text-muted mt-1 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-2 sm:px-4 py-1.5 sm:py-2.5 bg-[var(--surface-alt)] dark:bg-surface border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <button
                onClick={() => { onNavigate("actividad"); setOpen(false); }}
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              >
                Ver todo el registro de actividad <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

