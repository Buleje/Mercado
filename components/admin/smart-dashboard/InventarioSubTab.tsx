"use client";

import { useMemo, useState } from "react";
import {
  DollarSign,
  AlertTriangle,
  Users,
  Package,
} from "lucide-react";
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
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                <DollarSign className="w-3.5 h-3.5 text-amber-500" />
              </span>
              <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">Pagos esta semana</span>
            </div>
            {upcomingPayables.overdue > 0 && (
              <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <AlertTriangle className="w-3 h-3 text-red-500" />
                <span className="text-[length:var(--ts-2xs)] font-bold text-red-600 dark:text-red-400">{upcomingPayables.overdue} vencido{upcomingPayables.overdue !== 1 ? "s" : ""}</span>
              </div>
            )}
            {upcomingPayables.upcoming.length > 0 ? (
              <ul className="space-y-1.5">
                {upcomingPayables.upcoming.map(p => {
                  const daysLeft = p.dueDate ? Math.max(0, Math.ceil((new Date(p.dueDate).getTime() - now) / 86400000)) : 0;
                  return (
                    <li key={p.id} className="flex items-center justify-between text-xs">
                      <span className="truncate text-gray-600 dark:text-zinc-300 flex-1">{p.supplierName || "Proveedor"}</span>
                      <span className="font-bold text-gray-900 dark:text-zinc-100 ml-2">{fmtR(p.amount - p.paidAmount)}</span>
                      <span className="text-[length:var(--ts-2xs)] text-gray-400 ml-1.5">{daysLeft}d</span>
                    </li>
                  );
                })}
              </ul>
            ) : upcomingPayables.overdue === 0 ? (
              <p className="text-xs text-emerald-500 font-medium">Sin pagos pendientes esta semana</p>
            ) : null}
            <a href="/admin?module=compras" className="text-[length:var(--ts-2xs)] font-bold text-primary hover:underline mt-2 block">Ver todos &rarr;</a>
          </AdminCard>

          {/* Clientes del dia */}
          <AdminCard padding="sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                <Users className="w-3.5 h-3.5 text-emerald-500" />
              </span>
              <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">Clientes hoy</span>
            </div>
            <p className="text-2xl font-extrabold font-mono text-gray-900 dark:text-zinc-100">{clientesHoy}</p>
            <p className="text-xs text-gray-400 mt-0.5">Promedio: {clientesPromedio}/dia</p>
            <div className="flex items-center gap-1.5 mt-2">
              {clientesHoy > clientesAyer ? (
                <span className="text-[length:var(--ts-2xs)] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">+{clientesHoy - clientesAyer} vs ayer</span>
              ) : clientesHoy < clientesAyer ? (
                <span className="text-[length:var(--ts-2xs)] font-bold text-red-500 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full">{clientesHoy - clientesAyer} vs ayer</span>
              ) : (
                <span className="text-[length:var(--ts-2xs)] font-bold text-gray-400 bg-gray-50 dark:bg-zinc-700 px-1.5 py-0.5 rounded-full">Igual que ayer</span>
              )}
            </div>
          </AdminCard>

          {/* Productos que se agotan */}
          <AdminCard padding="sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-red-50 dark:bg-red-900/20">
                <Package className="w-3.5 h-3.5 text-red-500" />
              </span>
              <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">Se agotan esta semana</span>
            </div>
            {productsRunningOut.length > 0 ? (
              <ul className="space-y-1.5">
                {productsRunningOut.map(p => (
                  <li key={p.id} className="flex items-center justify-between text-xs">
                    <span className="truncate text-gray-600 dark:text-zinc-300 flex-1">{p.name}</span>
                    <span className="text-gray-400 ml-1">quedan {p.stock}</span>
                    <span className={cn(
                      "text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-full ml-1.5",
                      p.daysLeft < 3 ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" :
                      p.daysLeft <= 5 ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" :
                      "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                    )}>
                      {p.daysLeft}d
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-emerald-500 font-medium">Stock estable para esta semana</p>
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
            <Package className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">Stock muerto</span>
            {deadStockData.value > 500 ? (
              <span className="text-[length:var(--ts-2xs)] font-bold bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded-full">Capital atrapado</span>
            ) : (
              <span className="text-[length:var(--ts-2xs)] font-bold bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">Poco stock muerto</span>
            )}
          </div>
          <p className="text-lg font-bold font-mono text-gray-900 dark:text-zinc-100">{fmtR(deadStockData.value)} <span className="text-xs font-normal text-gray-400">en {deadStockData.count} productos sin vender 30+ dias</span></p>
          <a href="/admin?module=inventario&sub=sin-movimiento" className="text-[length:var(--ts-2xs)] font-bold text-primary hover:underline mt-1.5 block">Ver productos &rarr;</a>
        </AdminCard>
      )}
    </>
  );
}
