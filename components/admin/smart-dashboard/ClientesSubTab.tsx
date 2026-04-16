"use client";

import { useState } from "react";
import {
  TrendingUp,
  Users,
  DollarSign,
  AlertTriangle,
  Package,
  ShoppingCart,
} from "lucide-react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { AdminCard } from "@/components/admin/shared";
import type {
  Order,
  Payable,
  TopCustomer,
  DashboardAlerts,
  SectionId,
  DashTabId,
  Sale,
} from "./types";

// ── Lazy sub-components ─────────────────────────────────────────────────────────

const BirthdayCard = dynamic(
  () => import("@/components/admin/smart-dashboard/BirthdayCard").then(m => ({ default: m.BirthdayCard })),
  { ssr: false }
);
const InactiveCustomersCard = dynamic(
  () => import("@/components/admin/smart-dashboard/InactiveCustomersCard").then(m => ({ default: m.InactiveCustomersCard })),
  { ssr: false }
);

// ── Alert Badge ─────────────────────────────────────────────────────────────────

type IconComponent = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

function AlertBadge({ Icon, label, count, colorClass }: { Icon: IconComponent; label: string; count: number; colorClass: string }) {
  if (count === 0) return null;
  return (
    <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium", colorClass)}>
      <Icon className="w-4 h-4 shrink-0" />
      <span>{label}</span>
      <span className="ml-auto font-bold tabular-nums">{count}</span>
    </div>
  );
}

// ── Props ───────────────────────────────────────────────────────────────────────

export interface ClientesSubTabProps {
  loading: boolean;
  orders: Order[];
  sales: Sale[];
  topCustomers: TopCustomer[];
  // High-impact cards
  upcomingPayables: { overdue: number; upcoming: Payable[] };
  productsRunningOut: { id: number | string; name: string; stock: number; daysLeft: number }[];
  clientesHoy: number;
  clientesAyer: number;
  clientesPromedio: number;
  alerts: DashboardAlerts;
  expiringBatchCount: number;
  hasAnyAlert: boolean;
  abandonedCartCount: number;
  abandonedCartValue: number;
  // Insights
  bestDay: { best: { name: string; avg: number }; worst: { name: string; avg: number } | null; pctVsOthers: number } | null;
  growingCategory: { top: { cat: string; thisWeek: number; lastWeek: number; pct: number } | null; bottom: { cat: string; pct: number } | null } | null;
  topClientMonth: { name: string; total: number; orderCount: number; avg: number; monthName: string } | null;
  // Section order
  sectionOrder: SectionId[];
  // Formatting
  fmtR: (n: number) => string;
}

// ── Component ────────────────────────────────────────────────────────────────────

