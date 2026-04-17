"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  Clock,
  Package,
  ShoppingCart,
  CreditCard,
  ArrowRight,
  RefreshCw,
  ShieldAlert,
  XCircle,
  Check,
  Bell,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type Urgency = "critical" | "warning" | "info";
type AlertCategory = "pedidos" | "inventario" | "finanzas" | "general";

interface Alert {
  id: string;
  urgency: Urgency;
  icon: React.ElementType;
  title: string;
  description: string;
  action: string;
  href: string;
  moduleId?: string;
  tabId?: string;
  category: AlertCategory;
  createdAt: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<AlertCategory, { label: string; Icon: LucideIcon }> = {
  pedidos: { label: "Pedidos", Icon: ShoppingCart },
  inventario: { label: "Inventario", Icon: Package },
  finanzas: { label: "Finanzas", Icon: Wallet },
  general: { label: "General", Icon: Bell },
};

function timeAgo(ts: number): string {
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return "hace unos segundos";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `hace ${diffHrs}h`;
  return `hace ${Math.floor(diffHrs / 24)}d`;
}

function getDismissedKey(): string {
  return `dismissed-alerts-${new Date().toISOString().slice(0, 10)}`;
}

function getDismissedAlerts(): string[] {
  try {
    return JSON.parse(localStorage.getItem(getDismissedKey()) ?? "[]");
  } catch { return []; }
}

function dismissAlert(alertId: string) {
  try {
    const dismissed = getDismissedAlerts();
    if (!dismissed.includes(alertId)) {
      dismissed.push(alertId);
      localStorage.setItem(getDismissedKey(), JSON.stringify(dismissed));
    }
  } catch { /* ignore */ }
}

interface DashboardAlerts {
  pendingOrders: number;
  overduePayables: number;
  lowStock: number;
}

interface DashboardData {
  orders: { id: string; status: string; createdAt: string }[];
  payables: { id: string; amount: number; paidAmount: number; status: string; dueDate: string; supplierName?: string }[];
  alerts: DashboardAlerts;
}

interface ExpiringBatch {
  id: string;
  productName?: string;
  expiresAt: string;
  quantity?: number;
}

interface LowStockProduct {
  id: string;
  name: string;
  stock: number;
  stockMin: number;
}

interface Props {
  tenantId?: string;
  onNavigate?: (moduleId: string, tabId: string) => void;
}

// ── Config ───────────────────────────────────────────────────────────────────

const URGENCY_CONFIG: Record<
  Urgency,
  { border: string; bg: string; icon: string; badge: string; badgeText: string; order: number }
> = {
  critical: {
    border: "border-l-red-500",
    bg: "bg-red-50 dark:bg-red-950/20",
    icon: "text-red-600 dark:text-red-400",
    badge: "bg-red-100 dark:bg-red-900/40",
    badgeText: "text-red-700 dark:text-red-300",
    order: 0,
  },
  warning: {
    border: "border-l-orange-500",
    bg: "bg-orange-50 dark:bg-orange-950/20",
    icon: "text-orange-600 dark:text-orange-400",
    badge: "bg-orange-100 dark:bg-orange-900/40",
    badgeText: "text-orange-700 dark:text-orange-300",
    order: 1,
  },
  info: {
    border: "border-l-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    icon: "text-emerald-600 dark:text-emerald-400",
    badge: "bg-emerald-100 dark:bg-emerald-900/40",
    badgeText: "text-emerald-700 dark:text-emerald-300",
    order: 2,
  },
};

const URGENCY_LABEL: Record<Urgency, string> = {
  critical: "Critico",
  warning: "Atencion",
  info: "Info",
};

// ── Skeleton ─────────────────────────────────────────────────────────────────

function AlertSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-xl shrink-0" />
            <div className="flex-1">
              <div className="h-4 w-44 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
              <div className="h-3 w-64 bg-gray-100 dark:bg-gray-800 rounded" />
            </div>
            <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded-lg shrink-0" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function AlertsCenterTab({ tenantId: _tenantId, onNavigate }: Props) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>(() => getDismissedAlerts());

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [dashRes, batchRes, reorderRes] = await Promise.all([
        fetch("/api/admin/dashboard"),
        fetch("/api/batches/expiring?days=7"),
        fetch("/api/auto-reorder"),
      ]);

