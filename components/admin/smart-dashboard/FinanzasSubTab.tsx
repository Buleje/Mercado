"use client";

import { CardTitle } from "@buleje/design-system";
import { useState } from "react";
import {
  DollarSign,
  AlertTriangle,
  Users,
  Package,
  ArrowUp,
  ArrowDown,
  BarChart3,
} from "@buleje/design-system/icons";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { AdminCard } from "@/components/admin/shared";
import type {
  Payable,
  DashboardAlerts,
  SectionId,
  DashTabId,
} from "./types";

// ── Lazy sub-components ─────────────────────────────────────────────────────────

const RecentDocumentsFeed = dynamic(
  () => import("@/components/admin/smart-dashboard/RecentDocumentsFeed").then(m => ({ default: m.RecentDocumentsFeed })),
  { ssr: false }
);
const DeliveryZonesConfig = dynamic(
  () => import("@/components/admin/smart-dashboard/DeliveryZonesConfig").then(m => ({ default: m.DeliveryZonesConfig })),
  { ssr: false }
);

// ── Skeleton ─────────────────────────────────────────────────────────────────────

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-[var(--rule-base)] dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 animate-pulse", className)}>
      <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-zinc-700 mb-3" />
      <div className="h-7 w-1/2 rounded bg-gray-200 dark:bg-zinc-700 mb-2" />
      <div className="h-1 w-full rounded bg-gray-200 dark:bg-zinc-700 mt-3" />
    </div>
  );
}

// ── Props ───────────────────────────────────────────────────────────────────────

export interface FinanzasSubTabProps {
  loading: boolean;
  // Financial data
  cuentasPorCobrar: { total: number; vigentes: number; vencidas: number; count: number; vigentesCount: number; vencidasCount: number };
  cuentasPorPagar: { total: number; vigentes: number; vencidas: number; count: number };
  igvVentasMes: number;
  devoluciones: number;
  revenueThisMonth: number;
  revenuePrevMonth: number;
  monthDelta: number;
  // High-impact cards
  upcomingPayables: { overdue: number; upcoming: Payable[] };
  productsRunningOut: { id: number | string; name: string; stock: number; daysLeft: number }[];
  clientesHoy: number;
  clientesAyer: number;
  clientesPromedio: number;
  alerts: DashboardAlerts;
  expiringBatchCount: number;
  hasAnyAlert: boolean;
  // Section order
  sectionOrder: SectionId[];
  // Formatting
  fmtR: (n: number) => string;
  fmtShortR: (n: number) => string;
}

// ── Component ────────────────────────────────────────────────────────────────────

