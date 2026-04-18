"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Building2, TrendingUp, CheckCircle2, ShoppingBag, Package, Users,
  BarChart3, Activity, Loader2, RefreshCw,
} from "lucide-react";
import { StatCard } from "@buleje/design-system";
import { CardGridSkeleton, ChartSkeleton } from "@/components/superadmin/_shared/SASkeleton";

const RevenueCharts = dynamic(() => import("@/components/RevenueCharts"), { ssr: false });
const TenantMonitorPanel = dynamic(() => import("@/components/superadmin/TenantMonitorPanel"), { ssr: false });

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
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Resumen ejecutivo de la plataforma.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="p-2 rounded-xl bg-[var(--surface-sunken)] hover:bg-gray-200 dark:hover:bg-gray-700 text-[var(--text-tertiary)] transition-colors disabled:opacity-50"
          title="Actualizar"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-[var(--data-error-50)] dark:bg-red-950/30 border border-[var(--data-error)] dark:border-[var(--data-error)] text-[var(--data-error)] dark:text-[var(--data-error)] rounded-xl px-4 py-3 text-sm flex items-center justify-between">
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

      {/* KPI cards — 3x2 grid (Ola 1: StatCard DS, sin border-top semaforo) */}
      {loading ? (
        <CardGridSkeleton count={6} />
      ) : data ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard
            icon={Building2}
            label="Total Tenants"
            value={data.overview.totalTenants}
            subValue={`${data.growth.tenantsThisMonth} nuevos este mes`}
            delta={data.growth.tenantGrowthPct}
          />
          <StatCard
            icon={TrendingUp}
            label="MRR"
            value={fmtMRR(data.overview.mrr)}
            subValue={`ARR: ${fmtMRR(data.overview.arr)}`}
          />
          <StatCard
            icon={CheckCircle2}
            label="Tenants activos"
            value={data.overview.activeTenants}
            subValue={`${data.overview.payingTenants} de pago`}
          />
          <StatCard
            icon={ShoppingBag}
            label="Total pedidos"
            value={data.totals.totalOrders.toLocaleString("es-PE")}
            subValue={`${data.growth.ordersThisMonth} este mes`}
            delta={data.growth.orderGrowthPct}
          />
          <StatCard
            icon={Package}
            label="Total productos"
            value={data.totals.totalProducts.toLocaleString("es-PE")}
          />
          <StatCard
            icon={Users}
            label="Usuarios admin"
            value={data.totals.totalAdminUsers.toLocaleString("es-PE")}
          />
        </div>
      ) : null}

      {/* Revenue charts */}
      {loading ? (
        <ChartSkeleton count={1} />
      ) : (
        <RevenueCharts />
      )}

      {/* Tenant Health Monitor */}
      {!loading && (
        <div>
          <h2 className="text-base font-bold text-[var(--text-primary)] mb-3">Monitoreo de Tiendas</h2>
          <TenantMonitorPanel />
        </div>
      )}

      {/* Quick actions */}
      <div>
        <h2 className="text-base font-bold text-[var(--text-primary)] mb-3">Acceso rápido</h2>
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
              icon: <BarChart3 className="w-6 h-6 text-[var(--text-secondary)]" />,
              label: "Analytics",
              desc: "Métricas de crecimiento, MRR, comisiones y riesgo",
            },
            {
              href: "/superadmin/activity",
              icon: <Activity className="w-6 h-6 text-[var(--data-success)]" />,
              label: "Log de actividad",
              desc: "Auditoría completa de acciones en la plataforma",
            },
          ].map(({ href, icon, label, desc }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-start gap-4 bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-5 shadow-sm dark:shadow-none hover:border-teal-300 dark:hover:border-teal-700 transition-colors"
            >
              <div className="shrink-0 mt-0.5">{icon}</div>
              <div>
                <div className="font-semibold text-[var(--text-primary)] group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
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