      const collected: Alert[] = [];

      // ── Dashboard data: pending orders, overdue payables ────────────
      if (dashRes.ok) {
        const dash: DashboardData = await dashRes.json();

        // Pending orders > 2 hours → CRITICAL
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        const urgentOrders = dash.orders.filter(
          (o) =>
            o.status === "pendiente" &&
            new Date(o.createdAt).getTime() < twoHoursAgo,
        ).length;
        const recentOrders = dash.alerts.pendingOrders - urgentOrders;

        if (urgentOrders > 0) {
          collected.push({
            id: "urgent-orders",
            urgency: "critical",
            icon: ShieldAlert,
            title: `${urgentOrders} pedido${urgentOrders > 1 ? "s" : ""} sin atender hace mas de 2 horas`,
            description:
              "Los clientes esperan. Atiende estos pedidos inmediatamente.",
            action: "Atender",
            href: "pedidos",
            moduleId: "pedidos",
            tabId: "pedidos",
            category: "pedidos",
            createdAt: twoHoursAgo,
          });
        }

        if (recentOrders > 0) {
          collected.push({
            id: "pending-orders",
            urgency: "warning",
            icon: ShoppingCart,
            title: `${recentOrders} pedido${recentOrders > 1 ? "s" : ""} pendiente${recentOrders > 1 ? "s" : ""}`,
            description: "Confirma o procesa estos pedidos para no perder ventas.",
            action: "Ver pedidos",
            href: "pedidos",
            moduleId: "pedidos",
            tabId: "pedidos",
            category: "pedidos",
            createdAt: Date.now() - 30 * 60_000,
          });
        }

        // Overdue payables → INFO
        if (dash.alerts.overduePayables > 0) {
          const totalDebt = dash.payables
            .filter(
              (p) =>
                p.status !== "pagado" &&
                p.dueDate &&
                new Date(p.dueDate) < new Date(),
            )
            .reduce((sum, p) => sum + (p.amount - p.paidAmount), 0);

          collected.push({
            id: "overdue-payables",
            urgency: "info",
            icon: CreditCard,
            title: `${dash.alerts.overduePayables} pago${dash.alerts.overduePayables > 1 ? "s" : ""} a proveedores vencido${dash.alerts.overduePayables > 1 ? "s" : ""}`,
            description:
              totalDebt > 0
                ? `Debes ${formatCurrency(totalDebt)} en facturas vencidas.`
                : "Revisa tus cuentas por pagar.",
            action: "Ver deudas",
            href: "tesoreria",
            moduleId: "compras",
            tabId: "cuentas-pagar",
            category: "finanzas",
            createdAt: Date.now() - 60 * 60_000,
          });
        }
      }

      // ── Expiring batches ────────────────────────────────────────────
      if (batchRes.ok) {
        const batchData = await batchRes.json();
        const batches: ExpiringBatch[] = Array.isArray(batchData.data)
          ? batchData.data
          : [];

        // Already expired → CRITICAL
        const now = new Date();
        const expired = batches.filter(
          (b) => new Date(b.expiresAt) < now,
        );
        const expiringSoon = batches.filter(
          (b) => new Date(b.expiresAt) >= now,
        );

        if (expired.length > 0) {
          collected.push({
            id: "expired-products",
            urgency: "critical",
            icon: XCircle,
            title: `${expired.length} producto${expired.length > 1 ? "s" : ""} ya vencido${expired.length > 1 ? "s" : ""}`,
            description:
              "Retira estos productos de la venta inmediatamente.",
            action: "Revisar",
            href: "inventario-almacenes",
            moduleId: "inventario",
            tabId: "lotes",
            category: "inventario",
            createdAt: Date.now() - 10 * 60_000,
          });
        }

        if (expiringSoon.length > 0) {
          collected.push({
            id: "expiring-soon",
            urgency: "warning",
            icon: Clock,
            title: `${expiringSoon.length} producto${expiringSoon.length > 1 ? "s" : ""} por vencer en 7 dias`,
            description:
              "Ponlos en oferta o dales prioridad de salida para evitar perdidas.",
            action: "Revisar",
            href: "inventario-almacenes",
            moduleId: "inventario",
            tabId: "lotes",
            category: "inventario",
            createdAt: Date.now() - 20 * 60_000,
          });
        }
      }

