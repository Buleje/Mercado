"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  DollarSign, TrendingUp, AlertCircle, CreditCard, Banknote, Truck, Star, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(n: number) { return `S/${n.toFixed(2)}`; }
function fmtDateFull(iso: string) { try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; } }
function DBadge({ children, color }: { children: React.ReactNode; color: "green"|"red"|"amber"|"blue"|"purple"|"gray" }) {
  const m: Record<string,string> = { green:"bg-emerald-50 text-emerald-600", red:"bg-red-50 text-red-600", amber:"bg-amber-50 text-amber-600", blue:"bg-emerald-50 text-emerald-600", purple:"bg-purple-50 text-purple-600", gray:"bg-gray-100 text-gray-500" };
  return <span className={cn("inline-flex px-1.5 py-0.5 rounded text-xs font-semibold",m[color])}>{children}</span>;
}

function Kpi({ label, value, icon: Icon, accent, delta }: { label: string; value: string; icon: React.ComponentType<{className?:string}>; accent: string; delta?: number|null }) {
  const isPositive = delta != null ? delta >= 0 : false;
  const arrowUp = delta != null ? delta >= 0 : false;
  return (<div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border px-2 sm:px-4 py-2 sm:py-3.5 hover:border-gray-200 dark:hover:border-gray-600 transition-all relative overflow-hidden">
    {delta != null && Math.abs(delta) >= 10 && <div className={cn("absolute top-0 left-0 right-0 h-1", isPositive ? "bg-linear-to-r from-emerald-400 to-green-500" : "bg-linear-to-r from-red-400 to-red-500")} />}
    <p className="text-xs font-medium text-gray-400 dark:text-muted mb-2.5 truncate">{label}</p>
    <div className="flex flex-wrap items-end justify-between gap-2"><div className="flex flex-col gap-1.5">
      <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-foreground tabular-nums leading-none">{value}</p>
      {delta != null && delta !== undefined ? <div className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-bold", isPositive ? "bg-emerald-50 dark:bg-emerald-950/30 text-green-600 dark:text-green-400" : "bg-red-50 dark:bg-red-950/30 text-red-500 dark:text-red-400")}>{arrowUp ? "\u2191" : "\u2193"} {Math.abs(delta).toFixed(1)}%</div> : delta === null ? <span className="text-xs text-gray-400 dark:text-muted">\u2014 Sin datos anteriores</span> : null}
    </div><Icon className={cn("h-4 w-4 shrink-0 mb-0.5", accent)} /></div>
  </div>);
}
function Card({ title, icon: Icon, children, action }: { title: string; icon: React.ComponentType<{className?:string}>; children: React.ReactNode; action?: React.ReactNode }) {
  return (<div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4"><div className="flex items-center justify-between mb-4"><h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-gray-400 dark:text-muted" style={{letterSpacing:"0.06em"}}><Icon className="h-3 w-3 text-gray-300 dark:text-muted" />{title.toUpperCase()}</h3>{action}</div>{children}</div>);
}
function Empty({ text = "Sin datos en este periodo" }: { text?: string }) { return <div className="py-8 text-center text-xs text-gray-300 dark:text-muted">{text}</div>; }
function FlowRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (<div className="flex items-center justify-between"><span className="text-xs text-gray-500 dark:text-muted">{label}</span><span className={cn("text-xs font-semibold", color)}>{value}</span></div>);
}

