"use client";

import { useState, useEffect, useCallback } from "react";
import { ShoppingBag, Star, RefreshCw } from "lucide-react";
import { SADataTable } from "@/components/superadmin/_shared/SADataTable";
import { TableSkeleton } from "@/components/superadmin/_shared/SASkeleton";
import { PlanBadge } from "@/components/superadmin/_shared/SABadge";
import type { SAColumn } from "@/components/superadmin/_shared/SADataTable";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoreRow {
  id: string;
  slug: string;
  name: string;
  isPublished: boolean;
  rating: number;
  reviewCount: number;
  category: string;
  commission: number;
  createdAt: string;
  tenant: {
    id: string;
    slug: string;
    name: string;
    plan: string;
    active: boolean;
  };
  _count: { products: number };
}

// ─── Table columns ────────────────────────────────────────────────────────────

const COLUMNS: SAColumn<StoreRow>[] = [
  {
    key: "tenant",
    label: "Tienda (Tenant)",
    render: (row) => (
      <div>
        <div className="font-medium text-gray-900 dark:text-white text-sm">{row.tenant.name}</div>
        <div className="text-xs text-gray-400 font-mono mt-0.5">{row.tenant.slug}</div>
      </div>
    ),
  },
  {
    key: "name",
    label: "Store",
    render: (row) => (
      <div>
        <div className="text-sm text-gray-800 dark:text-gray-200">{row.name}</div>
        <div className="text-xs text-gray-400 font-mono mt-0.5">{row.slug}</div>
      </div>
    ),
  },
  {
    key: "plan",
    label: "Plan",
    render: (row) => <PlanBadge plan={row.tenant.plan as "free" | "pro" | "business" | "enterprise"} />,
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
        <span className={["w-1.5 h-1.5 rounded-full", row.isPublished ? "bg-green-500" : "bg-gray-400"].join(" ")} />
        {row.isPublished ? "Publicado" : "Borrador"}
      </span>
    ),
  },
  {
    key: "rating",
    label: "Rating",
    sortable: true,
    render: (row) => (
      <span className="inline-flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400 font-semibold">
        <Star className="w-3.5 h-3.5 fill-current" />
        {row.rating.toFixed(1)}
        <span className="text-gray-400 font-normal text-xs">({row.reviewCount})</span>
      </span>
    ),
  },
  {
    key: "products",
    label: "Productos",
    sortable: true,
    render: (row) => (
      <span className="text-sm text-gray-700 dark:text-gray-300 tabular-nums">
        {row._count.products}
      </span>
    ),
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StoresPage() {
  const [stores, setStores] = useState<StoreRow[] | undefined>(undefined);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setStores(undefined);
    else setRefreshing(true);
    setError("");
    try {
      const res = await fetch("/api/superadmin/stores", { credentials: "include" });
      if (!res.ok) { setError("Error al cargar tiendas"); return; }
      const data = await res.json() as { stores: StoreRow[] };
      setStores(data.stores);
    } catch {
      setError("Error de red");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const published = stores?.filter((s) => s.isPublished).length ?? 0;
  const total = stores?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Marketplace — Tiendas
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {stores === undefined
              ? "Cargando…"
              : `${total} tiendas registradas — ${published} publicadas`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing || stores === undefined}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={["w-3.5 h-3.5", refreshing ? "animate-spin" : ""].join(" ")} />
          Actualizar
        </button>
      </div>

      {/* Placeholder notice */}
      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
        <ShoppingBag className="w-4 h-4 shrink-0" />
        <span>
          <strong>Fase 4 (placeholder):</strong> Vista básica de tiendas del marketplace. La versión completa con métricas de ventas, comisiones y gestión avanzada llegará en la Fase 4.
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
          {error}
          <button type="button" onClick={() => void load()} className="underline hover:no-underline text-xs">
            Reintentar
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {stores === undefined && !error && <TableSkeleton count={6} />}

      {/* Empty state */}
      {stores !== undefined && stores.length === 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl py-20 text-center">
          <ShoppingBag className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-400 dark:text-gray-500 text-sm">No hay tiendas registradas</p>
        </div>
      )}

      {/* Table */}
      {stores !== undefined && stores.length > 0 && (
        <SADataTable
          columns={COLUMNS}
          data={stores}
          rowKey={(row) => row.id}
          emptyMessage="No hay tiendas registradas"
        />
      )}
    </div>
  );
}
