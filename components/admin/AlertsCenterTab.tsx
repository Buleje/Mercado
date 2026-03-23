"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  Clock,
  Package,
  ShoppingCart,
  CreditCard,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type Urgency = "critical" | "warning" | "info";

interface Alert {
  id: string;
  urgency: Urgency;
  icon: React.ElementType;
  title: string;
  description: string;
  action: string;
  href: string;
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
    border: "border-l-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/20",
    icon: "text-blue-600 dark:text-blue-400",
    badge: "bg-blue-100 dark:bg-blue-900/40",
    badgeText: "text-blue-700 dark:text-blue-300",
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
          className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-4 animate-pulse"
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

export default function AlertsCenterTab({ tenantId: _tenantId }: Props) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <div className="bg-red-50 dark:bg-red-950/20 rounded-2xl border border-red-200 dark:border-red-800/30 p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-3">
          {error}
        </p>
        <button
          onClick={fetchAlerts}
          className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (loading) {
    return <AlertSkeleton />;
  }

  if (alerts.length === 0) {
    return (
      <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200 dark:border-emerald-800/30 p-8 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
        <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">
          Todo en orden
        </p>
        <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
          No hay alertas activas. Tu negocio esta funcionando bien.
        </p>
        <button
          onClick={fetchAlerts}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm font-bold hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </button>
      </div>
    );
  }

  // Count by urgency
  const criticalCount = alerts.filter((a) => a.urgency === "critical").length;
  const warningCount = alerts.filter((a) => a.urgency === "warning").length;
  const infoCount = alerts.filter((a) => a.urgency === "info").length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <h3 className="text-sm font-extrabold text-gray-700 dark:text-foreground uppercase tracking-wide mr-auto">
          {alerts.length} alerta{alerts.length > 1 ? "s" : ""} activa
          {alerts.length > 1 ? "s" : ""}
        </h3>
        {criticalCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
            {criticalCount} critico{criticalCount > 1 ? "s" : ""}
          </span>
        )}
        {warningCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
            {warningCount} atencion
          </span>
        )}
        {infoCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            {infoCount} info
          </span>
        )}
        <button
          onClick={fetchAlerts}
          disabled={loading}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-surface transition-colors"
          title="Actualizar alertas"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Alert cards */}
      <div className="space-y-3">
        {alerts.map((alert) => {
          const config = URGENCY_CONFIG[alert.urgency];
          const Icon = alert.icon;
          return (
            <div
              key={alert.id}
              className={cn(
                "flex items-center gap-3 sm:gap-4 rounded-2xl border border-l-4 p-4",
                config.border,
                config.bg,
                "border-gray-200 dark:border-card-border",
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
                      "hidden sm:inline-flex shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide",
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
              </div>

              {/* Action button */}
              <button
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("admin:navigate", {
                      detail: { tab: alert.href },
                    }),
                  );
                }}
                className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-card border border-gray-200 dark:border-card-border text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-surface transition-colors"
              >
                {alert.action}
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