export default function DashboardComprasCajaSection({ st, expandAll, section }: any) {
  return (
    <>
      {(expandAll || section === "compras") && (
        <div className={cn("space-y-4", expandAll && "bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-4")}>
          {expandAll && (
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-card-border">
              <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center">
                <Truck className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              </div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-foreground">Compras</h3>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Total Compras" value={fmt(st.totalPurch)} icon={Truck} accent="text-emerald-500" />
            <Kpi label="Proveedores" value={String(st.totalSuppliers)} icon={Truck} accent="text-indigo-500" />
            <Kpi label="Deuda Pend." value={fmt(st.debt)} icon={Banknote} accent={st.debt>0?"text-red-500":"text-emerald-500"} />
            <Kpi label="Ctas. Vencidas" value={String(st.overdue.length)} icon={AlertCircle} accent={st.overdue.length>0?"text-red-500":"text-emerald-500"} />
          </div>

          {st.supPurchases.length > 0 && (
            <Card title="Compras por proveedor" icon={Truck}>
              <div className="space-y-2.5">
                {st.supPurchases.map((s: any) => {
                  const mx = st.supPurchases[0]?.total??1;
                  return (
                    <div key={s.name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 dark:text-gray-400 truncate">{s.name}</span>
                        <span className="font-semibold text-gray-800 dark:text-foreground ml-2">{fmt(s.total)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-accent rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{width:`${(s.total/mx)*100}%`,background:"#00B4A6"}} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {st.pending.length > 0 && (
            <Card title="Cuentas por pagar" icon={Banknote}>
              <div className="overflow-x-auto -mx-4">
                <table className="w-full min-w-[600px] text-xs">
                  <thead>
                    <tr className="text-gray-400 dark:text-muted font-medium border-b border-gray-50 dark:border-card-border">
                      <th className="text-left px-2 sm:px-4 py-1.5 sm:py-2">Proveedor</th>
                      <th className="text-right px-2 sm:px-4 py-1.5 sm:py-2">Monto</th>
                      <th className="text-right px-2 sm:px-4 py-1.5 sm:py-2">Pagado</th>
                      <th className="text-right px-2 sm:px-4 py-1.5 sm:py-2">Pend.</th>
                      <th className="text-left px-2 sm:px-4 py-1.5 sm:py-2">Vence</th>
                      <th className="text-left px-2 sm:px-4 py-1.5 sm:py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {st.pending.map((p: any) => {
                      const rem = p.amount-p.paidAmount;
                      const over = new Date(p.dueDate)<new Date();
                      return (
                        <tr key={p.id} className={cn("border-b border-gray-50 dark:border-card-border last:border-0",over?"bg-red-50 dark:bg-red-950/30":"")} >
                          <td className="px-2 sm:px-4 py-1.5 sm:py-2 font-medium text-gray-700 dark:text-foreground">{p.supplierName}</td>
                          <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-right text-gray-500">{fmt(p.amount)}</td>
                          <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-right text-emerald-600 font-medium">{fmt(p.paidAmount)}</td>
                          <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-right text-red-600 font-medium">{fmt(rem)}</td>
                          <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-gray-500">{fmtDateFull(p.dueDate)}</td>
                          <td className="px-2 sm:px-4 py-1.5 sm:py-2">
                            <DBadge color={over?"red":p.status==="parcial"?"amber":"gray"}>
                              {over?"Vencido":p.status==="parcial"?"Parcial":"Pendiente"}
                            </DBadge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {(expandAll || section === "caja") && (
        <div className={cn("space-y-4", expandAll && "bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-4")}>
          {expandAll && (
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-card-border">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                <Banknote className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-foreground">Caja</h3>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Ingresos" value={fmt(st.ventas)} icon={DollarSign} accent="text-emerald-500" delta={st.dVentas} />
            <Kpi label="Egresos" value={fmt(st.totalPurch)} icon={TrendingUp} accent="text-red-500" />
            <Kpi label="Balance" value={fmt(st.ventas-st.totalPurch)} icon={Banknote} accent={st.ventas-st.totalPurch>=0?"text-emerald-500":"text-red-500"} />
            {/* J4 — Net profit KPI */}
            <Kpi label="Ganancia Neta" value={fmt(st.utilidad)} icon={Star} accent={st.utilidad>=0?"text-emerald-500":"text-red-500"} delta={st.dUtilidad} />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Card title="Desglose de pagos" icon={CreditCard}>
              {st.payments.length===0?<Empty />:(
                <div className="space-y-3">
                  {st.payments.map((p: any) => (
                    <div key={p.method} className="flex items-center justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{background:p.color}} />
                        <span className="text-xs text-gray-600">{p.label}</span>
                      </div>
                      <span className="text-xs font-semibold text-gray-800 dark:text-foreground">{fmt(p.total)}</span>
                    </div>
                  ))}
                  <div className="border-t border-gray-100 dark:border-card-border pt-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">Total</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-foreground">{fmt(st.payTotal)}</span>
                  </div>
                </div>
              )}
            </Card>

            <Card title="Flujo del periodo" icon={BarChart3}>
              <div className="space-y-3">
                <FlowRow label="Ventas netas" value={fmt(st.ventas)} color="text-emerald-600" />
                <FlowRow label="Costo estimado" value={fmt(st.ventas-st.utilidad)} color="text-gray-500" />
                <FlowRow label="Utilidad bruta" value={fmt(st.utilidad)} color="text-emerald-600" />
                <div className="border-t border-gray-100 dark:border-card-border pt-2" />
                <FlowRow label="Compras" value={fmt(st.totalPurch)} color="text-red-500" />
                <FlowRow label="Deuda pendiente" value={fmt(st.debt)} color={st.debt>0?"text-red-600":"text-emerald-600"} />
                <div className="border-t border-gray-100 dark:border-card-border pt-2" />
                <FlowRow label="Margen bruto" value={`${st.margen.toFixed(1)}%`} color={st.margen>=25?"text-emerald-600":st.margen>=15?"text-amber-600":"text-red-600"} />
              </div>
            </Card>
          </div>

          {/* Sprint 3: Cash Flow Forecast (7 days) */}
          <Card title="Proyección de Flujo de Caja (7 días)" icon={TrendingUp}>
            <div className="space-y-4">
              {/* Summary row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3 text-center">
                  <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mb-0.5">Ingresos Est.</div>
                  <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{fmt(st.forecastTotalRev)}</div>
                </div>
                <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3 text-center">
                  <div className="text-[10px] font-semibold text-red-600 dark:text-red-400 mb-0.5">Egresos Est.</div>
                  <div className="text-sm font-bold text-red-700 dark:text-red-300">{fmt(st.forecastTotalExp)}</div>
                </div>
                <div className={cn("rounded-lg p-3 text-center", st.forecastTotalRev - st.forecastTotalExp >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-amber-50 dark:bg-amber-950/30")}>
                  <div className={cn("text-[10px] font-semibold mb-0.5", st.forecastTotalRev - st.forecastTotalExp >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>Flujo Neto</div>
                  <div className={cn("text-sm font-bold", st.forecastTotalRev - st.forecastTotalExp >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>{fmt(st.forecastTotalRev - st.forecastTotalExp)}</div>
                </div>
              </div>

              {/* Daily forecast chart */}
              {st.cashFlowForecast.length > 0 && (() => {
                const maxVal = Math.max(...st.cashFlowForecast.map((f: any) => Math.max(f.estRevenue, f.estExpense)), 1);
                return (
                  <div className="space-y-2">
                    {st.cashFlowForecast.map((f: any, i: number) => (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-28 truncate">{f.dayLabel}</span>
                          <span className={cn("text-xs font-bold", f.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                            {f.net >= 0 ? "+" : ""}{fmt(f.net)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 h-3">
                          <div className="flex-1 bg-gray-50 dark:bg-accent rounded-full overflow-hidden relative">
                            <div className="absolute inset-y-0 left-0 bg-emerald-400 dark:bg-emerald-500 rounded-full" style={{width: `${(f.estRevenue / maxVal) * 100}%`}} />
                          </div>
                          <div className="flex-1 bg-gray-50 dark:bg-accent rounded-full overflow-hidden relative">
                            <div className="absolute inset-y-0 left-0 bg-red-400 dark:bg-red-500 rounded-full" style={{width: `${(f.estExpense / maxVal) * 100}%`}} />
                          </div>
                        </div>
                      </div>
                    ))}
                    {/* Legend */}
                    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 pt-2 border-t border-gray-100 dark:border-card-border">
                      <div className="flex items-center gap-1.5 text-xs">
                        <div className="w-3 h-3 bg-emerald-400 rounded-sm" />
                        <span className="text-gray-500">Ingresos</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <div className="w-3 h-3 bg-red-400 rounded-sm" />
                        <span className="text-gray-500">Egresos</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Warning if negative cash flow expected */}
              {st.forecastTotalRev - st.forecastTotalExp < 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 text-xs">
                  <div className="font-semibold text-amber-700 dark:text-amber-400 mb-1">Flujo negativo proyectado</div>
                  <p className="text-amber-600 dark:text-amber-300 text-[10px]">
                    Se proyectan más egresos que ingresos esta semana. Considera postergar compras no urgentes o activar promociones para impulsar ventas.
                  </p>
                </div>
              )}
              {st.forecastTotalRev - st.forecastTotalExp >= 0 && (
                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3 text-xs">
                  <div className="font-semibold text-emerald-700 dark:text-emerald-400 mb-1">Estimación por día de semana</div>
                  <p className="text-emerald-600 dark:text-emerald-300 text-[10px]">
                    Basado en promedios de ingresos/egresos de los últimos 30 días agrupados por día de la semana.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
