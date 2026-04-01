"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Building2, TrendingUp, CheckCircle2, ShoppingBag, Package, Users,
  BarChart3, Activity, Loader2, RefreshCw,
} from "lucide-react";
import { SAStatCard } from "@/components/superadmin/_shared/SAStatCard";
import { CardGridSkeleton, ChartSkeleton } from "@/components/superadmin/_shared/SASkeleton";

const RevenueCharts = dynamic(() => import("@/components/RevenueCharts"), { ssr: false });

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
    tenantGrowthPct: number;
    ordersThisMonth: number;
    orderGrowthPct: number;
  };
  totals: {
    totalOrders: number;
    totalProducts: number;
    totalAdminUsers: number;
  };
}

export default function DashboardPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fmtMRR = (n: number) =>
    new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(n);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/superadmin/analytics", { credentials: "include" });
      if (!res.ok) {
        setError("Error al cargar el dashboard");
        return;
      }
      const json = await res.json() as AnalyticsData;
      setData(json);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Resumen ejecutivo de la plataforma.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors disabled:opacity-50"
          title="Actualizar"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
          {error}
          <button
            type="button"
            onClick={() => void loadData()}
            className="underline hover:no-underline text-xs"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* KPI cards — 3x2 grid */}
      {loading ? (
        <CardGridSkeleton count={6} />
      ) : data ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <SAStatCard
            icon={<Building2 className="w-4 h-4" />}
            label="Total Tenants"
            value={data.overview.totalTenants}
            sub={`${data.growth.tenantsThisMonth} nuevos este mes`}
            accent="linear-gradient(90deg,#0f766e,#14b8a6)"
            trend={data.growth.tenantGrowthPct}
          />
          <SAStatCard
            icon={<TrendingUp className="w-4 h-4 text-green-500" />}
            label="MRR"
            value={fmtMRR(data.overview.mrr)}
            sub={`ARR: ${fmtMRR(data.overview.arr)}`}
            accent="#22c55e"
          />
          <SAStatCard
            icon={<CheckCircle2 className="w-4 h-4 text-teal-500" />}
            label="Tenants activos"
            value={data.overview.activeTenants}
            sub={`${data.overview.payingTenants} de pago`}
            accent="#14b8a6"
          />
          <SAStatCard
            icon={<ShoppingBag className="w-4 h-4 text-violet-500" />}
            label="Total pedidos"
            value={data.totals.totalOrders.toLocaleString("es-PE")}
            sub={`${data.growth.ordersThisMonth} este mes`}
            accent="#7c3aed"
            trend={data.growth.orderGrowthPct}
          />
          <SAStatCard
            icon={<Package className="w-4 h-4 text-amber-500" />}
            label="Total productos"
            value={data.totals.totalProducts.toLocaleString("es-PE")}
            accent="#f59e0b"
          />
          <SAStatCard
            icon={<Users className="w-4 h-4 text-blue-500" />}
            label="Usuarios admin"
            value={data.totals.totalAdminUsers.toLocaleString("es-PE")}
            accent="#3b82f6"
          />
        </div>
      ) : null}

      {/* Revenue charts */}
      {loading ? (
        <ChartSkeleton count={1} />
      ) : (
        <RevenueCharts />
      )}

      {/* Quick actions */}
      <div>
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-3">Acceso rápido</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              href: "/superadmin/tenants",
              icon: <Building2 className="w-6 h-6 text-teal-500" />,
              label: "Gestionar tiendas",
              desc: "Ver, suspender, cambiar plan o impersonar tenants",
            },
            {
              href: "/superadmin/analytics",
              icon: <BarChart3 className="w-6 h-6 text-violet-500" />,
              label: "Analytics",
              desc: "Métricas de crecimiento, MRR, comisiones y riesgo",
            },
            {
              href: "/superadmin/activity",
              icon: <Activity className="w-6 h-6 text-blue-500" />,
              label: "Log de actividad",
              desc: "Auditoría completa de acciones en la plataforma",
            },
          ].map(({ href, icon, label, desc }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-start gap-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm dark:shadow-none hover:border-teal-300 dark:hover:border-teal-700 transition-colors"
            >
              <div className="shrink-0 mt-0.5">{icon}</div>
              <div>
                <div className="font-semibold text-gray-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                  {label}
                </div>
                <div className="text-gray-400 text-xs mt-1">{desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Loading overlay para charts */}
      {loading && (
        <div className="flex items-center justify-center gap-3 py-8 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          Cargando datos…
        </div>
      )}
    </div>
  );
}
