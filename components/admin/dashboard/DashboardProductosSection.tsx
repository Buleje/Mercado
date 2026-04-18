"use client";
import { CardTitle } from "@buleje/design-system";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import {
  TrendingUp, ShoppingCart, Package, Timer, Target, ShoppingBasket } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

function fmt(n: number) { return `S/${n.toFixed(2)}`; }

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1); const min = Math.min(...data, 0); const range = max - min || 1;
  const points = data.map((val, i) => { const x = (i / (data.length - 1)) * 80; const y = 24 - ((val - min) / range) * 20; return `${x},${y}`; }).join(" ");
  const colorMap: Record<string, string> = { "emerald-500":"#10b981","violet-500":"#8b5cf6","red-500":"#ef4444","amber-500":"#f59e0b" };
  return <svg width="80" height="24" className="opacity-60"><polyline points={points} fill="none" stroke={colorMap[color]||"#00B4A6"} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}
function Kpi({ label, value, icon: Icon, accent, delta, sparklineData, invertTrend }: { label: string; value: string; icon: React.ComponentType<{className?:string}>; accent: string; delta?: number|null; sparklineData?: number[]; invertTrend?: boolean }) {
  const isPositive = delta != null ? (invertTrend ? delta <= 0 : delta >= 0) : false;
  const arrowUp = delta != null ? delta >= 0 : false;
  return (<div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-soft)] dark:border-card-border px-2 sm:px-4 py-2 sm:py-3.5 hover:border-gray-200 dark:hover:border-gray-600 transition-all relative overflow-hidden">
    {delta != null && Math.abs(delta) >= 10 && <div className={cn("absolute top-0 left-0 right-0 h-1", isPositive ? "bg-[var(--data-success)]" : "bg-[var(--data-error)]")} />}
    <p className="text-xs font-medium text-[var(--text-tertiary)] dark:text-muted mb-2.5 truncate">{label}</p>
    <div className="flex flex-wrap items-end justify-between gap-2"><div className="flex flex-col gap-1.5">
      <p className="text-base sm:text-xl font-bold text-[var(--text-primary)] dark:text-foreground tabular-nums leading-none">{value}</p>
      {delta != null && delta !== undefined ? <div className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-bold", isPositive ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] dark:text-[var(--data-success)]" : "bg-[var(--data-error-50)] dark:bg-red-950/30 text-[var(--data-error)] dark:text-[var(--data-error)]")}>{arrowUp ? "\u2191" : "\u2193"} {Math.abs(delta).toFixed(1)}%</div> : delta === null ? <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">\u2014 Sin datos anteriores</span> : null}
      {sparklineData && sparklineData.length > 0 && <div className="mt-1"><Sparkline data={sparklineData} color={accent.replace("text-","")} /></div>}
    </div><Icon className={cn("h-4 w-4 shrink-0 mb-0.5", accent)} /></div>
  </div>);
}
function Card({ title, icon: Icon, children, action }: { title: string; icon: React.ComponentType<{className?:string}>; children: React.ReactNode; action?: React.ReactNode }) {
  return (<div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-soft)] dark:border-card-border p-4"><div className="flex items-center justify-between mb-4"><CardTitle className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-[var(--text-tertiary)] dark:text-muted" style={{letterSpacing:"0.06em"}}><Icon className="h-3 w-3 text-[var(--text-tertiary)] dark:text-muted" />{title.toUpperCase()}</CardTitle>{action}</div>{children}</div>);
}
function Empty({ text = "Sin datos en este periodo" }: { text?: string }) { return <div className="py-8 text-center text-xs text-[var(--text-tertiary)] dark:text-muted">{text}</div>; }

