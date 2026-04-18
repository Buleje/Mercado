"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Store,
  Package,
  ShoppingCart,
  Users,
  Activity,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type IsolationCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

type TenantHealth = {
  tenantId: string;
  slug: string;
  name: string;
  status: "healthy" | "warning" | "critical";
  checks: IsolationCheck[];
  stats: {
    products: number;
    orders: number;
    customers: number;
    ordersLast24h: number;
    errorsLast24h: number;
  };
};

type HealthResponse = {
  overall: "healthy" | "warning" | "critical";
  tenants: TenantHealth[];
  isolationTests: IsolationCheck[];
  checkedAt: string;
};

// ── Config ────────────────────────────────────────────────────────────────────

const OVERALL_STATUS = {
  healthy:  { icon: CheckCircle,    color: "text-[var(--data-success)]", bg: "bg-[var(--data-success-50)]", border: "border-[var(--data-success)]", label: "Sistema Saludable" },
  warning:  { icon: AlertTriangle,  color: "text-[var(--data-warning)]",   bg: "bg-[var(--data-warning-50)]",   border: "border-[var(--data-warning)]",   label: "Advertencias Detectadas" },
  critical: { icon: XCircle,        color: "text-[var(--data-error)]",     bg: "bg-[var(--data-error-50)]",     border: "border-[var(--data-error)]",     label: "Problemas Críticos" },
};

