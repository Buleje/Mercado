"use client";

import { useEffect, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { DollarSign, Users } from "lucide-react";

interface AnalyticsData {
  overview: {
    totalTenants: number;
    activeTenants: number;
    payingTenants: number;
    mrr: number;
    arr: number;
    arpu: number;
  };
  growth: {
    tenantsThisMonth: number;
    tenantsLastMonth: number;
    tenantGrowthPct: number;
    ordersThisMonth: number;
    ordersLastMonth: number;
    orderGrowthPct: number;
  };
  planDistribution: Record<string, number>;
  monthlySignups: { month: string; count: number }[];
  monthlyRevenue: { month: string; revenue: number }[];
}

const fmtSoles = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

export default function RevenueCharts() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/superadmin/analytics", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 space-y-3">
              <div className="h-4 w-20 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-8 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-3 w-24 bg-gray-100 dark:bg-gray-800/60 rounded" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
            <div className="h-5 w-40 bg-gray-200 dark:bg-gray-800 rounded mb-4" />
            <div className="h-48 bg-gray-100 dark:bg-gray-800/40 rounded-xl" />
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
            <div className="h-5 w-40 bg-gray-200 dark:bg-gray-800 rounded mb-4" />
            <div className="h-48 bg-gray-100 dark:bg-gray-800/40 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm">
        No se pudieron cargar los datos de analytics.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Revenue trend chart */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-emerald-500" /> Tendencia de Ingresos (6 meses)
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data.monthlyRevenue} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00B4A6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00B4A6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" stroke="#9ca3af" tick={{ fontSize: 12 }} />
            <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} tickFormatter={v => `S/${v}`} />
            <Tooltip
              contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, color: "#111" }}
              formatter={((value: number) => [fmtSoles(value), "Ingresos"]) as never}
            />
            <Area type="monotone" dataKey="revenue" stroke="#00B4A6" strokeWidth={2} fill="url(#revGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly signups bar chart */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-500" /> Nuevos Registros por Mes
        </h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.monthlySignups} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" stroke="#9ca3af" tick={{ fontSize: 12 }} />
            <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, color: "#111" }}
              formatter={((value: number) => [value, "Registros"]) as never}
            />
            <Bar dataKey="count" fill="#00B4A6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