export default function DashboardProductosSection({ st, expandAll, _products }: any) {
  const [topTab, setTopTab] = useState<"revenue"|"profit"|"units">("revenue");
  const topList = topTab==="revenue"?st.topRev:topTab==="profit"?st.topProfit:st.topUnits;
  const topMax = topList.length>0?Math.max(...topList.map((p: any)=>topTab==="units"?p.units:topTab==="profit"?p.profit:p.revenue)):1;

  return (
        <div className={cn("space-y-4", expandAll && "bg-white dark:bg-card rounded-xl border border-[var(--rule-soft)] dark:border-card-border p-4")}>
          {expandAll && (
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-[var(--rule-soft)] dark:border-card-border">
              <div className="w-7 h-7 rounded-lg bg-[var(--surface-sunken)] flex items-center justify-center">
                <TrendingUp className="h-3.5 w-3.5 text-[var(--text-secondary)] dark:text-[var(--text-primary)]" />
              </div>
              <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">Productos</CardTitle>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <Kpi label="Prods. Activos" value={String(st.activeProducts)} icon={Package} accent="text-[var(--data-success)]" />
            <Kpi label="Uds. Vendidas" value={String(st.uds)} icon={ShoppingCart} accent="text-[var(--data-success)]" />
            <Kpi label="Sin Movimiento" value={String(st.sinMov.length)} icon={Timer} accent={st.sinMov.length>5?"text-amber-500":"text-[var(--data-success)]"} />
          </div>

          <Card title="Top 10 productos" icon={TrendingUp}
            action={
              <div className="flex items-center bg-gray-100 dark:bg-accent rounded-md p-0.5">
                {(["revenue","profit","units"] as const).map(t => (
                  <button key={t} onClick={()=>setTopTab(t)}
                    className={cn("px-2 py-0.5 rounded text-xs font-semibold transition-all",
                      topTab===t?"bg-white dark:bg-card text-[var(--text-primary)] dark:text-foreground ":"text-[var(--text-tertiary)] dark:text-muted"
                    )}>{t==="revenue"?"Ingreso":t==="profit"?"Utilidad":"Uds."}</button>
                ))}
              </div>
            }>
            {topList.length===0?<Empty />:(
              <div className="space-y-2">
                {topList.map((p: any, i: number) => {
                  const val = topTab==="units"?p.units:topTab==="profit"?p.profit:p.revenue;
                  return (
                    <div key={p.id} className="flex flex-wrap items-center gap-2.5">
                      <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                        i<3?"bg-gray-900 dark:bg-foreground text-white dark:text-background":"bg-gray-100 dark:bg-accent text-[var(--text-tertiary)] dark:text-muted"
                      )}>{i+1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between mb-0.5">
                          <span className="text-xs text-[var(--text-secondary)] truncate">{p.name}</span>
                          <span className="text-xs font-semibold text-[var(--text-primary)] dark:text-foreground ml-2 shrink-0">
                            {topTab==="units"?`${val} uds`:fmt(val)}
                          </span>
                        </div>
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{width:`${(val/topMax)*100}%`,background:i<3?"#111827":"#d1d5db"}} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Pareto ABC Analysis */}
          <Card title="Análisis Pareto (80/20)" icon={Target}>
            <div className="space-y-6">
              {/* ABC Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-lg p-3">
                  <div className="text-xs font-semibold text-[var(--data-success)] dark:text-[var(--data-success)] mb-1">Clase A</div>
                  <div className="text-lg font-bold text-[var(--data-success)] dark:text-[var(--data-success)]">{st.classA.length}</div>
                  <div className="text-[length:var(--ts-2xs)] text-[var(--data-success)]/70 dark:text-[var(--data-success)]/70">~80% ventas</div>
                </div>
                <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-lg p-3">
                  <div className="text-xs font-semibold text-[var(--data-success)] dark:text-[var(--data-success)] mb-1">Clase B</div>
                  <div className="text-lg font-bold text-[var(--data-success)] dark:text-[var(--data-success)]">{st.classB.length}</div>
                  <div className="text-[length:var(--ts-2xs)] text-[var(--data-success)]/70 dark:text-[var(--data-success)]/70">~15% ventas</div>
                </div>
                <div className="bg-[var(--surface-sunken)] rounded-lg p-3">
                  <div className="text-xs font-semibold text-[var(--text-secondary)] mb-1">Clase C</div>
                  <div className="text-lg font-bold text-[var(--text-secondary)]">{st.classC.length}</div>
                  <div className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]/70 dark:text-[var(--text-tertiary)]/70">~5% ventas</div>
                </div>
              </div>

              {/* Pareto Chart */}
              {st.paretoChartData.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Curva de Pareto (Top 20 productos)</div>
                  <div className="relative h-48 flex flex-wrap items-end gap-1 pb-6">
                    {/* Cumulative line overlay */}
                    <svg className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%" }}>
                      <polyline
                        points={st.paretoChartData.map((p: any, i: number) => {
                          const x = (i / (st.paretoChartData.length - 1)) * 100;
                          const y = 100 - (p.cumulativePct / 100) * 80; // 80% of height
                          return `${x}%,${y}%`;
                        }).join(" ")}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2"
                        className="opacity-80"
                      />
                    </svg>
                    {/* Bars */}
                    {st.paretoChartData.map((p: any) => (
                      <div key={p.id} className="flex-1 flex flex-col items-center group relative">
                        <div
                          className={cn("w-full rounded-t transition-all", 
                            p.abcClass === "A" ? "bg-[var(--accent-soft)]" : p.abcClass === "B" ? "bg-[var(--accent-soft)]" : "bg-gray-400"
                          )}
                          style={{ height: `${(p.revenue / st.paretoChartData[0].revenue) * 100}%` }}
                        />
                        {/* Tooltip on hover */}
                        <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-[length:var(--ts-2xs)] px-2 py-1 rounded whitespace-nowrap z-10">
                          <div className="font-semibold">{p.name}</div>
                          <div>Rev: {fmt(p.revenue)} ({p.revenuePct.toFixed(1)}%)</div>
                          <div>Acum: {p.cumulativePct.toFixed(1)}%</div>
                          <div className={cn("font-bold", p.abcClass === "A" ? "text-[var(--data-success)]" : p.abcClass === "B" ? "text-[var(--data-success)]" : "text-[var(--text-tertiary)]")}>Clase {p.abcClass}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Legend */}
                  <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[var(--rule-base)]">
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="w-3 h-3 bg-[var(--accent-soft)] rounded"></div>
                      <span className="text-[var(--text-secondary)]">A (críticos)</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="w-3 h-3 bg-[var(--accent-soft)] rounded"></div>
                      <span className="text-[var(--text-secondary)]">B (importantes)</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="w-3 h-3 bg-gray-400 rounded"></div>
                      <span className="text-[var(--text-secondary)]">C (marginales)</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs ml-auto">
                      <div className="w-3 h-0.5 bg-[var(--data-warning)]"></div>
                      <span className="text-[var(--text-secondary)]">% Acumulado</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Action insights */}
              <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-lg p-3 text-xs">
                <div className="font-semibold text-[var(--data-success)] dark:text-[var(--data-success)] mb-1">Recomendaciones</div>
                <ul className="space-y-0.5 text-[var(--data-success)] dark:text-[var(--data-success)] text-[length:var(--ts-2xs)]">
                  <li>• <strong>Clase A:</strong> Nunca dejar agotar. Prioridad en inventario y proveedores.</li>
                  <li>• <strong>Clase B:</strong> Mantener stock moderado. Revisar rotación mensual.</li>
                  <li>• <strong>Clase C:</strong> Stock mínimo. Considerar eliminar si no rotan.</li>
                </ul>
              </div>
            </div>
          </Card>

          <Card title="Ventas por categoría" icon={ShoppingBasket}>
            {st.catSales.length===0?<Empty />:(
              <div className="space-y-2.5">
                {st.catSales.map((c: any) => {
                  const mx = st.catSales[0]?.total??1;
                  return (
                    <div key={c.cat}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[var(--text-secondary)]">{c.label}</span>
                        <span className="font-semibold text-[var(--text-primary)] dark:text-foreground">{fmt(c.total)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-accent rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{width:`${(c.total/mx)*100}%`,background:c.color}} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Sprint 3: Product Affinity / Cross-sell */}
          {st.productAffinities.length > 0 && (
            <Card title="Se compran juntos (Cross-sell)" icon={ShoppingCart}>
              <div className="space-y-2">
                {st.productAffinities.map((pair: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-accent/40 border border-[var(--rule-soft)] dark:border-card-border">
                    <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                      <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[length:var(--ts-2xs)] font-bold shrink-0",
                        i < 3 ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]" : "bg-gray-100 dark:bg-accent text-[var(--text-tertiary)]"
                      )}>{i+1}</span>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs text-[var(--text-secondary)] truncate">{pair.a}</span>
                        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] shrink-0">+</span>
                        <span className="text-xs text-[var(--text-secondary)] truncate">{pair.b}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <div className="h-1.5 w-12 bg-gray-100 dark:bg-accent rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-[var(--text-primary)]" style={{width:`${(pair.count / st.productAffinities[0].count) * 100}%`}} />
                      </div>
                      <span className="text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] w-8 text-right">{pair.count}×</span>
                    </div>
                  </div>
                ))}
                <div className="bg-[var(--surface-sunken)] rounded-lg p-3 text-xs mt-1">
                  <div className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">Oportunidad de venta</div>
                  <p className="text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-[length:var(--ts-2xs)]">
                    Estos productos se compran juntos frecuentemente. Crea combos o colócalos cerca en el local para impulsar ventas cruzadas.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
  );
}
