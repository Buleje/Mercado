"use client";

import { useState, useMemo } from "react";
import { ShoppingBag, Package, Star, DollarSign, Search, RefreshCw } from "@buleje/design-system/icons";
import { SADataTable } from "@/components/superadmin/_shared/SADataTable";
import { TableSkeleton } from "@/components/superadmin/_shared/SASkeleton";
import { PlanBadge } from "@/components/superadmin/_shared/SABadge";
import type { SAColumn } from "@/components/superadmin/_shared/SADataTable";
import { StatCard } from "./StatCard";
import type { StoreRow } from "./types";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

const STORE_COLUMNS: SAColumn<StoreRow>[] = [
  {
    key: "tenant",
    label: "Tienda (Tenant)",
    render: (row) => (
      <div>
        <div className="font-medium text-[var(--text-primary)] text-sm">{row.tenant.name}</div>
        <div className="text-xs text-gray-400 font-mono mt-0.5">{row.tenant.slug}</div>
      </div>
    ),
  },
  {
    key: "name",
    label: "Store",
    render: (row) => (
      <div>
        <div className="text-sm text-[var(--text-primary)]">{row.name}</div>
        <div className="text-xs text-gray-400 font-mono mt-0.5">{row.slug}</div>
      </div>
    ),
  },
  {
    key: "plan",
    label: "Plan",
    render: (row) => (
      <PlanBadge plan={row.tenant.plan as "free" | "pro" | "business" | "enterprise"} />
    ),
  },
  {
    key: "isPublished",
    label: "Estado",
    render: (row) => (
      <span
        className={[
          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold",
          row.isPublished
            ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
            : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
        ].join(" ")}
      >
        <span
          className={["w-1.5 h-1.5 rounded-full", row.isPublished ? "bg-green-500" : "bg-gray-400"].join(" ")}
        />
        {row.isPublished ? "Publicado" : "Borrador"}
      </span>
    ),
  },
  {
    key: "category",
    label: "Categoría",
    render: (row) => (
      <span className="text-xs text-[var(--text-secondary)] capitalize">{row.category}</span>
    ),
  },
  {
    key: "rating",
    label: "Rating",
    sortable: true,
    render: (row) => (
      <span className="inline-flex items-center gap-1 text-sm text-[var(--data-warning)] dark:text-[var(--data-warning)] font-semibold">
        <Star className="w-3.5 h-3.5 fill-current" />
        {row.rating.toFixed(1)}
        <span className="text-gray-400 font-normal text-xs">({row.reviewCount})</span>
      </span>
    ),
  },
  {
    key: "commission",
    label: "Comisión",
    sortable: true,
    render: (row) => (
      <span className="text-sm font-bold text-primary tabular-nums">{row.commission}%</span>
    ),
  },
  {
    key: "products",
    label: "Productos",
    sortable: true,
    render: (row) => (
      <span className="text-sm text-[var(--text-secondary)] tabular-nums">
        {row._count.products}
      </span>
    ),
  },
  {
    key: "createdAt",
    label: "Creado",
    render: (row) => (
      <span className="text-xs text-gray-400 tabular-nums">{fmtDate(row.createdAt)}</span>
    ),
  },
];

interface StoresTabProps {
  stores: StoreRow[] | undefined;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  refreshing: boolean;
}

export function StoresTab({ stores, loading, error, onRefresh, refreshing }: StoresTabProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");

  const filtered = useMemo(() => {
    if (!stores) return [];
    let list = stores;
    if (filter === "published") list = list.filter((s) => s.isPublished);
    if (filter === "draft") list = list.filter((s) => !s.isPublished);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.tenant.name.toLowerCase().includes(q) ||
          s.slug.toLowerCase().includes(q),
      );
    }
    return list;
  }, [stores, filter, search]);

  const published = stores?.filter((s) => s.isPublished).length ?? 0;
  const total = stores?.length ?? 0;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<ShoppingBag className="w-5 h-5" />}
          label="Total tiendas"
          value={total}
          sub={`${published} publicadas`}
          trend="up"
        />
        <StatCard
          icon={<Package className="w-5 h-5" />}
          label="Productos totales"
          value={stores?.reduce((s, r) => s + r._count.products, 0) ?? 0}
        />
        <StatCard
          icon={<Star className="w-5 h-5" />}
          label="Rating promedio"
          value={
            stores && stores.length
              ? (stores.reduce((s, r) => s + r.rating, 0) / stores.length).toFixed(1)
              : "0"
          }
        />
        <StatCard
          icon={<DollarSign className="w-5 h-5" />}
          label="Comisión promedio"
          value={`${
            stores && stores.length
              ? (stores.reduce((s, r) => s + r.commission, 0) / stores.length).toFixed(1)
              : "0"
          }%`}
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tienda..."
            className="w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <div className="flex gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1">
          {(["all", "published", "draft"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                filter === f
                  ? "bg-primary text-white"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {f === "all" ? "Todas" : f === "published" ? "Publicadas" : "Borradores"}
            </button>
          ))}
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing || loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-[var(--text-secondary)] bg-[var(--surface-raised)] border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="bg-[var(--data-error-50)] dark:bg-red-950/30 border border-[var(--data-error)] dark:border-[var(--data-error)] text-[var(--data-error)] dark:text-[var(--data-error)] rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}
      {loading && <TableSkeleton count={6} />}
      {!loading && filtered.length === 0 && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl py-16 text-center">
          <ShoppingBag className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-400 text-sm">No hay tiendas</p>
        </div>
      )}
      {!loading && filtered.length > 0 && (
        <SADataTable
          columns={STORE_COLUMNS}
          data={filtered}
          rowKey={(row) => row.id}
          emptyMessage="Sin resultados"
        />
      )}
    </div>
  );
}