export function ClientesSubTab(props: ClientesSubTabProps) {
  const [now] = useState(() => Date.now());
  const {
    loading, orders, sales, topCustomers,
    upcomingPayables, productsRunningOut,
    clientesHoy, clientesAyer, clientesPromedio,
    alerts, expiringBatchCount, hasAnyAlert,
    abandonedCartCount, abandonedCartValue,
    bestDay, growingCategory, topClientMonth,
    sectionOrder,
    fmtR,
  } = props;

  // Sections filtered for clientes tab
  const filteredSections = sectionOrder.filter(sid => {
    const tabMap: Record<string, DashTabId[]> = {
      "kpis": ["resumen", "ventas"],
      "margen-comparador": ["resumen", "finanzas"],
      "top-productos": ["ventas", "resumen"],
      "horario-pico": ["ventas", "resumen"],
      "clientes-alertas": ["clientes", "resumen"],
    };
    return (tabMap[sid] ?? ["resumen"]).includes("clientes");
  });

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
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">+{clientesHoy - clientesAyer} vs ayer</span>
              ) : clientesHoy < clientesAyer ? (
                <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full">{clientesHoy - clientesAyer} vs ayer</span>
              ) : (
                <span className="text-[10px] font-bold text-gray-400 bg-gray-50 dark:bg-zinc-700 px-1.5 py-0.5 rounded-full">Igual que ayer</span>
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
          </AdminCard>
        </div>
      )}

      {/* Reorderable sections for clientes tab (clientes-alertas) */}
      {filteredSections.map((sectionId) => (
        <div key={sectionId}>
          {sectionId === "clientes-alertas" && (
            <div className="space-y-6">
              {abandonedCartCount > 0 && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                      <ShoppingCart className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                        {abandonedCartCount} carrito{abandonedCartCount !== 1 ? "s" : ""} abandonado{abandonedCartCount !== 1 ? "s" : ""} hoy
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">{fmtR(abandonedCartValue)} en ventas potenciales</p>
                    </div>
                    <a href="/admin?module=notificaciones" className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-200/60 dark:bg-amber-800/40 hover:bg-amber-200 dark:hover:bg-amber-800/60 transition-colors">
                      Ver y contactar
                    </a>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Top 5 clientes */}
                <AdminCard padding="sm">
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="w-4 h-4" style={{ color: "var(--color-primary)" }} />
                    <span className="text-sm font-semibold text-gray-700 dark:text-zinc-300">Top 5 clientes del mes</span>
                  </div>
                  {loading ? (
                    <div className="space-y-3 animate-pulse">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-zinc-700 shrink-0" />
                          <div className="flex-1 h-3 rounded bg-gray-200 dark:bg-zinc-700" />
                          <div className="w-14 h-3 rounded bg-gray-200 dark:bg-zinc-700" />
                        </div>
                      ))}
                    </div>
                  ) : topCustomers.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-zinc-500">Sin pedidos este mes.</p>
                  ) : (
                    <ol className="space-y-2">
                      {topCustomers.map((c, idx) => (
                        <li key={c.phone ?? c.name} className="flex items-center gap-2 text-sm">
                          <span className="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 text-white" style={{ backgroundColor: idx === 0 ? "var(--color-primary)" : "#94a3b8" }}>
                            {idx + 1}
                          </span>
                          <span className="flex-1 truncate text-gray-700 dark:text-zinc-300 text-xs" title={c.name}>{c.name}</span>
                          <span className="text-[10px] text-gray-400 dark:text-zinc-500 shrink-0">{c.orderCount} ped.</span>
                          <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color: "var(--color-primary)" }}>{fmtR(c.total)}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </AdminCard>

                {/* Alertas activas */}
                <AdminCard padding="sm">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-semibold text-gray-700 dark:text-zinc-300">Alertas activas</span>
                  </div>
                  {loading ? (
                    <div className="space-y-2 animate-pulse">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-9 rounded-lg bg-gray-200 dark:bg-zinc-700" />
                      ))}
                    </div>
                  ) : !hasAnyAlert ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
                      <TrendingUp className="w-8 h-8 text-emerald-400 mx-auto" />
                      <p className="text-sm font-medium text-gray-600 dark:text-zinc-400">Todo bajo control</p>
                      <p className="text-xs text-gray-400 dark:text-zinc-500">No hay alertas pendientes</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <AlertBadge Icon={Package} label="Productos con stock bajo" count={alerts.lowStock} colorClass="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800" />
                      <AlertBadge Icon={AlertTriangle} label="Lotes por vencer (7 dias)" count={expiringBatchCount} colorClass="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800" />
                      <AlertBadge Icon={DollarSign} label="Fiados vencidos" count={alerts.overduePayables} colorClass="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800" />
                    </div>
                  )}
                </AdminCard>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Birthday */}
      <BirthdayCard />

      {/* Insights avanzados */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {bestDay && (
            <AdminCard padding="sm">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">Mejor dia de la semana</span>
              </div>
              <p className="text-sm font-bold text-gray-900 dark:text-zinc-100">Tu mejor dia es el {bestDay.best.name}</p>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                Promedio: {fmtR(bestDay.best.avg)} {bestDay.pctVsOthers > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-bold">(+{bestDay.pctVsOthers}% vs otros dias)</span>}
              </p>
              {bestDay.worst && (
                <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1.5">Peor dia: {bestDay.worst.name} -- {fmtR(bestDay.worst.avg)}</p>
              )}
            </AdminCard>
          )}
          {growingCategory?.top && (
            <AdminCard padding="sm">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">Categoria en crecimiento</span>
              </div>
              <p className="text-sm font-bold text-gray-900 dark:text-zinc-100">{growingCategory.top.cat} crecio {growingCategory.top.pct.toFixed(0)}% esta semana</p>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">De {fmtR(growingCategory.top.lastWeek)} a {fmtR(growingCategory.top.thisWeek)}</p>
              {growingCategory.bottom && (
                <p className="text-[10px] text-orange-500 dark:text-orange-400 mt-1.5 font-medium">{growingCategory.bottom.cat} bajo {Math.abs(growingCategory.bottom.pct).toFixed(0)}%</p>
              )}
            </AdminCard>
          )}
          {topClientMonth && (
            <AdminCard padding="sm">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">Cliente del mes</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold text-white" style={{ backgroundColor: "var(--color-primary)" }}>
                  {topClientMonth.name.charAt(0).toUpperCase()}
                </span>
                <p className="text-sm font-bold text-gray-900 dark:text-zinc-100">{topClientMonth.name}</p>
              </div>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
                {topClientMonth.orderCount} compras &middot; {fmtR(topClientMonth.total)} &middot; Ticket: {fmtR(topClientMonth.avg)}
              </p>
              <span className="inline-block text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full mt-1.5 capitalize">
                Cliente mas fiel de {topClientMonth.monthName}
              </span>
            </AdminCard>
          )}
        </div>
      )}

      {/* Clientes que no vuelven */}
      <InactiveCustomersCard orders={orders} sales={sales} loading={loading} />
    </>
  );
}