      // ── Low stock ───────────────────────────────────────────────────
      if (reorderRes.ok) {
        const lowStockProducts: LowStockProduct[] = await reorderRes.json();
        const arr = Array.isArray(lowStockProducts) ? lowStockProducts : [];

        // Critical stock (ratio <= 0.3) → WARNING, rest → WARNING
        const critical = arr.filter(
          (p) => p.stockMin > 0 && p.stock / p.stockMin <= 0.3,
        );
        const low = arr.filter(
          (p) => p.stockMin > 0 && p.stock / p.stockMin > 0.3,
        );

        if (critical.length > 0) {
          collected.push({
            id: "critical-stock",
            urgency: "warning",
            icon: AlertTriangle,
            title: `${critical.length} producto${critical.length > 1 ? "s" : ""} con stock critico`,
            description:
              critical.length <= 3
                ? critical.map((p) => p.name).join(", ")
                : `${critical.slice(0, 2).map((p) => p.name).join(", ")} y ${critical.length - 2} mas`,
            action: "Reabastecer",
            href: "reposicion",
            moduleId: "inventario",
            tabId: "alertas-stock",
            category: "inventario",
            createdAt: Date.now() - 45 * 60_000,
          });
        }

        if (low.length > 0) {
          collected.push({
            id: "low-stock",
            urgency: "warning",
            icon: Package,
            title: `${low.length} producto${low.length > 1 ? "s" : ""} con stock bajo`,
            description: "Programa una reposicion para evitar quiebre de stock.",
            action: "Ver inventario",
            href: "inventario-almacenes",
            moduleId: "inventario",
            tabId: "alertas-stock",
            category: "inventario",
            createdAt: Date.now() - 50 * 60_000,
          });
        }
      }

      // Sort by urgency
      collected.sort(
        (a, b) =>
          URGENCY_CONFIG[a.urgency].order - URGENCY_CONFIG[b.urgency].order,
      );

