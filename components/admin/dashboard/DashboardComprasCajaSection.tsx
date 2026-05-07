"use client";
import { CardTitle, StatCard } from "@buleje/design-system";
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  DollarSign, TrendingUp, AlertCircle, CreditCard, Banknote, Truck, Star, BarChart3,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import AdminCard from "@/components/admin/shared/AdminCard";
import StatusBadge from "@/components/admin/shared/StatusBadge";
function fmt(n: number) { return `S/${n.toFixed(2)}`; }
function fmtDateFull(iso: string) { try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; } }

// FlowRow helper — semantic intent via tokens
function FlowRow({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "success" | "danger" | "warning" | "neutral" }) {
  const toneColor = {
    success: "text-[var(--data-success-500)]",
    danger: "text-[var(--data-error-500)]",
    warning: "text-[var(--data-warning-500)]",
    neutral: "text-[var(--text-secondary)]",
  }[tone];
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[var(--text-secondary)]">{label}</span>
      <span className={cn("text-xs font-semibold", toneColor)}>{value}</span>
    </div>
  );
}

// Section header unificado — kicker + subtitle, sin chips decorativos de color
function SectionHeader({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[var(--rule-soft)]">
      <div className="flex flex-col">
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          {kicker}
        </span>
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] leading-none mt-0.5">
          {title}
        </CardTitle>
      </div>
    </div>
  );
}

function SubCard({ title, icon: Icon, children, action }: { title: string; icon: React.ComponentType<{className?:string}>; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <AdminCard padding="md">
      <div className="flex items-center justify-between mb-4">
        <CardTitle className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          <Icon className="h-3 w-3 text-[var(--text-tertiary)]" />{title}
        </CardTitle>
        {action}
      </div>
      {children}
    </AdminCard>
  );
}

function Empty({ text = "Sin datos en este periodo" }: { text?: string }) {
  return <div className="py-8 text-center text-xs text-[var(--text-tertiary)]">{text}</div>;
}

