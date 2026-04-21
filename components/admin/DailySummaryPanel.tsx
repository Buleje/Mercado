"use client";

import { SectionTitle } from "@buleje/design-system";
import { useEffect, useState, useCallback } from "react";
import {
  BarChart3,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Package,
  Users,
  Truck,
  AlertTriangle,
  Wallet,
  RefreshCw,
  Banknote,
  CreditCard,
  Smartphone,
} from "@buleje/design-system/icons";

interface DailyReport {
  date: string;
  totalSales: number;
  totalOrders: number;
  averageTicket: number;
  topProducts: { name: string; quantity: number; revenue: number }[];
  paymentMethods: Record<string, number>;
  pendingDeliveries: number;
  lowStockAlerts: number;
  newCustomers: number;
  cashBalance: number;
  salesByHour?: number[];
  lastWeek?: { sales: number; orders: number };
}

const PAYMENT_ICONS: Record<string, typeof Banknote> = {
  efectivo: Banknote,
  yape: Smartphone,
  tarjeta: CreditCard,
  transferencia: CreditCard,
};

export default function DailySummaryPanel() {
  const [data, setData] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/daily-report", { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch { /* ignored */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-[var(--surface-sunken)]/40 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const paymentEntries = Object.entries(data.paymentMethods).sort(([, a], [, b]) => b - a);
  const totalPayments = paymentEntries.reduce((s, [, v]) => s + v, 0);

  // Weekly comparison
  const lwSales = data.lastWeek?.sales ?? 0;
  const lwOrders = data.lastWeek?.orders ?? 0;
  const weekDelta = lwSales > 0 ? ((data.totalSales - lwSales) / lwSales) * 100 : 0;
  const weekOrdersDelta = lwOrders > 0 ? ((data.totalOrders - lwOrders) / lwOrders) * 100 : 0;

  // Hourly chart data
  const hours = data.salesByHour ?? [];
  const maxHourly = Math.max(...hours, 1);
  const currentHour = new Date().getHours();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <BarChart3 className="h-5 w-5 text-primary" />
          <SectionTitle className="text-base font-bold text-[var(--text-primary)]">Resumen del día</SectionTitle>
          <span className="text-xs text-[var(--text-tertiary)] ml-1">{data.date}</span>
          {lwSales > 0 && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              weekDelta >= 0
                ? "text-[var(--data-success)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]"
                : "text-[var(--data-error)] bg-[var(--data-error-100)] dark:bg-[var(--data-error)]/40 dark:text-[var(--data-error)]"
            }`}>
              {weekDelta >= 0 ? "↑" : "↓"} {Math.abs(weekDelta).toFixed(0)}% vs semana pasada
            </span>
          )}
        </div>
        <button
          onClick={fetchReport}
          className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          icon={DollarSign}
          label="Ventas hoy"
          value={`S/${data.totalSales.toFixed(2)}`}
          color="text-[var(--data-success)]"
          bg="bg-[var(--accent-soft)] dark:bg-[var(--accent-soft)]"
        />
        <KpiCard
          icon={ShoppingCart}
          label="Pedidos"
          value={String(data.totalOrders)}
          color="text-[var(--data-success)]"
          bg="bg-[var(--accent-soft)] dark:bg-[var(--accent-soft)]"
        />
        <KpiCard
          icon={TrendingUp}
          label="Ticket promedio"
          value={`S/${data.averageTicket.toFixed(2)}`}
          color="text-[var(--text-secondary)]"
          bg="bg-[var(--surface-sunken)] dark:bg-[var(--text-primary)]/10"
        />
        <KpiCard
          icon={Wallet}
          label="En caja"
          value={`S/${data.cashBalance.toFixed(2)}`}
          color="text-amber-500"
          bg="bg-amber-50 dark:bg-amber-500/10"
        />
      </div>

      {/* Alerts row */}
      <div className="grid grid-cols-3 gap-3">
        <AlertCard
          icon={Truck}
          label="Entregas pendientes"
          value={data.pendingDeliveries}
          alert={data.pendingDeliveries > 5}
          color="text-orange-500"
        />
        <AlertCard
          icon={AlertTriangle}
          label="Productos sin stock"
          value={data.lowStockAlerts}
          alert={data.lowStockAlerts > 0}
          color="text-red-500"
        />
        <AlertCard
          icon={Users}
          label="Clientes nuevos"
          value={data.newCustomers}
          alert={false}
          color="text-primary"
        />
      </div>

      {/* Bottom row: Top products + Payment methods */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Hourly Sales Chart */}
        {hours.length > 0 && (
          <div className="sm:col-span-2 rounded-xl border border-[var(--rule-base)] bg-gray-50/50 dark:bg-gray-900/30 p-3">
            <div className="flex items-center gap-1.5 mb-2.5">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold text-[var(--text-secondary)]">Ventas por hora</span>
              {lwOrders > 0 && (
                <span className={`text-[length:var(--ts-2xs)] ml-auto font-medium ${
                  weekOrdersDelta >= 0 ? "text-[var(--data-success)]" : "text-[var(--data-error)]"
                }`}>
                  {weekOrdersDelta >= 0 ? "↑" : "↓"}{Math.abs(weekOrdersDelta).toFixed(0)}% pedidos vs semana pasada
                </span>
              )}
            </div>
            <div className="flex items-end gap-px h-16">
              {hours.map((val, h) => {
                const pct = maxHourly > 0 ? (val / maxHourly) * 100 : 0;
                const isCurrent = h === currentHour;
                const hasSales = val > 0;
                return (
                  <div
                    key={h}
                    className="flex-1 group relative"
                    title={`${h}:00 — S/${val.toFixed(2)}`}
                  >
                    <div
                      className={`w-full rounded-t-sm transition-all duration-[var(--dur-base)] ${
                        isCurrent
                          ? "bg-primary"
                          : hasSales
                          ? "bg-primary/40 group-hover:bg-primary/70"
                          : "bg-gray-200 dark:bg-gray-700"
                      }`}
                      style={{ height: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">6AM</span>
              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">12PM</span>
              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">6PM</span>
              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">11PM</span>
            </div>
          </div>
        )}

        {/* Top Products */}
        <div className="rounded-xl border border-[var(--rule-base)] bg-gray-50/50 dark:bg-gray-900/30 p-3">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Package className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold text-[var(--text-secondary)]">Top productos</span>
          </div>
          {data.topProducts.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)]">Sin ventas aún hoy</p>
          ) : (
            <div className="space-y-1.5">
              {data.topProducts.map((p, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-[var(--text-tertiary)] w-4">{i + 1}</span>
                    <span className="text-xs text-[var(--text-secondary)] truncate">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-[var(--text-tertiary)]">{p.quantity}u</span>
                    <span className="text-xs font-medium text-[var(--text-secondary)]">
                      S/{p.revenue.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payment Methods */}
        <div className="rounded-xl border border-[var(--rule-base)] bg-gray-50/50 dark:bg-gray-900/30 p-3">
          <div className="flex items-center gap-1.5 mb-2.5">
            <CreditCard className="h-4 w-4 text-[var(--text-secondary)]" />
            <span className="text-xs font-bold text-[var(--text-secondary)]">Métodos de pago</span>
          </div>
          {paymentEntries.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)]">Sin pagos aún hoy</p>
          ) : (
            <div className="space-y-2">
              {paymentEntries.map(([method, amount]) => {
                const Icon = PAYMENT_ICONS[method] ?? Banknote;
                const pct = totalPayments > 0 ? (amount / totalPayments) * 100 : 0;
                return (
                  <div key={method}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                        <span className="text-xs capitalize text-[var(--text-secondary)]">{method}</span>
                      </div>
                      <span className="text-xs font-medium text-[var(--text-secondary)]">
                        S/{amount.toFixed(2)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-[var(--dur-slow)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  color: string;
  bg: string;
}) {
  return (
    <div className={`rounded-xl ${bg} p-3`}>
      <Icon className={`h-5 w-5 ${color} mb-1`} />
      <p className="text-lg font-bold text-[var(--text-primary)]">{value}</p>
      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
    </div>
  );
}

function AlertCard({
  icon: Icon,
  label,
  value,
  alert,
  color,
}: {
  icon: typeof Truck;
  label: string;
  value: number;
  alert: boolean;
  color: string;
}) {
  return (
    <div
      className={`rounded-xl p-3 border ${
        alert
          ? "border-[var(--data-error)] dark:border-[var(--data-error)]/40 bg-[var(--data-error-50)]/50 dark:bg-[var(--data-error)]/5"
          : "border-[var(--rule-base)] bg-gray-50/50 dark:bg-gray-900/30"
      }`}
    >
      <Icon className={`h-4 w-4 ${color} mb-1`} />
      <p className="text-lg font-bold text-[var(--text-primary)]">{value}</p>
      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
    </div>
  );
}
