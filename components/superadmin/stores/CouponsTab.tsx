"use client";

import { useState, useEffect, useCallback } from "react";
import { Ticket, TrendingUp, DollarSign, ToggleLeft, ToggleRight } from "@buleje/design-system/icons";
import { SADataTable } from "@/components/superadmin/_shared/SADataTable";
import { TableSkeleton } from "@/components/superadmin/_shared/SASkeleton";
import type { SAColumn } from "@/components/superadmin/_shared/SADataTable";
import { StatCard } from "./StatCard";
import type { MarketplaceCoupon } from "./types";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

function fmt(n: number) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);
}

const COUPON_COLUMNS: SAColumn<MarketplaceCoupon>[] = [
  {
    key: "code",
    label: "Código",
    render: (row) => <span className="text-sm font-mono font-bold text-primary">{row.code}</span>,
  },
  {
    key: "storeName",
    label: "Tienda",
    render: (row) => <span className="text-sm text-[var(--text-secondary)]">{row.storeName}</span>,
  },
  {
    key: "discount",
    label: "Descuento",
    render: (row) => (
      <span className="text-sm font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
        {row.discountType === "percent" ? `${row.discountValue}%` : fmt(row.discountValue)}
      </span>
    ),
  },
  {
    key: "usage",
    label: "Uso",
    render: (row) => (
      <span className="text-sm text-[var(--text-secondary)] tabular-nums">
        {row.usedCount} / {row.maxUses}
      </span>
    ),
  },
  {
    key: "active",
    label: "Estado",
    render: (row) => (
      <span
        className={`inline-flex items-center gap-1 text-xs font-semibold ${row.active ? "text-[var(--data-success-500)]" : "text-gray-400"}`}
      >
        {row.active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
        {row.active ? "Activo" : "Inactivo"}
      </span>
    ),
  },
  {
    key: "expiresAt",
    label: "Expira",
    render: (row) => (
      <span className="text-xs text-gray-400 tabular-nums">
        {row.expiresAt ? fmtDate(row.expiresAt) : "Sin fecha"}
      </span>
    ),
  },
];

export function CouponsTab() {
  const [coupons, setCoupons] = useState<MarketplaceCoupon[] | undefined>(undefined);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/superadmin/marketplace/coupons", { credentials: "include" });
      if (!res.ok) throw new Error("Error al cargar cupones");
      const data = await res.json();
      setCoupons(data.coupons ?? []);
    } catch {
      setError("Error al cargar cupones del marketplace");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = coupons?.filter((c) => c.active).length ?? 0;
  const totalUsed = coupons?.reduce((s, c) => s + c.usedCount, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          icon={<Ticket className="w-5 h-5" />}
          label="Total cupones"
          value={coupons?.length ?? 0}
          sub={`${activeCount} activos`}
          trend="up"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Veces usados"
          value={totalUsed}
          sub="Total redenciones"
        />
        <StatCard
          icon={<DollarSign className="w-5 h-5" />}
          label="Cupones bienvenida"
          value={coupons?.filter((c) => c.code.startsWith("BIENVENIDO")).length ?? 0}
          sub="Generados automáticamente"
        />
      </div>

      {error && (
        <div className="bg-[var(--data-error-50)] dark:bg-red-950/30 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] text-[var(--data-error-500)] rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}
      {coupons === undefined && !error && <TableSkeleton count={6} />}
      {coupons !== undefined && (
        <SADataTable
          columns={COUPON_COLUMNS}
          data={coupons}
          rowKey={(row) => row.id}
          emptyMessage="Sin cupones"
          renderMobileCard={(row) => {
            // Brandon 2026-05-21 fix mobile: card en lugar de tabla
            // squeezeada. Antes 3 cols (Código/Tienda/Descuento) en
            // 390px → "Pòlleria / El / Dorado" texto vertical roto.
            const discountText = row.discountType === "percent"
              ? `${row.discountValue}%`
              : fmt(row.discountValue);
            return (
              <div className="space-y-2.5">
                {/* Header: código + descuento prominente */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-mono font-bold text-[var(--text-primary)] break-all">
                      {row.code}
                    </div>
                    <div className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">
                      {row.storeName}
                    </div>
                  </div>
                  <div className="shrink-0 inline-flex items-center justify-center rounded-lg bg-[var(--data-success-500)]/10 px-3 py-1.5">
                    <span className="text-base font-extrabold text-[var(--data-success-500)] tabular-nums">
                      {discountText}
                    </span>
                  </div>
                </div>

                {/* Stats row: uso + estado + expira */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--rule-soft)] text-xs">
                  <span className="inline-flex items-center gap-1 text-[var(--text-secondary)] tabular-nums">
                    <span className="font-bold text-[var(--text-primary)]">{row.usedCount}</span>
                    <span className="text-[var(--text-tertiary)]">/ {row.maxUses}</span>
                    <span className="text-[var(--text-tertiary)]">usos</span>
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${
                      row.active ? "text-[var(--data-success-500)]" : "text-[var(--text-tertiary)]"
                    }`}
                  >
                    {row.active ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                    {row.active ? "Activo" : "Inactivo"}
                  </span>
                  <span className="text-[var(--text-tertiary)] tabular-nums shrink-0">
                    {row.expiresAt ? fmtDate(row.expiresAt) : "Sin fecha"}
                  </span>
                </div>
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