      setAlerts(collected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar alertas");
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAlerts();
  }, [fetchAlerts]);

  // ── Render ──────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-800/30 p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-3">
          {error}
        </p>
        <button
          onClick={fetchAlerts}
          className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (loading) {
    return <AlertSkeleton />;
  }

  // Filter out dismissed alerts
  const visibleAlerts = alerts.filter((a) => !dismissed.includes(a.id));

  const handleDismiss = (alertId: string) => {
    dismissAlert(alertId);
    setDismissed((prev) => [...prev, alertId]);
  };

  if (visibleAlerts.length === 0) {
    return (
      <div className="text-center py-16">
        <span className="text-6xl block mb-4">&#x2705;</span>
        <h3 className="text-xl font-bold text-gray-900 dark:text-foreground">
          Todo en orden
        </h3>
        <p className="text-sm text-gray-500 dark:text-muted mt-2">
          Tu negocio marcha bien — sin alertas activas
        </p>
        <p className="text-xs text-gray-400 dark:text-muted mt-1">
          Se revisa automaticamente cada 2 minutos
        </p>
        <button
          onClick={fetchAlerts}
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm font-bold hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Actualizar ahora
        </button>
        {dismissed.length > 0 && (
          <button
            onClick={() => { setDismissed([]); localStorage.removeItem(getDismissedKey()); }}
            className="mt-3 block mx-auto text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Mostrar {dismissed.length} alerta{dismissed.length > 1 ? "s" : ""} resuelta{dismissed.length > 1 ? "s" : ""}
          </button>
        )}
      </div>
    );
  }

  // Count by urgency
  const criticalCount = visibleAlerts.filter((a) => a.urgency === "critical").length;
  const warningCount = visibleAlerts.filter((a) => a.urgency === "warning").length;
  const infoCount = visibleAlerts.filter((a) => a.urgency === "info").length;

  // Group by category
  const grouped = visibleAlerts.reduce<Record<AlertCategory, Alert[]>>((acc, alert) => {
    const cat = alert.category ?? "general";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(alert);
    return acc;
  }, {} as Record<AlertCategory, Alert[]>);

  // Order categories: pedidos, inventario, finanzas, general
  const categoryOrder: AlertCategory[] = ["pedidos", "inventario", "finanzas", "general"];
  const orderedCategories = categoryOrder.filter((cat) => grouped[cat]?.length > 0);

  return (
    <div className="space-y-6">
      {/* KPI badges */}
      <div className="flex flex-wrap gap-3 mb-1">
        {criticalCount > 0 && (
          <span className="px-3 py-1.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-full text-xs font-bold inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {criticalCount} Critica{criticalCount > 1 ? "s" : ""}
          </span>
        )}
        {warningCount > 0 && (
          <span className="px-3 py-1.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-full text-xs font-bold inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            {warningCount} Advertencia{warningCount > 1 ? "s" : ""}
          </span>
        )}
        {infoCount > 0 && (
          <span className="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {infoCount} Info
          </span>
        )}
        <button
          onClick={fetchAlerts}
          disabled={loading}
          className="ml-auto p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-surface transition-colors"
          title="Actualizar alertas"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Grouped alert cards */}
      {orderedCategories.map((cat) => {
        const catAlerts = grouped[cat];
        const catConfig = CATEGORY_LABELS[cat];
        return (
          <div key={cat} className="space-y-2">
            {/* Category separator */}
            <div className="flex items-center gap-2 pt-2">
              <catConfig.Icon className="h-3.5 w-3.5 text-gray-500 dark:text-muted" strokeWidth={1.75} />
              <h4 className="text-xs font-extrabold text-gray-500 dark:text-muted">
                {catConfig.label}
              </h4>
              <div className="flex-1 h-px bg-gray-200 dark:bg-card-border" />
            </div>

            {/* Alerts in this category */}
            <div className="space-y-2">
              {catAlerts.map((alert) => {
                const config = URGENCY_CONFIG[alert.urgency];
                const Icon = alert.icon;
                return (
                  <div
                    key={alert.id}
                    className={cn(
                      "flex items-center gap-3 sm:gap-4 rounded-xl border border-l-4 p-4",
                      config.border,
                      config.bg,
                      "border-[var(--rule-base)] dark:border-card-border",
                    )}
                  >
                    {/* Icon */}
                    <div
                      className={cn(
                        "flex items-center justify-center w-10 h-10 rounded-xl bg-white dark:bg-card shrink-0",
                        config.icon,
                      )}
                    >
                      <Icon className="w-5 h-5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-bold text-gray-900 dark:text-foreground truncate">
                          {alert.title}
                        </p>
                        <span
                          className={cn(
                            "hidden sm:inline-flex shrink-0 px-1.5 py-0.5 rounded text-[length:var(--ts-2xs)] font-bold",
                            config.badge,
                            config.badgeText,
                          )}
                        >
                          {URGENCY_LABEL[alert.urgency]}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-muted line-clamp-2">
                        {alert.description}
                      </p>
                      {alert.createdAt > 0 && (
                        <p className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-gray-500 mt-0.5">
                          {timeAgo(alert.createdAt)}
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="shrink-0 flex flex-col gap-1.5">
                      <button
                        onClick={() => {
                          if (onNavigate && alert.moduleId && alert.tabId) {
                            onNavigate(alert.moduleId, alert.tabId);
                          } else {
                            window.dispatchEvent(
                              new CustomEvent("admin:navigate", {
                                detail: { tab: alert.href },
                              }),
                            );
                          }
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-surface transition-colors"
                      >
                        {alert.action}
                        <ArrowRight className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleDismiss(alert.id)}
                        className="flex items-center gap-1 px-3 py-1 rounded-lg text-[length:var(--ts-2xs)] font-medium text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors"
                        title="Marcar como resuelta"
                      >
                        <Check className="w-3 h-3" />
                        Resuelta
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Show dismissed count */}
      {dismissed.length > 0 && (
        <div className="text-center pt-2">
          <button
            onClick={() => { setDismissed([]); localStorage.removeItem(getDismissedKey()); }}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            {dismissed.length} alerta{dismissed.length > 1 ? "s" : ""} resuelta{dismissed.length > 1 ? "s" : ""} hoy — mostrar
          </button>
        </div>
      )}
    </div>
  );
}
