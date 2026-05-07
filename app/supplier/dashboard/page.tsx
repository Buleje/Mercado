"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus = "pendiente" | "recibido" | "parcial" | "cancelado";

interface DashboardData {
  period: string;
  stats: {
    ordersThisMonth: number;
    totalAmountThisMonth: number;
    fillRate: number | null;
    ranking: { position: number; total: number };
  };
  lastOrders: {
    id: string;
    total: number;
    status: OrderStatus;
    deliveryDate: string | null;
    createdAt: string;
    itemCount: number;
  }[];
  stockAlerts: {
    productId: number;
    name: string;
    stock: number;
    stockMin: number;
  }[];
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<OrderStatus, string> = {
  pendiente: "bg-amber-100 text-[var(--data-warning-700)] dark:bg-amber-900/30 dark:text-amber-400",
  recibido: "bg-emerald-100 text-[var(--data-success-700)] dark:bg-emerald-900/30 dark:text-emerald-400",
  parcial: "bg-emerald-100 text-[var(--data-success-700)] dark:bg-emerald-900/30 dark:text-emerald-400",
  cancelado: "bg-red-100 text-[var(--data-error-700)] dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: "Pendiente",
  recibido: "Recibido",
  parcial: "Parcial",
  cancelado: "Cancelado",
};

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? ""}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-bold ${accent ? "text-[var(--accent)]" : "text-gray-900 dark:text-white"}`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  );
}

// ─── Mini bar chart ───────────────────────────────────────────────────────────

function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1.5 h-20">
      {data.map((d) => (
        <div key={d.label} className="flex flex-col items-center gap-1 flex-1">
          <div
            className="w-full rounded-t-sm transition-all duration-300"
            style={{
              height: `${Math.round((d.value / max) * 100) * 0.6}px`,
              minHeight: d.value > 0 ? "4px" : "0px",
              background: "var(--accent)",
              opacity: 0.85,
            }}
          />
          <span className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-gray-500 truncate w-full text-center">
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SupplierDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Histórico de pedidos (simulado de last orders — en producción vendría de un endpoint separado)
  const [chartData, setChartData] = useState<{ label: string; value: number }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/supplier/dashboard");
      if (res.status === 401) {
        router.replace("/supplier");
        return;
      }
      if (!res.ok) throw new Error("Error al cargar dashboard");
      const json = (await res.json()) as DashboardData;
      setData(json);

      // Construir chart con últimas 6 semanas / pedidos agrupados por semana
      const weekMap: Record<string, number> = {};
      for (const o of json.lastOrders) {
        const d = new Date(o.createdAt);
        const wk = `S${Math.ceil(d.getDate() / 7)}/${d.getMonth() + 1}`;
        weekMap[wk] = (weekMap[wk] ?? 0) + 1;
      }
      setChartData(
        Object.entries(weekMap)
          .slice(-6)
          .map(([label, value]) => ({ label, value })),
      );
    } catch {
      setError("No se pudo cargar el dashboard. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--accent)] border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-gray-500 dark:text-gray-400">{error ?? "Sin datos"}</p>
        <button
          onClick={load}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
          style={{ background: "var(--accent)" }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  const { stats, lastOrders, stockAlerts } = data;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Periodo:{" "}
            <span className="font-medium text-gray-700 dark:text-gray-300">{data.period}</span>
          </p>
        </div>
        <a
          href="/supplier/catalogo"
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "#f4a261" }}
        >
          Gestionar catálogo
        </a>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Pedidos este mes"
          value={String(stats.ordersThisMonth)}
          accent
        />
        <KpiCard
          label="Monto total"
          value={`S/ ${stats.totalAmountThisMonth.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`}
          sub="este mes"
        />
        <KpiCard
          label="Fill rate"
          value={stats.fillRate != null ? `${Number(stats.fillRate).toFixed(1)}%` : "—"}
          sub="items entregados vs pedidos"
        />
        <KpiCard
          label="Ranking"
          value={
            stats.ranking.total > 0
              ? `#${stats.ranking.position} / ${stats.ranking.total}`
              : "—"
          }
          sub="entre proveedores del mes"
          accent={stats.ranking.position === 1}
        />
      </div>

      {/* Gráfico + Alertas */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Mini gráfico */}
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
            Pedidos recientes
          </h2>
          {chartData.length > 0 ? (
            <BarChart data={chartData} />
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500">Sin datos suficientes</p>
          )}
        </div>

        {/* Alertas de reorden */}
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
            Alertas de reorden
            {stockAlerts.length > 0 && (
              <span className="ml-2 rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-xs font-bold text-[var(--data-error-600)] dark:text-red-400">
                {stockAlerts.length}
              </span>
            )}
          </h2>
          {stockAlerts.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Sin alertas en este momento.
            </p>
          ) : (
            <ul className="space-y-2">
              {stockAlerts.map((a) => (
                <li
                  key={a.productId}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate text-gray-700 dark:text-gray-300 max-w-[60%]">
                    {a.name}
                  </span>
                  <span className="text-xs text-[var(--data-error-500)] dark:text-red-400 font-medium">
                    Stock: {a.stock} / mín {a.stockMin}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Últimos pedidos */}
      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Últimos pedidos
          </h2>
        </div>
        {lastOrders.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
            Sin pedidos registrados.
          </p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {lastOrders.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between px-5 py-3 text-sm"
              >
                <div>
                  <p className="font-mono text-xs text-gray-400 dark:text-gray-500">{o.id}</p>
                  <p className="text-gray-700 dark:text-gray-300">
                    {o.itemCount} producto{o.itemCount !== 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(o.createdAt).toLocaleDateString("es-PE")}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={o.status} />
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    S/ {o.total.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
