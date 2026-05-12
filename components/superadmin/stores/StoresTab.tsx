"use client";

import { useCallback, useMemo, useState } from "react";
import { ShoppingBag, Package, Star, DollarSign, Search, RefreshCw, Eye, EyeOff, Loader2 } from "@buleje/design-system/icons";
import { SADataTable } from "@/components/superadmin/_shared/SADataTable";
import { TableSkeleton } from "@/components/superadmin/_shared/SASkeleton";
import { PlanBadge } from "@/components/superadmin/_shared/SABadge";
import type { SAColumn } from "@/components/superadmin/_shared/SADataTable";
import { StatCard } from "./StatCard";
import type { StoreRow } from "./types";
import { csrfHeaders } from "@/lib/csrf-client";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

function buildColumns(
  togglingId: string | null,
  onTogglePublish: (row: StoreRow) => void,
): SAColumn<StoreRow>[] {
  return [
  {
    key: "tenant",
    label: "Tienda (Tenant)",
    render: (row) => (
      <div>
        <div className="font-medium text-[var(--text-primary)] text-sm">{row.tenant.name}</div>
        <div className="text-xs text-[var(--text-tertiary)] font-mono mt-0.5">{row.tenant.slug}</div>
      </div>
    ),
  },
  {
    key: "name",
    label: "Store",
    render: (row) => (
      <div>
        <div className="text-sm text-[var(--text-primary)]">{row.name}</div>
        <div className="text-xs text-[var(--text-tertiary)] font-mono mt-0.5">{row.slug}</div>
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
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider",
          row.isPublished
            ? "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 text-[var(--data-success-500)]"
            : "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)]",
        ].join(" ")}
      >
        <span
          className={[
            "h-1 w-1 rounded-full",
            row.isPublished ? "bg-[var(--data-success-500)]" : "bg-[var(--text-tertiary)]",
          ].join(" ")}
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
      <span className="inline-flex items-center gap-1 text-sm text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-semibold">
        <Star className="w-3.5 h-3.5 fill-current" />
        {Number(row.rating).toFixed(1)}
        <span className="text-[var(--text-tertiary)] font-normal text-xs">({row.reviewCount})</span>
      </span>
    ),
  },
  {
    key: "commission",
    label: "Comisión",
    sortable: true,
    render: (row) => (
      <span className="text-sm font-bold text-[var(--accent)] tabular-nums">{row.commission}%</span>
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
      <span className="text-xs text-[var(--text-tertiary)] tabular-nums">{fmtDate(row.createdAt)}</span>
    ),
  },
  {
    key: "actions",
    label: "Acción",
    render: (row) => {
      const busy = togglingId === row.id;
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!busy) onTogglePublish(row);
          }}
          disabled={busy}
          className={[
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors disabled:opacity-50",
            row.isPublished
              ? "border-rose-200 bg-rose-50 text-[var(--data-error-500)] hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-[var(--data-error-500)]"
              : "border-emerald-200 bg-emerald-50 text-[var(--data-success-700)] hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300",
          ].join(" ")}
          title={row.isPublished ? "Ocultar del marketplace" : "Publicar en marketplace"}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : row.isPublished ? (
            <>
              <EyeOff className="h-3.5 w-3.5" /> Ocultar
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5" /> Publicar
            </>
          )}
        </button>
      );
    },
  },
  ];
}

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
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleTogglePublish = useCallback(async (row: StoreRow) => {
    setTogglingId(row.id);
    try {
      const res = await fetch("/api/superadmin/stores", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ storeId: row.id, isPublished: !row.isPublished }),
      });
      if (res.ok) {
        // Refresh la lista para reflejar el nuevo estado.
        onRefresh();
      }
    } catch {
      // silent
    } finally {
      setTogglingId(null);
    }
  }, [onRefresh]);

  const columns = useMemo(
    () => buildColumns(togglingId, handleTogglePublish),
    [togglingId, handleTogglePublish],
  );

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

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, tienda o slug…"
            className="w-full rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          />
        </div>
        <div className="flex gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
          {(["all", "published", "draft"] as const).map((f) => {
            const isActive = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`inline-flex items-center rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                  isActive
                    ? "bg-[var(--surface-raised)] text-[var(--accent)] shadow-sm"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {f === "all" ? "Todas" : f === "published" ? "Publicadas" : "Borradores"}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing || loading}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-40"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            strokeWidth={2.25}
          />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-300/60 bg-rose-50/40 px-4 py-3 text-sm font-semibold text-[var(--accent)] dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-[var(--accent)]">
          {error}
        </div>
      )}
      {loading && <TableSkeleton count={6} />}
      {!loading && filtered.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] py-16 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] mb-3">
            <ShoppingBag
              className="h-6 w-6 text-[var(--text-tertiary)]"
              strokeWidth={1.75}
              aria-hidden
            />
          </div>
          <p className="font-display text-base font-extrabold text-[var(--text-primary)]">
            No hay tiendas que mostrar
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Probá cambiar el filtro o el término de búsqueda.
          </p>
        </div>
      )}
      {!loading && filtered.length > 0 && (
        <SADataTable
          columns={columns}
          data={filtered}
          rowKey={(row) => row.id}
          emptyMessage="Sin resultados"
        />
      )}
    </div>
  );
}
