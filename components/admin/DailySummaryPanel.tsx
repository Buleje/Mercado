"use client";

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
} from "lucide-react";

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
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800/40 rounded-xl animate-pulse" />
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <BarChart3 className="h-5 w-5 text-[#00B4A6]" />
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Resumen del día</h2>
          <span className="text-xs text-gray-400 ml-1">{data.date}</span>
          {lwSales > 0 && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              weekDelta >= 0
                ? "text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-400"
                : "text-red-600 bg-red-100 dark:bg-red-900/40 dark:text-red-400"
            }`}>
              {weekDelta >= 0 ? "↑" : "↓"} {Math.abs(weekDelta).toFixed(0)}% vs semana pasada
            </span>
          )}
        </div>
        <button
          onClick={fetchReport}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
          color="text-emerald-500"
          bg="bg-emerald-50 dark:bg-emerald-500/10"
        />
        <KpiCard
          icon={ShoppingCart}
          label="Pedidos"
          value={String(data.totalOrders)}
          color="text-emerald-500"
          bg="bg-emerald-50 dark:bg-emerald-500/10"
        />
        <KpiCard
          icon={TrendingUp}
          label="Ticket promedio"
          value={`S/${data.averageTicket.toFixed(2)}`}
          color="text-purple-500"
          bg="bg-purple-50 dark:bg-purple-500/10"
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
          color="text-[#00B4A6]"
        />
      </div>

      {/* Bottom row: Top products + Payment methods */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Hourly Sales Chart */}
        {hours.length > 0 && (
          <div className="sm:col-span-2 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 p-3">
            <div className="flex items-center gap-1.5 mb-2.5">
              <TrendingUp className="h-4 w-4 text-[#00B4A6]" />
              <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Ventas por hora</span>
              {lwOrders > 0 && (
                <span className={`text-[10px] ml-auto font-medium ${
                  weekOrdersDelta >= 0 ? "text-emerald-500" : "text-red-500"
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
                      className={`w-full rounded-t-sm transition-all duration-300 ${
                        isCurrent
                          ? "bg-[#00B4A6]"
                          : hasSales
                          ? "bg-[#00B4A6]/40 group-hover:bg-[#00B4A6]/70"
                          : "bg-gray-200 dark:bg-gray-700"
                      }`}
                      style={{ height: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-gray-400">6AM</span>
              <span className="text-[9px] text-gray-400">12PM</span>
              <span className="text-[9px] text-gray-400">6PM</span>
              <span className="text-[9px] text-gray-400">11PM</span>
            </div>
          </div>
        )}

        {/* Top Products */}
        <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 p-3">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Package className="h-4 w-4 text-[#00B4A6]" />
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Top productos</span>
          </div>
          {data.topProducts.length === 0 ? (
            <p className="text-xs text-gray-400">Sin ventas aún hoy</p>
          ) : (
            <div className="space-y-1.5">
              {data.topProducts.map((p, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-gray-400 w-4">{i + 1}</span>
                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-400">{p.quantity}u</span>
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      S/{p.revenue.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payment Methods */}
        <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 p-3">
          <div className="flex items-center gap-1.5 mb-2.5">
            <CreditCard className="h-4 w-4 text-purple-500" />
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Métodos de pago</span>
          </div>
          {paymentEntries.length === 0 ? (
            <p className="text-xs text-gray-400">Sin pagos aún hoy</p>
          ) : (
            <div className="space-y-2">
              {paymentEntries.map(([method, amount]) => {
                const Icon = PAYMENT_ICONS[method] ?? Banknote;
                const pct = totalPayments > 0 ? (amount / totalPayments) * 100 : 0;
                return (
                  <div key={method}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-xs capitalize text-gray-600 dark:text-gray-400">{method}</span>
                      </div>
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        S/{amount.toFixed(2)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#00B4A6] transition-all duration-500"
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
      <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
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
          ? "border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-500/5"
          : "border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30"
      }`}
    >
      <Icon className={`h-4 w-4 ${color} mb-1`} />
      <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
