"use client";

import { useMemo, useState } from "react";
import {
  DollarSign,
  AlertTriangle,
  Users,
  Package,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { AdminCard } from "@/components/admin/shared";
import type {
  Payable,
  DashboardAlerts,
  Product,
  Sale,
} from "./types";

// ── Props ───────────────────────────────────────────────────────────────────────

export interface InventarioSubTabProps {
  loading: boolean;
  products: Product[];
  sales: Sale[];
  // High-impact cards
  upcomingPayables: { overdue: number; upcoming: Payable[] };
  productsRunningOut: { id: number | string; name: string; stock: number; daysLeft: number }[];
  clientesHoy: number;
  clientesAyer: number;
  clientesPromedio: number;
  alerts: DashboardAlerts;
  expiringBatchCount: number;
  hasAnyAlert: boolean;
  // Formatting
  fmtR: (n: number) => string;
}

// ── Component ────────────────────────────────────────────────────────────────────

export function InventarioSubTab(props: InventarioSubTabProps) {
  const [now] = useState(() => Date.now());
  const {
    loading, products, sales,
    upcomingPayables, productsRunningOut,
    clientesHoy, clientesAyer, clientesPromedio,
    fmtR,
  } = props;

  // ── Derived: Stock muerto ──────────────────────────────────────────────────

  const deadStockData = useMemo(() => {
    const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString();
    const deadStock = products.filter(p => {
      if (p.stock == null || p.stock <= 0) return false;
      const soldRecently = sales.some(s => {
        const items: Array<{ productId?: number | string }> = (s as unknown as { items: Array<{ productId?: number | string }> }).items ?? [];
        return items.some(i => String(i.productId) === String(p.id)) && s.createdAt >= thirtyDaysAgo;
      });
      return !soldRecently;
    });
    if (deadStock.length === 0) return null;
    const deadValue = deadStock.reduce((s, p) => s + (p.stock ?? 0) * (p.costPrice ?? p.price * 0.7), 0);
    return { count: deadStock.length, value: deadValue };
  }, [products, sales, now]);

  return (
    <>
      {/* High-impact cards row */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Proximos pagos */}
          <AdminCard padding="sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20">
                <DollarSign className="w-3.5 h-3.5 text-[var(--data-warning-500)]" />
              </span>
              <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-zinc-300">Pagos esta semana</span>
            </div>
            {upcomingPayables.overdue > 0 && (
              <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]">
                <AlertTriangle className="w-3 h-3 text-[var(--data-error-500)]" />
                <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{upcomingPayables.overdue} vencido{upcomingPayables.overdue !== 1 ? "s" : ""}</span>
              </div>
            )}
            {upcomingPayables.upcoming.length > 0 ? (
              <ul className="space-y-1.5">
                {upcomingPayables.upcoming.map(p => {
                  const daysLeft = p.dueDate ? Math.max(0, Math.ceil((new Date(p.dueDate).getTime() - now) / 86400000)) : 0;
                  return (
                    <li key={p.id} className="flex items-center justify-between text-xs">
                      <span className="truncate text-[var(--text-secondary)] dark:text-zinc-300 flex-1">{p.supplierName || "Proveedor"}</span>
                      <span className="font-bold text-[var(--text-primary)] dark:text-zinc-100 ml-2">{fmtR(p.amount - p.paidAmount)}</span>
                      <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] ml-1.5">{daysLeft}d</span>
                    </li>
                  );
                })}
              </ul>
            ) : upcomingPayables.overdue === 0 ? (
              <p className="text-xs text-[var(--data-success-500)] font-medium">Sin pagos pendientes esta semana</p>
            ) : null}
            <a href="/admin?module=compras" className="text-[length:var(--ts-2xs)] font-bold text-primary hover:underline mt-2 block">Ver todos &rarr;</a>
          </AdminCard>

          {/* Clientes del día */}
          <AdminCard padding="sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]">
                <Users className="w-3.5 h-3.5 text-[var(--data-success-500)]" />
              </span>
              <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-zinc-300">Clientes hoy</span>
            </div>
            <p className="text-2xl font-extrabold font-mono text-[var(--text-primary)] dark:text-zinc-100">{clientesHoy}</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Promedio: {clientesPromedio}/dia</p>
            <div className="flex items-center gap-1.5 mt-2">
              {clientesHoy > clientesAyer ? (
                <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] px-1.5 py-0.5 rounded-full">+{clientesHoy - clientesAyer} vs ayer</span>
              ) : clientesHoy < clientesAyer ? (
                <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/30 px-1.5 py-0.5 rounded-full">{clientesHoy - clientesAyer} vs ayer</span>
              ) : (
                <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] bg-gray-50 dark:bg-zinc-700 px-1.5 py-0.5 rounded-full">Igual que ayer</span>
              )}
            </div>
          </AdminCard>

          {/* Productos que se agotan */}
          <AdminCard padding="sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20">
                <Package className="w-3.5 h-3.5 text-[var(--data-error-500)]" />
              </span>
              <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-zinc-300">Se agotan esta semana</span>
            </div>
            {productsRunningOut.length > 0 ? (
              <ul className="space-y-1.5">
                {productsRunningOut.map(p => (
                  <li key={p.id} className="flex items-center justify-between text-xs">
                    <span className="truncate text-[var(--text-secondary)] dark:text-zinc-300 flex-1">{p.name}</span>
                    <span className="text-[var(--text-tertiary)] ml-1">quedan {p.stock}</span>
                    <span className={cn(
                      "text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-full ml-1.5",
                      p.daysLeft < 3 ? "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]" :
                      p.daysLeft <= 5 ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]" :
                      "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]"
                    )}>
                      {p.daysLeft}d
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--data-success-500)] font-medium">Stock estable para esta semana</p>
            )}
            {productsRunningOut.length > 0 && (
              <a href="/admin?module=compras" className="text-[length:var(--ts-2xs)] font-bold text-primary hover:underline mt-2 block">Crear OC &rarr;</a>
            )}
          </AdminCard>
        </div>
      )}

      {/* Stock muerto */}
      {!loading && deadStockData && (
        <AdminCard padding="sm">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-[var(--text-tertiary)]" />
            <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-zinc-300">Stock muerto</span>
            {deadStockData.value > 500 ? (
              <span className="text-[length:var(--ts-2xs)] font-bold bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)] px-1.5 py-0.5 rounded-full">Capital atrapado</span>
            ) : (
              <span className="text-[length:var(--ts-2xs)] font-bold bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)] px-1.5 py-0.5 rounded-full">Poco stock muerto</span>
            )}
          </div>
          <p className="text-lg font-bold font-mono text-[var(--text-primary)] dark:text-zinc-100">{fmtR(deadStockData.value)} <span className="text-xs font-normal text-[var(--text-tertiary)]">en {deadStockData.count} productos sin vender 30+ dias</span></p>
          <a href="/admin?module=inventario&sub=sin-movimiento" className="text-[length:var(--ts-2xs)] font-bold text-primary hover:underline mt-1.5 block">Ver productos &rarr;</a>
        </AdminCard>
      )}
    </>
  );
}
