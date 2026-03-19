"use client";

import { useEffect, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { TrendingUp, DollarSign, Users } from "lucide-react";

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

const PIE_COLORS = ["#6b7280", "#6366f1", "#8b5cf6", "#f59e0b"];
const PLAN_NAMES: Record<string, string> = { free: "Free", pro: "Pro", business: "Business", enterprise: "Enterprise" };

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
        {/* Skeleton: MRR / ARR / ARPU cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
              <div className="h-4 w-20 bg-gray-800 rounded" />
              <div className="h-8 w-32 bg-gray-800 rounded" />
              <div className="h-3 w-24 bg-gray-800/60 rounded" />
            </div>
          ))}
        </div>
        {/* Skeleton: Growth metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-2">
              <div className="h-3 w-16 bg-gray-800 rounded" />
              <div className="h-7 w-14 bg-gray-800 rounded" />
            </div>
          ))}
        </div>
        {/* Skeleton: Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="h-5 w-40 bg-gray-800 rounded mb-4" />
            <div className="h-48 bg-gray-800/40 rounded-xl" />
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="h-5 w-40 bg-gray-800 rounded mb-4" />
            <div className="h-48 bg-gray-800/40 rounded-xl" />
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

  const pieData = Object.entries(data.planDistribution).map(([plan, count]) => ({
    name: PLAN_NAMES[plan] ?? plan,
    value: count,
  }));

  return (
    <div className="space-y-6">
      {/* MRR / ARR / ARPU overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-3">
            <DollarSign className="w-4 h-4 text-emerald-400" /> MRR
          </div>
          <div className="text-3xl font-bold text-white">${data.overview.mrr.toLocaleString("en-US")}</div>
          <div className="text-gray-500 text-xs mt-1">{data.overview.payingTenants} tiendas de pago</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-3">
            <TrendingUp className="w-4 h-4 text-blue-400" /> ARR
          </div>
          <div className="text-3xl font-bold text-white">${data.overview.arr.toLocaleString("en-US")}</div>
          <div className="text-gray-500 text-xs mt-1">Proyección anual</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-3">
            <Users className="w-4 h-4 text-violet-400" /> ARPU
          </div>
          <div className="text-3xl font-bold text-white">${data.overview.arpu}</div>
          <div className="text-gray-500 text-xs mt-1">Ingreso promedio por tienda</div>
        </div>
      </div>

      {/* Growth cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
            <Users className="w-4 h-4 text-indigo-400" /> Nuevas tiendas este mes
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-white">{data.growth.tenantsThisMonth}</span>
            <GrowthBadge value={data.growth.tenantGrowthPct} />
          </div>
          <div className="text-gray-500 text-xs mt-1">vs {data.growth.tenantsLastMonth} mes anterior</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" /> Pedidos este mes
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-white">{data.growth.ordersThisMonth}</span>
            <GrowthBadge value={data.growth.orderGrowthPct} />
          </div>
          <div className="text-gray-500 text-xs mt-1">vs {data.growth.ordersLastMonth} mes anterior</div>
        </div>
      </div>

      {/* Revenue trend chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-emerald-400" /> Tendencia de Revenue (6 meses)
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data.monthlyRevenue} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="month" stroke="#6b7280" tick={{ fontSize: 12 }} />
            <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} tickFormatter={v => `$${v}`} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, color: "#fff" }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((value: any) => [`$${Number(value).toLocaleString()}`, "Revenue"]) as any}
            />
            <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#revGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly signups bar chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-400" /> Nuevos Registros por Mes
        </h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.monthlySignups} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="month" stroke="#6b7280" tick={{ fontSize: 12 }} />
            <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, color: "#fff" }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((value: any) => [value, "Registros"]) as any}
            />
            <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Plan distribution pie chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          Distribución de Planes
        </h3>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                dataKey="value"
                paddingAngle={2}
                label={((props: PieLabelRenderProps) => `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`) as (props: PieLabelRenderProps) => string}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, color: "#fff" }}
              />
              <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function GrowthBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-gray-500 text-xs">Sin cambio</span>;
  const positive = value > 0;
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
      positive ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
    }`}>
      {positive ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}
