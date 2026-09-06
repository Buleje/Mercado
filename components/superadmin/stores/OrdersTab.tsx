"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Package, DollarSign, TrendingUp, Users, Search } from "@buleje/design-system/icons";
import { SADataTable } from "@/components/superadmin/_shared/SADataTable";
import { TableSkeleton } from "@/components/superadmin/_shared/SASkeleton";
import type { SAColumn } from "@/components/superadmin/_shared/SADataTable";
import { StatCard } from "./StatCard";
import type { MarketplaceOrder } from "./types";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

function fmt(n: number) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);
}

const ORDER_STATUS_COLORS: Record<string, string> = {
  pendiente: "bg-[#0d9488] text-[#0d9488] dark:bg-[#0d9488]/30 dark:text-[#0d9488]",
  procesando: "bg-[var(--data-success-100)] text-[var(--data-success-500)] dark:bg-[var(--data-success-500)]/30 dark:text-[var(--data-success-500)]",
  completado: "bg-[var(--data-success-100)] text-[var(--data-success-500)] dark:bg-[var(--data-success-500)]/30 dark:text-[var(--data-success-500)]",
  cancelado: "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]",
  enviado: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
};

const ORDER_COLUMNS: SAColumn<MarketplaceOrder>[] = [
  {
    key: "id",
    label: "ID",
    render: (row) => <span className="text-xs font-mono text-gray-400">{row.id.slice(0, 8)}…</span>,
  },
  {
    key: "storeName",
    label: "Tienda",
    render: (row) => (
      <div>
        <div className="text-sm font-medium text-[var(--text-primary)]">{row.storeName}</div>
        <div className="text-xs text-gray-400">{row.storeSlug}</div>
      </div>
    ),
  },
  {
    key: "customerName",
    label: "Cliente",
    render: (row) => (
      <div>
        <div className="text-sm text-[var(--text-primary)]">{row.customerName}</div>
        <div className="text-xs text-gray-400">{row.customerPhone}</div>
      </div>
    ),
  },
  {
    key: "total",
    label: "Total",
    sortable: true,
    render: (row) => (
      <span className="text-sm font-bold text-primary tabular-nums">{fmt(row.total)}</span>
    ),
  },
  {
    key: "itemCount",
    label: "Items",
    render: (row) => (
      <span className="text-sm text-[var(--text-secondary)] tabular-nums">{row.itemCount}</span>
    ),
  },
  {
    key: "status",
    label: "Estado",
    render: (row) => (
      <span
        className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${ORDER_STATUS_COLORS[row.status] ?? "bg-gray-100 text-gray-500"}`}
      >
        {row.status}
      </span>
    ),
  },
  {
    key: "createdAt",
    label: "Fecha",
    sortable: true,
    render: (row) => (
      <span className="text-xs text-gray-400 tabular-nums">{fmtDate(row.createdAt)}</span>
    ),
  },
];

export function OrdersTab() {
  const [orders, setOrders] = useState<MarketplaceOrder[] | undefined>(undefined);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/superadmin/marketplace/orders", { credentials: "include" });
      if (!res.ok) throw new Error("Error al cargar pedidos");
      const data = await res.json();
      setOrders(data.orders ?? []);
    } catch {
      setError("Error al cargar pedidos del marketplace");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!orders) return [];
    if (!search.trim()) return orders;
    const q = search.toLowerCase();
    return orders.filter(
      (o) =>
        o.customerName.toLowerCase().includes(q) ||
        o.storeName.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q),
    );
  }, [orders, search]);

  const totalRevenue =
    orders?.reduce((s, o) => s + (o.status !== "cancelado" ? o.total : 0), 0) ?? 0;
  const completedCount = orders?.filter((o) => o.status === "completado").length ?? 0;
  const pendingCount = orders?.filter((o) => o.status === "pendiente").length ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<Package className="w-5 h-5" />}
          label="Total pedidos"
          value={orders?.length ?? 0}
        />
        <StatCard
          icon={<DollarSign className="w-5 h-5" />}
          label="Ingresos totales"
          value={fmt(totalRevenue)}
          trend="up"
          sub="Marketplace"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Completados"
          value={completedCount}
          sub={`${orders?.length ? Math.round((completedCount / orders.length) * 100) : 0}% del total`}
          trend="up"
        />
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="Pendientes"
          value={pendingCount}
          sub="Requieren atención"
          trend={pendingCount > 5 ? "down" : "neutral"}
        />
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar pedido, cliente o tienda..."
          className="w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30"
        />
      </div>

      {error && (
        <div className="bg-[var(--data-error-50)] dark:bg-red-950/30 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] text-[var(--data-error-500)] rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}
      {orders === undefined && !error && <TableSkeleton count={6} />}
      {orders !== undefined && (
        <SADataTable
          columns={ORDER_COLUMNS}
          data={filtered}
          rowKey={(row) => row.id}
          emptyMessage="Sin pedidos"
        />
      )}
    </div>
  );
}