export default function DashboardComprasCajaSection({ st, expandAll, section }: any) {
  return (
    <>
      {(expandAll || section === "compras") && (
        <div className={cn("space-y-4", expandAll && "rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4")}>
          {expandAll && <SectionHeader kicker="Seccion" title="Compras" />}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Compras" value={fmt(st.totalPurch)} icon={Truck} />
            <StatCard label="Proveedores" value={String(st.totalSuppliers)} icon={Truck} />
            <StatCard label="Deuda Pend." value={fmt(st.debt)} icon={Banknote} emphasis={st.debt > 0 ? "error" : "neutral"} />
            <StatCard label="Ctas. Vencidas" value={String(st.overdue.length)} icon={AlertCircle} emphasis={st.overdue.length > 0 ? "error" : "neutral"} />
          </div>

          {st.supPurchases.length > 0 && (
            <SubCard title="Compras por proveedor" icon={Truck}>
              <div className="space-y-3">
                {st.supPurchases.map((s: any) => {
                  const mx = st.supPurchases[0]?.total ?? 1;
                  return (
                    <div key={s.name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[var(--text-secondary)] truncate">{s.name}</span>
                        <span className="font-semibold text-[var(--text-primary)] ml-2">{fmt(s.total)}</span>
                      </div>
                      <div className="h-1.5 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(s.total / mx) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </SubCard>
          )}

          {st.pending.length > 0 && (
            <SubCard title="Cuentas por pagar" icon={Banknote}>
              <div className="overflow-x-auto -mx-4">
                <table className="w-full min-w-[600px] text-xs">
                  <thead>
                    <tr className="text-[var(--text-tertiary)] font-medium border-b border-[var(--rule-soft)]">
                      <th className="text-left px-2 sm:px-4 py-2">Proveedor</th>
                      <th className="text-right px-2 sm:px-4 py-2">Monto</th>
                      <th className="text-right px-2 sm:px-4 py-2">Pagado</th>
                      <th className="text-right px-2 sm:px-4 py-2">Pend.</th>
                      <th className="text-left px-2 sm:px-4 py-2">Vence</th>
                      <th className="text-left px-2 sm:px-4 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {st.pending.map((p: any) => {
                      const rem = p.amount - p.paidAmount;
                      const over = new Date(p.dueDate) < new Date();
                      const badgeVariant: "error" | "warning" | "neutral" = over
                        ? "error"
                        : p.status === "parcial"
                          ? "warning"
                          : "neutral";
                      const badgeLabel = over ? "Vencido" : p.status === "parcial" ? "Parcial" : "Pendiente";
                      return (
                        <tr
                          key={p.id}
                          className={cn(
                            "border-b border-[var(--rule-soft)] last:border-0",
                            over && "bg-[color-mix(in_oklch,var(--data-error)_6%,transparent)]",
                          )}
                        >
                          <td className="px-2 sm:px-4 py-2 font-medium text-[var(--text-primary)]">{p.supplierName}</td>
                          <td className="px-2 sm:px-4 py-2 text-right text-[var(--text-secondary)]">{fmt(p.amount)}</td>
                          <td className="px-2 sm:px-4 py-2 text-right text-[var(--data-success-500)] font-medium">{fmt(p.paidAmount)}</td>
                          <td className="px-2 sm:px-4 py-2 text-right text-[var(--data-error-500)] font-medium">{fmt(rem)}</td>
                          <td className="px-2 sm:px-4 py-2 text-[var(--text-secondary)]">{fmtDateFull(p.dueDate)}</td>
                          <td className="px-2 sm:px-4 py-2">
                            <StatusBadge variant={badgeVariant} label={badgeLabel} size="sm" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SubCard>
          )}
        </div>
      )}

      {(expandAll || section === "caja") && (
        <div className={cn("space-y-4", expandAll && "rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4")}>
          {expandAll && <SectionHeader kicker="Seccion" title="Caja" />}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Ingresos" value={fmt(st.ventas)} icon={DollarSign} delta={st.dVentas} />
            <StatCard label="Egresos" value={fmt(st.totalPurch)} icon={TrendingUp} />
            <StatCard label="Balance" value={fmt(st.ventas - st.totalPurch)} icon={Banknote} emphasis={st.ventas - st.totalPurch >= 0 ? "neutral" : "error"} />
            <StatCard label="Ganancia Neta" value={fmt(st.utilidad)} icon={Star} delta={st.dUtilidad} emphasis={st.utilidad >= 0 ? "neutral" : "error"} />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <SubCard title="Desglose de pagos" icon={CreditCard}>
              {st.payments.length === 0 ? (
                <Empty />
              ) : (
                <div className="space-y-3">
                  {st.payments.map((p: any) => (
                    <div key={p.method} className="flex items-center justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* NOTA: p.color es dato del dominio (payment method branding) — se permite */}
                        <div className="w-3 h-3 rounded-full" style={{ background: p.color }} />
                        <span className="text-xs text-[var(--text-secondary)]">{p.label}</span>
                      </div>
                      <span className="text-xs font-semibold text-[var(--text-primary)]">{fmt(p.total)}</span>
                    </div>
                  ))}
                  <div className="border-t border-[var(--rule-soft)] pt-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--text-secondary)]">Total</span>
                    <span className="text-sm font-bold text-[var(--text-primary)]">{fmt(st.payTotal)}</span>
                  </div>
                </div>
              )}
            </SubCard>

            <SubCard title="Flujo del periodo" icon={BarChart3}>
              <div className="space-y-3">
                <FlowRow label="Ventas netas" value={fmt(st.ventas)} tone="success" />
                <FlowRow label="Costo estimado" value={fmt(st.ventas - st.utilidad)} tone="neutral" />
                <FlowRow label="Utilidad bruta" value={fmt(st.utilidad)} tone="success" />
                <div className="border-t border-[var(--rule-soft)] pt-2" />
                <FlowRow label="Compras" value={fmt(st.totalPurch)} tone="danger" />
                <FlowRow label="Deuda pendiente" value={fmt(st.debt)} tone={st.debt > 0 ? "danger" : "success"} />
                <div className="border-t border-[var(--rule-soft)] pt-2" />
                <FlowRow
                  label="Margen bruto"
                  value={`${st.margen.toFixed(1)}%`}
                  tone={st.margen >= 25 ? "success" : st.margen >= 15 ? "warning" : "danger"}
                />
              </div>
            </SubCard>
          </div>

          {/* Sprint 3: Cash Flow Forecast (7 days) */}
          <SubCard title="Proyección de Flujo de Caja (7 días)" icon={TrendingUp}>
            <div className="space-y-6">
              {/* Summary row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <div className="rounded-lg p-3 text-center bg-[color-mix(in_oklch,var(--data-success)_10%,transparent)]">
                  <div className="text-[length:var(--ts-2xs)] font-semibold text-[var(--data-success-500)] mb-0.5">Ingresos Est.</div>
                  <div className="text-sm font-bold text-[var(--data-success-500)]">{fmt(st.forecastTotalRev)}</div>
                </div>
                <div className="rounded-lg p-3 text-center bg-[color-mix(in_oklch,var(--data-error)_10%,transparent)]">
                  <div className="text-[length:var(--ts-2xs)] font-semibold text-[var(--data-error-500)] mb-0.5">Egresos Est.</div>
                  <div className="text-sm font-bold text-[var(--data-error-500)]">{fmt(st.forecastTotalExp)}</div>
                </div>
                {(() => {
                  const positive = st.forecastTotalRev - st.forecastTotalExp >= 0;
                  const bgToken = positive ? "var(--data-success)" : "var(--data-warning)";
                  const textToken = positive ? "var(--data-success)" : "var(--data-warning)";
                  return (
                    <div
                      className="rounded-lg p-3 text-center"
                      style={{ background: `color-mix(in oklch, ${bgToken} 10%, transparent)` }}
                    >
                      <div className="text-[length:var(--ts-2xs)] font-semibold mb-0.5" style={{ color: textToken }}>
                        Flujo Neto
                      </div>
                      <div className="text-sm font-bold" style={{ color: textToken }}>
                        {fmt(st.forecastTotalRev - st.forecastTotalExp)}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Daily forecast chart */}
              {st.cashFlowForecast.length > 0 &&
                (() => {
                  const maxVal = Math.max(...st.cashFlowForecast.map((f: any) => Math.max(f.estRevenue, f.estExpense)), 1);
                  return (
                    <div className="space-y-2">
                      {st.cashFlowForecast.map((f: any, i: number) => (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-[var(--text-secondary)] w-28 truncate">{f.dayLabel}</span>
                            <span
                              className={cn(
                                "text-xs font-bold tabular-nums",
                                f.net >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]",
                              )}
                            >
                              {f.net >= 0 ? "+" : ""}
                              {fmt(f.net)}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1 h-3">
                            <div className="flex-1 bg-[var(--surface-sunken)] rounded-full overflow-hidden relative">
                              <div
                                className="absolute inset-y-0 left-0 rounded-full bg-[var(--data-success-500)]"
                                style={{ width: `${(f.estRevenue / maxVal) * 100}%` }}
                              />
                            </div>
                            <div className="flex-1 bg-[var(--surface-sunken)] rounded-full overflow-hidden relative">
                              <div
                                className="absolute inset-y-0 left-0 rounded-full bg-[var(--data-error-500)]"
                                style={{ width: `${(f.estExpense / maxVal) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {/* Legend */}
                      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 pt-2 border-t border-[var(--rule-soft)]">
                        <div className="flex items-center gap-1.5 text-xs">
                          <div className="w-3 h-3 bg-[var(--data-success-500)] rounded-sm" />
                          <span className="text-[var(--text-secondary)]">Ingresos</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                          <div className="w-3 h-3 bg-[var(--data-error-500)] rounded-sm" />
                          <span className="text-[var(--text-secondary)]">Egresos</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

              {/* Warning if negative cash flow expected */}
              {st.forecastTotalRev - st.forecastTotalExp < 0 && (
                <div className="rounded-lg p-3 text-xs bg-[color-mix(in_oklch,var(--data-warning)_10%,transparent)]">
                  <div className="font-semibold text-[var(--data-warning-500)] mb-1">Flujo negativo proyectado</div>
                  <p className="text-[var(--data-warning-500)] text-[length:var(--ts-2xs)]">
                    Se proyectan más egresos que ingresos esta semana. Considera postergar compras no urgentes o activar
                    promociones para impulsar ventas.
                  </p>
                </div>
              )}
              {st.forecastTotalRev - st.forecastTotalExp >= 0 && (
                <div className="rounded-lg p-3 text-xs bg-[color-mix(in_oklch,var(--data-success)_10%,transparent)]">
                  <div className="font-semibold text-[var(--data-success-500)] mb-1">Estimación por día de semana</div>
                  <p className="text-[var(--data-success-500)] text-[length:var(--ts-2xs)]">
                    Basado en promedios de ingresos/egresos de los últimos 30 días agrupados por día de la semana.
                  </p>
                </div>
              )}
            </div>
          </SubCard>
        </div>
      )}
    </>
  );
}
