"use client";

import { useState } from "react";
import {
  DollarSign,
  AlertTriangle,
  Users,
  Package,
  ArrowUp,
  ArrowDown,
  BarChart3,
} from "lucide-react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
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
    <div className={cn("rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 animate-pulse", className)}>
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
      {/* Financial cards */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Card 1: Cuentas por cobrar (Fiados) */}
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 p-4 shadow-sm">
            <a href="/admin?module=fiados" className="text-xs font-semibold text-gray-700 dark:text-zinc-300 hover:text-primary transition-colors cursor-pointer">
              Cuentas por cobrar
            </a>
            <p className="text-xl font-mono font-bold text-gray-900 dark:text-zinc-100 mt-1">{fmtR(cuentasPorCobrar.total)}</p>
            <div className="flex items-center gap-2 mt-2 text-[10px]">
              <span className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                <span className="text-gray-500 dark:text-zinc-400">Vigentes {fmtShortR(cuentasPorCobrar.vigentes)}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px]">
              <span className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                <span className="text-gray-500 dark:text-zinc-400">Vencidas {fmtShortR(cuentasPorCobrar.vencidas)}</span>
              </span>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1">{cuentasPorCobrar.count} documentos</p>
          </div>

          {/* Card 2: Cuentas por pagar */}
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 p-4 shadow-sm">
            <a href="/admin?module=compras" className="text-xs font-semibold text-gray-700 dark:text-zinc-300 hover:text-primary transition-colors cursor-pointer">
              Cuentas por pagar
            </a>
            <p className="text-xl font-mono font-bold text-gray-900 dark:text-zinc-100 mt-1">{fmtR(cuentasPorPagar.total)}</p>
            <div className="flex items-center gap-2 mt-2 text-[10px]">
              <span className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                <span className="text-gray-500 dark:text-zinc-400">Vigentes {fmtShortR(cuentasPorPagar.vigentes)}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px]">
              <span className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                <span className="text-gray-500 dark:text-zinc-400">Vencidas {fmtShortR(cuentasPorPagar.vencidas)}</span>
              </span>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1">{cuentasPorPagar.count} documentos</p>
          </div>

          {/* Card 3: Impuestos en venta */}
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 p-4 shadow-sm">
            <span className="text-xs font-semibold text-gray-700 dark:text-zinc-300">Impuestos en venta</span>
            <p className="text-xl font-mono font-bold text-gray-900 dark:text-zinc-100 mt-1">{fmtR(igvVentasMes)}</p>
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-2">IGV estimado del mes</p>
          </div>

          {/* Card 4: Devoluciones de clientes */}
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 p-4 shadow-sm">
            <span className="text-xs font-semibold text-gray-700 dark:text-zinc-300">Devoluciones</span>
            <p className={cn("text-xl font-mono font-bold mt-1", devoluciones > 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-zinc-100")}>
              {fmtR(devoluciones)}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-2">Incluye impuestos</p>
          </div>
        </div>
      )}

      {/* High-impact cards row */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Proximos pagos */}
          <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                <DollarSign className="w-3.5 h-3.5 text-amber-500" />
              </span>
              <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">Pagos esta semana</span>
            </div>
            {upcomingPayables.overdue > 0 && (
              <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <AlertTriangle className="w-3 h-3 text-red-500" />
                <span className="text-[10px] font-bold text-red-600 dark:text-red-400">{upcomingPayables.overdue} vencido{upcomingPayables.overdue !== 1 ? "s" : ""}</span>
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
                      <span className="text-[10px] text-gray-400 ml-1.5">{daysLeft}d</span>
                    </li>
                  );
                })}
              </ul>
            ) : upcomingPayables.overdue === 0 ? (
              <p className="text-xs text-emerald-500 font-medium">Sin pagos pendientes esta semana</p>
            ) : null}
            <a href="/admin?module=compras" className="text-[10px] font-bold text-primary hover:underline mt-2 block">Ver todos &rarr;</a>
          </div>

          {/* Clientes del dia */}
          <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <Users className="w-3.5 h-3.5 text-blue-500" />
              </span>
              <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">Clientes hoy</span>
            </div>
            <p className="text-2xl font-extrabold font-mono text-gray-900 dark:text-zinc-100">{clientesHoy}</p>
            <p className="text-xs text-gray-400 mt-0.5">Promedio: {clientesPromedio}/dia</p>
            <div className="flex items-center gap-1.5 mt-2">
              {clientesHoy > clientesAyer ? (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">+{clientesHoy - clientesAyer} vs ayer</span>
              ) : clientesHoy < clientesAyer ? (
                <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full">{clientesHoy - clientesAyer} vs ayer</span>
              ) : (
                <span className="text-[10px] font-bold text-gray-400 bg-gray-50 dark:bg-zinc-700 px-1.5 py-0.5 rounded-full">Igual que ayer</span>
              )}
            </div>
          </div>

          {/* Productos que se agotan */}
          <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
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
                      "text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1.5",
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
              <a href="/admin?module=compras" className="text-[10px] font-bold text-primary hover:underline mt-2 block">Crear OC &rarr;</a>
            )}
          </div>
        </div>
      )}

      {/* Reorderable sections for finanzas tab (margen-comparador) */}
      {filteredSections.map((sectionId) => (
        <div key={sectionId}>
          {sectionId === "margen-comparador" && (loading ? (
            <SkeletonCard />
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4" style={{ color: "#f97316" }} />
                <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Este mes vs anterior</span>
              </div>
              <div className="flex items-end gap-3">
                <div>
                  <p className="text-2xl font-bold font-mono text-gray-900 dark:text-zinc-100">{fmtR(revenueThisMonth)}</p>
                  <p className="text-xs text-gray-400 dark:text-zinc-500">mes actual</p>
                </div>
                <div className={cn("flex items-center gap-1 text-sm font-semibold pb-1", monthDelta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                  {monthDelta >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                  {Math.abs(monthDelta).toFixed(1)}%
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
                Mes anterior: <span className="font-medium text-gray-600 dark:text-zinc-400">{fmtR(revenuePrevMonth)}</span>
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { label: "Este mes", value: revenueThisMonth, color: "var(--color-primary)", max: Math.max(revenueThisMonth, revenuePrevMonth, 1) },
                  { label: "Anterior", value: revenuePrevMonth, color: "#94a3b8", max: Math.max(revenueThisMonth, revenuePrevMonth, 1) },
                ].map((bar) => (
                  <div key={bar.label}>
                    <div className="flex justify-between text-[10px] text-gray-400 dark:text-zinc-500 mb-1">
                      <span>{bar.label}</span>
                      <span>{fmtR(bar.value)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-zinc-700">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (bar.value / bar.max) * 100)}%`, backgroundColor: bar.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