const TENANT_STATUS = {
  healthy:  { dot: "bg-[var(--data-success)]", text: "text-[var(--data-success)]", bg: "bg-[var(--data-success-50)]" },
  warning:  { dot: "bg-[var(--data-warning)]",   text: "text-[var(--data-warning)]",   bg: "bg-[var(--data-warning-50)]" },
  critical: { dot: "bg-[var(--data-error)]",     text: "text-[var(--data-error)]",     bg: "bg-[var(--data-error-50)]" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse p-6">
      <div className="h-24 bg-gray-100 rounded-xl" />
      <div className="h-40 bg-gray-100 rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-48 bg-gray-100 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TenantMonitorPanel() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: HealthResponse = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Auto-refresh every 60 seconds
    const interval = setInterval(() => void load(true), 60_000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <div className="rounded-xl bg-[var(--data-error-50)] border border-[var(--data-error)] p-6 text-center">
        <XCircle className="h-10 w-10 text-[var(--data-error)] mx-auto mb-3" />
        <p className="font-bold text-[var(--data-error)]">Error al cargar monitoreo</p>
        <p className="text-sm text-[var(--data-error)] mt-1">{error}</p>
        <button
          onClick={() => void load()}
          className="mt-4 px-5 py-2 rounded-xl text-sm font-bold text-white bg-[var(--data-error)] hover:bg-[var(--data-error)] transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  const statusCfg = OVERALL_STATUS[data.overall];
  const StatusIcon = statusCfg.icon;

  return (
    <div className="space-y-6">
      {/* ── Overall Status Banner ── */}
      <div className={`rounded-xl ${statusCfg.bg} border ${statusCfg.border} p-5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusIcon className={`h-8 w-8 ${statusCfg.color}`} />
            <div>
              <h2 className="text-lg font-bold text-gray-900">{statusCfg.label}</h2>
              <p className="text-sm text-gray-600">
                Última verificación: {fmtDate(data.checkedAt)} · {data.tenants.length} tiendas monitoreadas
              </p>
            </div>
          </div>
          <button
            onClick={() => void load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-white border border-[var(--rule-base)] hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* ── Global Isolation Tests ── */}
      <div className="rounded-xl bg-white border border-[var(--rule-base)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5 text-[var(--accent)]" />
          <h3 className="text-base font-bold text-gray-900">Pruebas de Aislamiento Global</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.isolationTests.map((test, i) => (
            <div
              key={i}
              className={`rounded-xl border p-3 ${
                test.passed
                  ? "bg-[var(--data-success-50)] border-[var(--data-success)]"
                  : "bg-[var(--data-error-50)] border-[var(--data-error)]"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {test.passed ? (
                  <CheckCircle className="h-4 w-4 text-[var(--data-success)] shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-[var(--data-error)] shrink-0" />
                )}
                <span className="text-sm font-semibold text-gray-900">{test.name}</span>
              </div>
              <p className="text-xs text-gray-600 ml-6">{test.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={Store}
          label="Tiendas"
          value={data.tenants.length}
          sub={`${data.tenants.filter((t) => t.status === "healthy").length} saludables`}
          color="teal"
        />
        <StatCard
          icon={Package}
          label="Productos Total"
          value={data.tenants.reduce((s, t) => s + Math.max(0, t.stats.products), 0)}
          sub="Todos los tenants"
          color="blue"
        />
        <StatCard
          icon={ShoppingCart}
          label="Pedidos 24h"
          value={data.tenants.reduce((s, t) => s + Math.max(0, t.stats.ordersLast24h), 0)}
          sub="Últimas 24 horas"
          color="purple"
        />
        <StatCard
          icon={Users}
          label="Clientes Total"
          value={data.tenants.reduce((s, t) => s + Math.max(0, t.stats.customers), 0)}
          sub="Todos los tenants"
          color="orange"
        />
      </div>

      {/* ── Per-Tenant Cards ── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-5 w-5 text-gray-700" />
          <h3 className="text-base font-bold text-gray-900">Estado por Tienda</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.tenants.map((tenant) => (
            <TenantCard key={tenant.tenantId} tenant={tenant} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Sub-Components ────────────────────────────────────────────────────────────

const STAT_COLORS: Record<string, string> = {
  teal: "text-teal-600 bg-teal-50",
  blue: "text-[var(--data-success)] bg-[var(--data-success-50)]",
  purple: "text-[var(--text-secondary)] bg-[var(--surface-sunken)]",
  orange: "text-[var(--data-warning)] bg-[var(--data-warning-50)]",
};

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  sub: string;
  color: string;
}) {
  const c = STAT_COLORS[color] ?? STAT_COLORS.teal;
  return (
    <div className="rounded-xl bg-white border border-[var(--rule-base)] p-4">
      <div className={`inline-flex p-2 rounded-lg ${c} mb-2`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString("es-PE")}</p>
      <p className="text-xs font-semibold text-gray-700">{label}</p>
      <p className="text-xs text-gray-500">{sub}</p>
    </div>
  );
}

function TenantCard({ tenant }: { tenant: TenantHealth }) {
  const cfg = TENANT_STATUS[tenant.status];

  return (
    <div className="rounded-xl bg-white border border-[var(--rule-base)] p-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`h-3 w-3 rounded-full ${cfg.dot}`} />
          <h4 className="font-bold text-gray-900 text-sm">{tenant.name}</h4>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
          {tenant.status === "healthy" ? "Saludable" : tenant.status === "warning" ? "Advertencia" : "Crítico"}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center">
          <p className="text-lg font-bold text-gray-900">{tenant.stats.products}</p>
          <p className="text-[length:var(--ts-2xs)] text-gray-500 uppercase tracking-wide">Productos</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-gray-900">{tenant.stats.orders}</p>
          <p className="text-[length:var(--ts-2xs)] text-gray-500 uppercase tracking-wide">Pedidos</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-gray-900">{tenant.stats.customers}</p>
          <p className="text-[length:var(--ts-2xs)] text-gray-500 uppercase tracking-wide">Clientes</p>
        </div>
      </div>

      {/* Activity */}
      <div className="flex items-center justify-between text-xs text-gray-500 mb-3 pb-3 border-b border-[var(--rule-soft)]">
        <span>Pedidos 24h: <strong className="text-gray-700">{tenant.stats.ordersLast24h}</strong></span>
        <span className="text-gray-400">slug: {tenant.slug}</span>
      </div>

      {/* Isolation checks */}
      <div className="space-y-1">
        {tenant.checks.map((check, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {check.passed ? (
              <CheckCircle className="h-3 w-3 text-[var(--data-success)] shrink-0" />
            ) : (
              <XCircle className="h-3 w-3 text-[var(--data-error)] shrink-0" />
            )}
            <span className="text-xs text-gray-600 truncate">{check.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