export function FinanzasSubTab(props: FinanzasSubTabProps) {
  const [now] = useState(() => Date.now());
  const {
    loading,
    cuentasPorCobrar, cuentasPorPagar, igvVentasMes, devoluciones,
    revenueThisMonth, revenuePrevMonth, monthDelta,
    upcomingPayables, productsRunningOut,
    clientesHoy, clientesAyer, clientesPromedio,
    sectionOrder,
    fmtR, fmtShortR,
  } = props;

  // Sections filtered for finanzas tab
  const filteredSections = sectionOrder.filter(sid => {
    const tabMap: Record<string, DashTabId[]> = {
      "kpis": ["resumen", "ventas"],
      "margen-comparador": ["resumen", "finanzas"],
      "top-productos": ["ventas", "resumen"],
      "horario-pico": ["ventas", "resumen"],
      "clientes-alertas": ["clientes", "resumen"],
    };
    return (tabMap[sid] ?? ["resumen"]).includes("finanzas");
  });

  return (
    <>
      {/* Financial cards — AdminCard tokens */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Pagos pendientes */}
          <AdminCard padding="lg">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-[var(--data-error)]" />
              <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">Pagos pendientes</CardTitle>
            </div>
            <p className="text-xs uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Mes actual</p>
            <p className="text-3xl font-semibold text-[var(--text-primary)] mt-3 tabular-nums">
              {fmtR(cuentasPorPagar.total)}
            </p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-2">{cuentasPorPagar.count} documentos</p>
          </AdminCard>

          {/* Cobros pendientes */}
          <AdminCard padding="lg">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-[var(--data-success)]" />
              <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">Cobros pendientes</CardTitle>
            </div>
            <p className="text-xs uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Mes actual</p>
            <p className="text-3xl font-semibold text-[var(--text-primary)] mt-3 tabular-nums">
              {fmtR(cuentasPorCobrar.total)}
            </p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-2">{cuentasPorCobrar.count} documentos</p>
          </AdminCard>

          {/* Entradas y salidas */}
          <AdminCard padding="lg">
            <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">Entradas y salidas</CardTitle>
            <p className="text-xs uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-4">Mes actual</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--data-success)]" />
                  <span className="text-sm text-[var(--text-secondary)]">Entradas</span>
                </div>
                <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{fmtR(revenueThisMonth)}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--data-error)]" />
                  <span className="text-sm text-[var(--text-secondary)]">Salidas</span>
                </div>
                <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{fmtR(igvVentasMes + devoluciones)}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-[var(--rule-soft)]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--data-success)]" />
                  <span className="text-sm text-[var(--text-secondary)]">Saldo</span>
                </div>
                <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{fmtR(revenueThisMonth - igvVentasMes - devoluciones)}</span>
              </div>
            </div>
          </AdminCard>
        </div>
      )}

      {/* High-impact cards row */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Proximos pagos */}
          <AdminCard padding="sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--data-warning-50)] dark:bg-[var(--data-warning)]/20">
                <DollarSign className="w-3.5 h-3.5 text-[var(--data-warning)]" />
              </span>
              <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-zinc-300">Pagos esta semana</span>
            </div>
            {upcomingPayables.overdue > 0 && (
              <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg bg-[var(--data-error-50)] dark:bg-[var(--data-error)]/20 border border-[var(--data-error)] dark:border-[var(--data-error)]">
                <AlertTriangle className="w-3 h-3 text-[var(--data-error)]" />
                <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-error)] dark:text-[var(--data-error)]">{upcomingPayables.overdue} vencido{upcomingPayables.overdue !== 1 ? "s" : ""}</span>
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
              <p className="text-xs text-[var(--data-success)] font-medium">Sin pagos pendientes esta semana</p>
            ) : null}
            <a href="/admin?module=compras" className="text-[length:var(--ts-2xs)] font-bold text-primary hover:underline mt-2 block">Ver todos &rarr;</a>
          </AdminCard>

          {/* Clientes del dia */}
          <AdminCard padding="sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]">
                <Users className="w-3.5 h-3.5 text-[var(--data-success)]" />
              </span>
              <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-zinc-300">Clientes hoy</span>
            </div>
            <p className="text-2xl font-extrabold font-mono text-[var(--text-primary)] dark:text-zinc-100">{clientesHoy}</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Promedio: {clientesPromedio}/dia</p>
            <div className="flex items-center gap-1.5 mt-2">
              {clientesHoy > clientesAyer ? (
                <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] px-1.5 py-0.5 rounded-full">+{clientesHoy - clientesAyer} vs ayer</span>
              ) : clientesHoy < clientesAyer ? (
                <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-error)] bg-[var(--data-error-50)] dark:bg-[var(--data-error)]/30 px-1.5 py-0.5 rounded-full">{clientesHoy - clientesAyer} vs ayer</span>
              ) : (
                <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] bg-gray-50 dark:bg-zinc-700 px-1.5 py-0.5 rounded-full">Igual que ayer</span>
              )}
            </div>
          </AdminCard>

          {/* Productos que se agotan */}
          <AdminCard padding="sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--data-error-50)] dark:bg-[var(--data-error)]/20">
                <Package className="w-3.5 h-3.5 text-[var(--data-error)]" />
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
                      p.daysLeft < 3 ? "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/30 dark:text-[var(--data-error)]" :
                      p.daysLeft <= 5 ? "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)]" :
                      "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)]"
                    )}>
                      {p.daysLeft}d
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--data-success)] font-medium">Stock estable para esta semana</p>
            )}
            {productsRunningOut.length > 0 && (
              <a href="/admin?module=compras" className="text-[length:var(--ts-2xs)] font-bold text-primary hover:underline mt-2 block">Crear OC &rarr;</a>
            )}
          </AdminCard>
        </div>
      )}

      {/* Reorderable sections for finanzas tab (margen-comparador) */}
      {filteredSections.map((sectionId) => (
        <div key={sectionId}>
          {sectionId === "margen-comparador" && (loading ? (
            <SkeletonCard />
          ) : (
            <AdminCard padding="sm">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-[var(--text-tertiary)]" />
                <span className="text-xs font-semibold text-[var(--text-tertiary)]">Este mes vs anterior</span>
              </div>
              <div className="flex items-end gap-3">
                <div>
                  <p className="text-2xl font-bold font-mono text-[var(--text-primary)] dark:text-zinc-100">{fmtR(revenueThisMonth)}</p>
                  <p className="text-xs text-[var(--text-tertiary)] dark:text-zinc-500">mes actual</p>
                </div>
                <div className={cn("flex items-center gap-1 text-sm font-semibold pb-1", monthDelta >= 0 ? "text-[var(--data-success)] dark:text-[var(--data-success)]" : "text-[var(--data-error)] dark:text-[var(--data-error)]")}>
                  {monthDelta >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                  {Math.abs(monthDelta).toFixed(1)}%
                </div>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] dark:text-zinc-500 mt-1">
                Mes anterior: <span className="font-medium text-[var(--text-secondary)] dark:text-zinc-400">{fmtR(revenuePrevMonth)}</span>
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { label: "Este mes", value: revenueThisMonth, color: "var(--color-primary)", max: Math.max(revenueThisMonth, revenuePrevMonth, 1) },
                  { label: "Anterior", value: revenuePrevMonth, color: "#94a3b8", max: Math.max(revenueThisMonth, revenuePrevMonth, 1) },
                ].map((bar) => (
                  <div key={bar.label}>
                    <div className="flex justify-between text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-zinc-500 mb-1">
                      <span>{bar.label}</span>
                      <span>{fmtR(bar.value)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-zinc-700">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (bar.value / bar.max) * 100)}%`, backgroundColor: bar.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </AdminCard>
          ))}
        </div>
      ))}

      {/* Ultimos documentos */}
      <RecentDocumentsFeed />

      {/* Delivery Zones */}
      <DeliveryZonesConfig />
    </>
  );
}
