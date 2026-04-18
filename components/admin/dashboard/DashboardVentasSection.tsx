"use client";
import { CardTitle } from "@buleje/design-system";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import {
  DollarSign, TrendingUp, AlertTriangle, BarChart3, Clock,
  CreditCard, Receipt, ShoppingCart, ShoppingBasket,
  Download, Target, CheckCircle2, Lightbulb, TrendingDown,
  Users, type LucideIcon } from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

function fmt(n: number) { return `S/${n.toFixed(2)}`; }
function fmtDate(iso: string) { try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); } catch { return iso; } }
function fmtTime(iso: string) { try { return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } }
function dayLabel(dk: string) { return new Date(dk+"T12:00:00").toLocaleDateString("es-PE",{day:"2-digit",month:"short"}); }
const DAYS = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1); const min = Math.min(...data, 0); const range = max - min || 1;
  const points = data.map((val, i) => { const x = (i / (data.length - 1)) * 80; const y = 24 - ((val - min) / range) * 20; return `${x},${y}`; }).join(" ");
  const colorMap: Record<string, string> = { "emerald-500":"#10b981","violet-500":"#8b5cf6","red-500":"#ef4444" };
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
function Donut({ data, total, size = 96 }: { data: { total: number; color: string }[]; total: number; size?: number }) {
  const segments = useMemo(() => { const pcts = data.map(p => total > 0 ? (p.total / total) * 100 : 0); const cumulative = pcts.reduce<number[]>((acc, pct) => [...acc, (acc[acc.length - 1] ?? 0) + pct], []); return data.map((p, i) => `${p.color} ${cumulative[i - 1] ?? 0}% ${cumulative[i]}%`); }, [data, total]);
  return (<div className="relative shrink-0" style={{ width: size, height: size }}><div className="w-full h-full rounded-full" style={{ background: `conic-gradient(${segments.join(", ")})` }} /><div className="absolute rounded-full bg-white dark:bg-card flex items-center justify-center" style={{ inset: size*0.2 }}><span className="text-xs font-bold text-[var(--text-secondary)] dark:text-foreground">{fmt(total)}</span></div></div>);
}
function Empty({ text = "Sin datos en este periodo" }: { text?: string }) { return <div className="py-8 text-center text-xs text-[var(--text-tertiary)] dark:text-muted">{text}</div>; }
function ElapsedTimer({ createdAt }: { createdAt: string }) {
  // react-hooks/purity — Date.now() no puede ir en render directo.
  // useState lazy + useEffect con refresh cada 60s (igual pattern que DashboardTab).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const mins = Math.floor((now - new Date(createdAt).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const color = mins > 60 ? "text-[var(--data-error)]" : mins > 30 ? "text-[var(--data-warning)]" : "text-[var(--data-success)]";
  return <div className={cn("text-[length:var(--ts-2xs)] font-bold mt-0.5", color)}>\u23F1 {h > 0 ? `${h}h ${m}m` : `${m}m`}</div>;
}
function DBadge({ children, color }: { children: React.ReactNode; color: "green"|"red"|"amber"|"blue"|"purple"|"gray" }) {
  const m: Record<string,string> = { green:"bg-[var(--accent-soft)] text-[var(--data-success)]", red:"bg-red-50 text-red-600", amber:"bg-amber-50 text-amber-600", blue:"bg-[var(--accent-soft)] text-[var(--data-success)]", purple:"bg-[var(--surface-sunken)] text-[var(--text-secondary)]", gray:"bg-gray-100 text-[var(--text-secondary)]" };
  return <span className={cn("inline-flex px-1.5 py-0.5 rounded text-xs font-semibold",m[color])}>{children}</span>;
}

type OrderStatus = "pendiente"|"confirmado"|"en_camino"|"entregado"|"cancelado";
interface Order { id: string; status: OrderStatus; [key: string]: any; }

export default function DashboardVentasSection({ st, expandAll, orders, sales, period, quickStatusMap, changingStatusId, handleQuickStatus, printTicket, adminNotes, saveAdminNote, selectedOrders, setSelectedOrders, toggleOrderSelection, handleBulkStatus, bulkUpdating, expandedHistory, toggleHistory }: any) {
  const [topTab, _setTopTab] = useState<"revenue"|"profit"|"units">("revenue");
  const [recentFilter, setRecentFilter] = useState<"all"|"pendiente"|"en_camino"|"entregado">("all");
  const [recentPage, setRecentPage] = useState(1);
  const [dashSearch, _setDashSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [_selectedClientPhone, _setSelectedClientPhone] = useState<string|null>(null);
  const topList = topTab==="revenue"?st.topRev:topTab==="profit"?st.topProfit:st.topUnits;
  const _topMax = topList.length>0?Math.max(...topList.map((p: any)=>topTab==="units"?p.units:topTab==="profit"?p.profit:p.revenue)):1;
  const exportVentas = useCallback(() => {
    const orderRows = orders.filter((o: any) => o.status !== "cancelado").map((o: any) => ({ Tipo: "Delivery", Fecha: o.createdAt.slice(0,10), ID: o.id.slice(-8), Cliente: o.customer.name, "Total S/": o.total.toFixed(2), Pago: o.paymentMethod ?? "", Estado: o.status }));
    const saleRows = sales.map((s: any) => ({ Tipo: "POS", Fecha: s.createdAt.slice(0,10), ID: s.id.slice(-8), Cliente: "POS", "Total S/": s.total.toFixed(2), Pago: s.payment, Estado: "entregado" }));
    exportToCSV([...orderRows, ...saleRows], `ventas_${period}_${new Date().toISOString().slice(0, 10)}`);
  }, [orders, sales, period]);

  return (
        <div className={cn("space-y-4", expandAll && "bg-white dark:bg-card rounded-xl border border-[var(--rule-soft)] dark:border-card-border p-4")}>
          {expandAll && (
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-[var(--rule-soft)] dark:border-card-border">
              <div className="w-7 h-7 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] flex items-center justify-center">
                <DollarSign className="h-3.5 w-3.5 text-[var(--data-success)] dark:text-[var(--data-success)]" />
              </div>
              <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">Ventas</CardTitle>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 flex-1">
              <Kpi label="Ventas Netas" value={fmt(st.ventas)} icon={DollarSign} accent="text-[var(--data-success)]" delta={st.dVentas} sparklineData={st.sparklineRevenue} />
              <Kpi label="Utilidad" value={fmt(st.utilidad)} icon={TrendingUp} accent="text-[var(--data-success)]" delta={st.dUtilidad} sparklineData={st.sparklineProfit} />
              <Kpi label="Tickets" value={String(st.tickets)} icon={Receipt} accent="text-[var(--text-secondary)]" delta={st.dTickets} sparklineData={st.sparklineOrders} />
              <Kpi label="Cancelados" value={String(st.cancelados)} icon={AlertTriangle} accent="text-red-500" delta={st.dCancelados} invertTrend />
            </div>
            <button
              onClick={exportVentas}
              className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 px-3 py-2 rounded-lg hover:bg-primary/20 transition-colors"
              title="Exportar ventas del período como CSV"
            >
              <Download className="h-3.5 w-3.5" /> Exportar CSV
            </button>
          </div>

          <Card title="Ventas por día" icon={BarChart3}>
            {st.daily.length===0?<Empty />:(
              <div>
                <div className="flex items-center gap-3 mb-2 justify-end flex-wrap">
                  <span className="flex items-center gap-1.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                    <svg width="12" height="4"><line x1="0" y1="2" x2="12" y2="2" stroke="#00B4A6" strokeWidth="2.5" strokeLinecap="round"/></svg>
                    Ventas
                  </span>
                  <span className="flex items-center gap-1.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                    <svg width="12" height="4"><line x1="0" y1="2" x2="12" y2="2" stroke="#00B4A6" strokeWidth="2" strokeDasharray="3 2"/></svg>
                    Utilidad
                  </span>
                  <span className="flex items-center gap-1.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                    <svg width="12" height="4"><line x1="0" y1="2" x2="12" y2="2" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="2 2"/></svg>
                    Promedio 7d
                  </span>
                  <span className="flex items-center gap-1.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                    <svg width="12" height="4"><line x1="0" y1="2" x2="12" y2="2" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="6 3"/></svg>
                    Tendencia
                  </span>
                  {st.wowGrowth !== null && (
                    <span className={cn("text-[length:var(--ts-xs)] font-bold", st.wowGrowth >= 0 ? "text-[var(--data-success)]" : "text-[var(--data-error)]")}>
                      {st.wowGrowth >= 0 ? "↑" : "↓"} {Math.abs(st.wowGrowth).toFixed(1)}% sem/sem
                    </span>
                  )}
                </div>
                <div className="relative h-40">
                  <svg viewBox={`0 0 ${st.daily.length * 50} 160`} className="w-full h-full" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00B4A6" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#00B4A6" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>
                    {/* Grid lines */}
                    {[0.25,0.5,0.75].map(r => (
                      <line key={r} x1="0" y1={140*(1-r)} x2={st.daily.length*50} y2={140*(1-r)} stroke="currentColor" className="text-gray-100 dark:text-[var(--text-primary)]" strokeWidth="1" strokeDasharray="4 4" />
                    ))}
                    {/* Area */}
                    <path d={
                      st.daily.map(([,v]: [string, number], i: number) => {
                        const x = i*50+25; const y = 140-((v/st.maxDaily)*130);
                        return i===0?`M${x},${y}`:`L${x},${y}`;
                      }).join(' ') + ` L${(st.daily.length-1)*50+25},140 L25,140 Z`
                    } fill="url(#areaGrad)" />
                    {/* Revenue line */}
                    <polyline
                      points={st.daily.map(([,v]: [string, number], i: number) => `${i*50+25},${140-((v/st.maxDaily)*130)}`).join(' ')}
                      fill="none" stroke="#00B4A6" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
                    />
                    {/* Profit line (dashed, emerald) */}
                    {st.dailyProfit.some((v: number) => v > 0) && (
                      <polyline
                        points={st.dailyProfit.map((v: number, i: number) => `${i*50+25},${140-((Math.max(v,0)/st.maxDaily)*130)}`).join(' ')}
                        fill="none" stroke="#00B4A6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="5 3"
                      />
                    )}
                    {/* Revenue dots */}
                    {st.daily.map(([,v]: [string, number], i: number) => (
                      <circle key={i} cx={i*50+25} cy={140-((v/st.maxDaily)*130)} r="3.5" fill="#00B4A6" stroke="white" strokeWidth="2" />
                    ))}
                    {/* 7-day moving average line (amber) */}
                    {st.movingAvg7.length >= 2 && (
                      <polyline
                        points={st.movingAvg7.map((v: number, i: number) => `${i*50+25},${140-((Math.max(v,0)/st.maxDaily)*130)}`).join(' ')}
                        fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="2 2"
                      />
                    )}
                    {/* Trend line (red dashed) */}
                    {st.daily.length >= 2 && (
                      <line
                        x1={25}
                        y1={140-((Math.max(0, st.trendIntercept)/st.maxDaily)*130)}
                        x2={(st.daily.length-1)*50+25}
                        y2={140-((Math.max(0, st.trendIntercept + st.trendSlope*(st.daily.length-1))/st.maxDaily)*130)}
                        stroke="#ef4444" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.7"
                      />
                    )}
                  </svg>
                </div>
                <div className="flex justify-between px-1 mt-1">
                  {st.daily.map(([dk]: [string, number]) => (
                    <span key={dk} className="text-xs text-[var(--text-tertiary)] dark:text-muted truncate text-center" style={{width:`${100/st.daily.length}%`}}>{dayLabel(dk)}</span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Forecast card */}
          {st.forecast7.length > 0 && (
            <Card title="Pronóstico próximos 7 días" icon={Target}>
              <div className="space-y-3">
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
                  {st.forecast7.map((f: any, i: number) => {
                    const maxF = Math.max(...st.forecast7.map((x: any) => x.value), 1);
                    return (
                      <div key={i} className="text-center">
                        <div className="h-16 flex items-end justify-center">
                          <div
                            className="w-full max-w-8 rounded-t-md bg-[var(--text-primary)] opacity-70"
                            style={{ height: `${(f.value / maxF) * 100}%`, minHeight: "4px" }}
                          />
                        </div>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted mt-1">{f.day}</p>
                        <p className="text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)] dark:text-foreground">{fmt(f.value)}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] dark:text-muted pt-2 border-t border-[var(--rule-soft)] dark:border-card-border">
                  <span>Total estimado: <strong className="text-[var(--text-primary)] dark:text-foreground">{fmt(st.forecast7.reduce((a: number, f: any) => a + f.value, 0))}</strong></span>
                  <span className="text-[length:var(--ts-2xs)]">Basado en tendencia lineal de {st.daily.length} días</span>
                </div>
              </div>
            </Card>
          )}

          {/* Heat map de horarios pico */}
          <Card title="Heat map de horarios pico" icon={Clock}>
            <div className="space-y-3">
              <div className="text-xs text-[var(--text-secondary)] dark:text-muted">Volumen de ventas por día y hora</div>
              <div className="overflow-x-auto">
                <div className="inline-flex flex-col gap-1 min-w-max">
                  {/* Hour labels */}
                  <div className="flex flex-wrap gap-1 pl-12">
                    {[...Array(24)].map((_, h) => (
                      <div key={h} className="w-6 text-center text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">
                        {h}
                      </div>
                    ))}
                  </div>
                  {/* Day rows */}
                  {DAYS.map((day, dayIndex) => (
                    <div key={dayIndex} className="flex items-center gap-1">
                      <div className="w-10 text-xs font-medium text-[var(--text-secondary)] text-right pr-2">
                        {day}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {[...Array(24)].map((_, hour) => {
                          const key = `${dayIndex}-${hour}`;
                          const count = st.hourMap.get(key) ?? 0;
                          const intensity = count > 0 ? Math.min((count / st.maxHeat) * 100, 100) : 0;
                          let bgColor = "bg-[var(--surface-sunken)]";
                          if (intensity > 0) {
                            if (intensity >= 75) bgColor = "bg-[var(--accent-soft)]";
                            else if (intensity >= 50) bgColor = "bg-[var(--accent-soft)]";
                            else if (intensity >= 25) bgColor = "bg-[var(--accent-soft)]";
                            else bgColor = "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]";
                          }
                          return (
                            <div
                              key={hour}
                              className={cn("w-6 h-6 rounded transition-all group relative", bgColor)}
                              title={`${day} ${hour}:00 - ${count} ventas`}
                            >
                              {count > 0 && (
                                <div className="absolute inset-0 flex items-center justify-center text-[length:var(--ts-2xs)] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded">
                                  {count}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Legend */}
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[var(--rule-base)]">
                <div className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted">
                  Intensidad:
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-[var(--surface-sunken)] rounded"></div>
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Sin ventas</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded"></div>
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Bajo</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-[var(--accent-soft)] rounded"></div>
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Medio</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-[var(--accent-soft)] rounded"></div>
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Alto</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-[var(--accent-soft)] rounded"></div>
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Pico</span>
                </div>
              </div>
              {/* Insights */}
              {(() => {
                const topHours = [...st.hourMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
                if (topHours.length === 0) return null;
                return (
                  <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-lg p-3 text-xs">
                    <div className="font-semibold text-[var(--data-success)] dark:text-[var(--data-success)] mb-1">Horarios pico identificados</div>
                    <div className="space-y-0.5 text-[var(--data-success)] dark:text-[var(--data-success)] text-[length:var(--ts-2xs)]">
                      {topHours.map(([key, count]) => {
                        const [dayIdx, hour] = key.split('-').map(Number);
                        return (
                          <div key={key}>
                            • <strong>{DAYS[dayIdx]} {hour.toString().padStart(2, '0')}:00-{(hour + 1).toString().padStart(2, '0')}:00</strong> - {count} ventas
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-[var(--data-success)] dark:text-[var(--data-success)] text-[length:var(--ts-2xs)]">
                      → Asegurar disponibilidad máxima de personal y stock en estos horarios.
                    </div>
                  </div>
                );
              })()}
            </div>
          </Card>

          {/* Conversion Funnel */}
          <Card title="Funnel de Conversión" icon={TrendingDown}>
            {st.conversionFunnelData[4].count === 0 ? <Empty text="Sin pedidos en el periodo" /> : (
              <div className="space-y-3 sm:space-y-6">
                {/* Visual Funnel Chart */}
                <div className="space-y-0">
                  {st.conversionFunnelData.map((stage: any, idx: number) => {
                    const maxCount = st.conversionFunnelData[0].count;
                    const widthPct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
                    const prevStage = st.conversionFunnelData[idx - 1];
                    const dropoffRate = prevStage && prevStage.count > 0
                      ? ((prevStage.count - stage.count) / prevStage.count) * 100
                      : 0;
                    const iconMap: Record<number, LucideIcon> = {
                      0: Users, 1: ShoppingCart, 2: ShoppingBasket, 3: CreditCard, 4: CheckCircle2
                    };
                    const StageIcon = iconMap[idx] || Target;
                    
                    return (
                      <div key={stage.label} className="relative">
                        <div className="flex flex-wrap items-center gap-3 mb-1.5">
                          <StageIcon className={cn("h-4 w-4", idx === 4 ? "text-[var(--data-success)]" : "text-[var(--text-tertiary)]")} />
                          <span className="text-xs font-medium text-[var(--text-secondary)]">{stage.label}</span>
                          {idx > 0 && dropoffRate > 0 && (
                            <span className="text-[length:var(--ts-2xs)] text-[var(--data-error)] font-semibold ml-auto">
                              -{dropoffRate.toFixed(1)}% abandono
                            </span>
                          )}
                        </div>
                        <div className="relative h-14 mb-3 flex items-center justify-center">
                          <div 
                            className="h-full transition-all rounded-lg  overflow-hidden"
                            style={{ 
                              width: `${Math.max(widthPct, 15)}%`,
                              background: `linear-gradient(135deg, ${stage.color} 0%, ${stage.color}dd 100%)`,
                              clipPath: idx === 4 ? 'none' : 'polygon(5% 0%, 95% 0%, 100% 100%, 0% 100%)'
                            }}
                          >
                            <div className="absolute inset-0 bg-white/10" />
                            <div className="relative h-full flex flex-wrap items-center justify-center gap-2 text-white">
                              <span className="font-bold text-lg">{stage.count.toLocaleString()}</span>
                              {prevStage && (
                                <span className="text-xs opacity-90">
                                  ({prevStage.count > 0 ? ((stage.count / prevStage.count) * 100).toFixed(0) : 0}%)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Metrics Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-4 border-t border-[var(--rule-base)]">
                  <div className="bg-[var(--surface-sunken)] rounded-xl p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Target className="h-4 w-4 text-[var(--data-success)] dark:text-[var(--data-success)]" />
                      <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--data-success)] dark:text-[var(--data-success)]">Conversión Total</span>
                    </div>
                    <div className="text-xl sm:text-2xl font-extrabold text-[var(--data-success)] dark:text-[var(--data-success)]">
                      {st.overallConversionRate.toFixed(1)}%
                    </div>
                    <div className="text-[length:var(--ts-2xs)] text-[var(--data-success)]/70 dark:text-[var(--data-success)]/70 mt-0.5">
                      Pedidos / Visitas
                    </div>
                  </div>

                  <div className="bg-[var(--surface-sunken)] rounded-xl p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <ShoppingCart className="h-4 w-4 text-[var(--data-warning)] dark:text-[var(--data-warning)]" />
                      <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--data-warning)] dark:text-[var(--data-warning)]">Abandono Carrito</span>
                    </div>
                    <div className="text-xl sm:text-2xl font-extrabold text-[var(--data-warning)] dark:text-[var(--data-warning)]">
                      {st.basketAbandonmentRate.toFixed(1)}%
                    </div>
                    <div className="text-[length:var(--ts-2xs)] text-[var(--data-warning)]/70 dark:text-[var(--data-warning)]/70 mt-0.5">
                      Carritos no finalizados
                    </div>
                  </div>

                  <div className="bg-[var(--surface-sunken)] rounded-xl p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <CheckCircle2 className="h-4 w-4 text-[var(--data-success)] dark:text-[var(--data-success)]" />
                      <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--data-success)] dark:text-[var(--data-success)]">Checkout</span>
                    </div>
                    <div className="text-xl sm:text-2xl font-extrabold text-[var(--data-success)] dark:text-[var(--data-success)]">
                      {st.checkoutCompletionRate.toFixed(1)}%
                    </div>
                    <div className="text-[length:var(--ts-2xs)] text-[var(--data-success)]/70 dark:text-[var(--data-success)]/70 mt-0.5">
                      Tasa de finalización
                    </div>
                  </div>
                </div>

                {/* Insights */}
                <div className="bg-[var(--accent-soft)]/50 dark:bg-[var(--accent-muted)] rounded-lg p-3 text-xs border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30">
                  <div className="font-semibold text-[var(--data-success)] dark:text-[var(--data-success)] mb-1.5 flex items-center gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5" />
                    Insights de conversión
                  </div>
                  <div className="space-y-1 text-[var(--data-success)] dark:text-[var(--data-success)] text-[length:var(--ts-2xs)]">
                    {st.basketAbandonmentRate > 40 && (
                      <div>• <strong>Alta tasa de abandono de carrito ({st.basketAbandonmentRate.toFixed(0)}%)</strong> - Considera revisar el proceso de checkout y ofrecer descuentos o envío gratis.</div>
                    )}
                    {st.checkoutCompletionRate < 70 && (
                      <div>• <strong>Baja tasa de finalización de checkout ({st.checkoutCompletionRate.toFixed(0)}%)</strong> - Simplifica el formulario o agrega más métodos de pago.</div>
                    )}
                    {st.overallConversionRate > 15 && (
                      <div>• <strong>¡Excelente tasa de conversión!</strong> - Mantén la estrategia actual y considera escalar el tráfico.</div>
                    )}
                    {st.overallConversionRate < 10 && st.overallConversionRate > 0 && (
                      <div>• <strong>Conversión baja ({st.overallConversionRate.toFixed(1)}%)</strong> - Optimiza landing pages, mejora fotos de productos y clarifica propuesta de valor.</div>
                    )}
                    <div className="pt-1 mt-1 border-t border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 text-[var(--data-success)] dark:text-[var(--data-success)]\">
                      Nota: Datos del funnel son estimaciones basadas en pedidos completados. Implementa analytics real para métricas precisas.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>

          <div className="grid lg:grid-cols-2 gap-3">
            <Card title="Por categoría" icon={ShoppingBasket}>
              {st.catSales.length===0?<Empty />:(
                <div className="space-y-2.5">
                  {st.catSales.map((c: any) => {
                    const mx = st.catSales[0]?.total??1;
                    return (
                      <div key={c.cat}>
                        <div className="flex items-center justify-between text-xs mb-1">
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

            <Card title="Métodos de pago" icon={CreditCard}>
              {st.payments.length===0?<Empty />:(
                <div className="flex flex-wrap items-center gap-6 justify-center">
                  <Donut data={st.payments} total={st.payTotal} size={120} />
                  <div className="space-y-2">
                    {st.payments.map((p: any) => (
                      <div key={p.method} className="flex flex-wrap items-center gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full" style={{background:p.color}} />
                        <span className="text-[var(--text-secondary)] w-20">{p.label}</span>
                        <span className="font-semibold text-[var(--text-primary)] dark:text-foreground">{fmt(p.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          <Card title="Horas pico" icon={Clock}>
            <div className="overflow-x-auto">
              <div className="min-w-80">
                <div className="flex flex-wrap gap-0.5 mb-0.5">
                  <div className="w-8 shrink-0" />
                  {Array.from({length:14},(_,i)=>i+7).map(h => (
                    <div key={h} className="flex-1 text-center text-xs text-[var(--text-tertiary)] font-mono">{h}</div>
                  ))}
                </div>
                {[1,2,3,4,5,6,0].map(day => (
                  <div key={day} className="flex flex-wrap gap-0.5 mb-0.5">
                    <div className="w-8 shrink-0 text-xs text-[var(--text-tertiary)] flex items-center">{DAYS[day]}</div>
                    {Array.from({length:14},(_,i)=>i+7).map(hour => {
                      const count = st.hourMap.get(`${day}-${hour}`)??0;
                      const int = st.maxHeat>0?count/st.maxHeat:0;
                      return (
                        <div key={hour} className="flex-1 aspect-square rounded-sm"
                          style={{background:int===0?"#f9fafb":`rgba(45,106,79,${0.12+int*0.88})`}}
                          title={`${DAYS[day]} ${hour}:00 — ${count}`} />
                      );
                    })}
                  </div>
                ))}
                <div className="flex items-center justify-end gap-1.5 mt-2">
                  <span className="text-xs text-[var(--text-tertiary)]">Menos</span>
                  {[0,0.25,0.5,0.75,1].map((v,i) => (
                    <div key={i} className="w-3 h-3 rounded-sm" style={{background:v===0?"#f9fafb":`rgba(45,106,79,${0.12+v*0.88})`}} />
                  ))}
                  <span className="text-xs text-[var(--text-tertiary)]">Más</span>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Embudo de pedidos" icon={ShoppingCart}>
            {st.funnelData[0].count === 0 ? <Empty text="Sin pedidos en el periodo" /> : (
              <div className="space-y-3">
                {st.funnelData.map((step: any) => {
                  const pct = st.funnelData[0].count > 0 ? (step.count / st.funnelData[0].count) * 100 : 0;
                  return (
                    <div key={step.label}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-[var(--text-secondary)] font-medium">{step.label}</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[var(--text-tertiary)]">{pct.toFixed(0)}%</span>
                          <span className="font-semibold text-[var(--text-primary)] dark:text-foreground w-6 text-right">{step.count}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-accent rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{width:`${Math.max(pct,2)}%`,background:step.color}} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Ventas recientes" icon={Receipt}>
            {/* G2 — Filter pills */}
            <div className="flex items-center gap-1.5 mb-3">
              {(["all","pendiente","en_camino","entregado"] as const).map(f => (
                <button key={f} onClick={() => { setRecentFilter(f); setRecentPage(1); }}
                  className={cn("px-2.5 py-1 rounded-full text-[length:var(--ts-2xs)] font-bold transition-all border",
                    recentFilter === f
                      ? "bg-gray-900 dark:bg-foreground text-white dark:text-card border-transparent"
                      : "bg-white dark:bg-card text-[var(--text-tertiary)] border-[var(--rule-base)] dark:border-card-border hover:text-[var(--text-secondary)]"
                  )}>
                  {f === "all" ? "Todos" : f === "pendiente" ? "Pendiente" : f === "en_camino" ? "En camino" : "Entregado"}
                </button>
              ))}
              {/* N4 — Date range filter */}
              <div className="flex items-center gap-1 ml-auto">
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="px-1.5 py-0.5 rounded-md border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-foreground" />
                <span className="text-[var(--text-tertiary)] text-[length:var(--ts-2xs)]">→</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="px-1.5 py-0.5 rounded-md border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-foreground" />
                {(dateFrom || dateTo) && (
                  <button onClick={() => { setDateFrom(""); setDateTo(""); }}
                    className="text-[length:var(--ts-2xs)] text-[var(--data-error)] hover:text-[var(--data-error)] font-bold">X</button>
                )}
              </div>
            </div>
            {(() => {
              const filteredRecent = st.recent
                .filter((o: any) => recentFilter === "all" || o.status === recentFilter)
                .filter((o: any) => {
                  if (!dateFrom && !dateTo) return true;
                  const od = o.createdAt.slice(0,10);
                  if (dateFrom && od < dateFrom) return false;
                  if (dateTo && od > dateTo) return false;
                  return true;
                })
                .filter((o: any) => !dashSearch ||
                  o.customer.name.toLowerCase().includes(dashSearch.toLowerCase()) ||
                  (o.customer.phone ?? "").includes(dashSearch) ||
                  o.id.toLowerCase().includes(dashSearch.toLowerCase())
                );
              const RECENT_PER_PAGE = 15;
              const totalRecentPages = Math.max(1, Math.ceil(filteredRecent.length / RECENT_PER_PAGE));
              const safePage = Math.min(recentPage, totalRecentPages);
              const pagedRecent = filteredRecent.slice((safePage - 1) * RECENT_PER_PAGE, safePage * RECENT_PER_PAGE);
              return filteredRecent.length===0?<Empty text="Sin resultados" />:(
              <div>
              {/* U3: Bulk action bar */}
              {selectedOrders.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-3 p-2.5 rounded-xl bg-primary/5 border border-primary/20">
                  <span className="text-xs font-bold text-primary">{selectedOrders.size} seleccionado{selectedOrders.size > 1 ? "s" : ""}</span>
                  <div className="flex flex-wrap gap-1 ml-auto">
                    {(["confirmado","en_camino","entregado","cancelado"] as const).map(s => (
                      <button key={s} onClick={() => handleBulkStatus(s)} disabled={bulkUpdating}
                        className="text-[length:var(--ts-2xs)] font-bold px-2 py-1 rounded-lg bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border hover:border-primary hover:text-primary text-[var(--text-secondary)] transition-colors disabled:opacity-50">
                        {s === "confirmado" ? "Confirmar" : s === "en_camino" ? "Despachar" : s === "entregado" ? "Entregado" : "Cancelar"}
                      </button>
                    ))}
                    <button onClick={() => setSelectedOrders(new Set())} className="text-[length:var(--ts-2xs)] font-bold px-2 py-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">Limpiar</button>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto -mx-4">
                <table className="w-full min-w-[600px] text-xs">
                  <thead>
                    <tr className="text-[var(--text-tertiary)] dark:text-muted font-medium border-b border-gray-50 dark:border-card-border">
                      <th className="w-8 px-2 py-2">
                        <input type="checkbox"
                          checked={filteredRecent.length > 0 && filteredRecent.every((o: any) => selectedOrders.has(o.id))}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedOrders(new Set(filteredRecent.map((o: any) => o.id)));
                            else setSelectedOrders(new Set());
                          }}
                          className="rounded border-[var(--rule-base)] accent-primary"
                        />
                      </th>
                      <th className="text-left px-2 sm:px-4 py-1.5 sm:py-2">Fecha</th>
                      <th className="text-left px-2 sm:px-4 py-1.5 sm:py-2">Cliente</th>
                      <th className="text-left px-2 sm:px-4 py-1.5 sm:py-2 hidden sm:table-cell">Detalle</th>
                      <th className="text-left px-2 sm:px-4 py-1.5 sm:py-2">Pago</th>
                      <th className="text-left px-2 sm:px-4 py-1.5 sm:py-2">Estado</th>
                      <th className="text-right px-2 sm:px-4 py-1.5 sm:py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRecent.map((o: any) => (
                      <Fragment key={o.id}>
                      <tr className="border-b border-gray-50 dark:border-card-border last:border-0 hover:bg-gray-50/50 dark:hover:bg-accent/50">
                        {/* U3: Checkbox */}
                        <td className="w-8 px-2 py-2">
                          <input type="checkbox" checked={selectedOrders.has(o.id)} onChange={() => toggleOrderSelection(o.id)} className="rounded border-[var(--rule-base)] accent-primary" />
                        </td>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-[var(--text-secondary)] dark:text-muted whitespace-nowrap">
                          <div>{fmtDate(o.createdAt)}</div>
                          <div className="text-[var(--text-tertiary)]">{fmtTime(o.createdAt)}</div>
                          {/* V1: Elapsed timer for active orders */}
                          {(o.status === "pendiente" || o.status === "confirmado" || o.status === "en_camino") && (
                            <ElapsedTimer createdAt={o.createdAt} />
                          )}
                          {/* Y3: Toggle history */}
                          {o.statusHistory && o.statusHistory.length > 0 && (
                            <button onClick={() => toggleHistory(o.id)} className="text-[length:var(--ts-2xs)] text-primary font-semibold hover:underline mt-0.5">
                              {expandedHistory.has(o.id) ? "Ocultar" : "Historial"}
                            </button>
                          )}
                        </td>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2">
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-[var(--text-primary)] dark:text-foreground">{o.customer.name}</span>
                            {/* J3 — New client badge */}
                            {o.customer.phone && (() => {
                              const otherOrders = orders.filter((ord: any) => ord.id !== o.id && ord.customer.phone === o.customer.phone);
                              return otherOrders.length === 0 ? <span className="text-[length:var(--ts-2xs)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] font-bold px-1.5 py-0.5 rounded-full" title="Primera compra">Nuevo</span> : null;
                            })()}
                          </div>
                          {o.customer.phone && <div className="text-[var(--text-tertiary)] font-mono">{o.customer.phone}</div>}
                          {/* E1 — WA quick contact */}
                          {o.customer.phone && (
                            <a
                              href={`https://wa.me/51${o.customer.phone.replace(/\D/g,"")}?text=${encodeURIComponent(`Hola ${o.customer.name}, sobre tu pedido #${o.id.slice(-6)} en Buleje`)}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-[length:var(--ts-2xs)] text-[var(--data-success)] font-bold hover:underline mt-0.5 flex items-center gap-0.5"
                              title="Contactar por WhatsApp"
                            >WA</a>
                          )}
                        </td>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-[var(--text-tertiary)] hidden sm:table-cell max-w-40 truncate">
                          {o.items.map((i: any)=>`${i.quantity}× ${i.name}`).join(", ")}
                        </td>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2">
                          <DBadge color={o.paymentMethod==="yape"?"purple":"green"}>
                            {o.paymentMethod==="yape"?"Yape":"Efectivo"}
                          </DBadge>
                        </td>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2">
                          {(() => {
                            const effStatus = (quickStatusMap[o.id] ?? o.status) as Order["status"];
                            const NEXT: Partial<Record<Order["status"], { s: Order["status"]; label: string }>> = {
                              pendiente:  { s: "confirmado", label: "Confirmar" },
                              confirmado: { s: "en_camino",  label: "Despachar" },
                              en_camino:  { s: "entregado",  label: "Entregado" },
                            };
                            const next = NEXT[effStatus];
                            return (
                              <div className="flex items-center gap-1.5">
                                <DBadge color={effStatus==="entregado"?"green":effStatus==="cancelado"?"red":effStatus==="pendiente"?"amber":"blue"}>
                                  {effStatus==="pendiente"?"Pendiente":effStatus==="confirmado"?"Confirmado":
                                   effStatus==="en_camino"?"En camino":effStatus==="entregado"?"Entregado":"Cancelado"}
                                </DBadge>
                                {next && (
                                  <button
                                    onClick={() => handleQuickStatus(o.id, next.s)}
                                    disabled={changingStatusId === o.id}
                                    className="text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-accent hover:bg-primary/10 hover:text-primary text-[var(--text-secondary)] transition-colors disabled:opacity-50 whitespace-nowrap"
                                    title={`Cambiar a ${next.s}`}
                                  >
                                    {changingStatusId === o.id ? "…" : next.label}
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-right font-semibold text-[var(--text-primary)] dark:text-foreground">
                          <span>{fmt(o.total)}</span>
                          <button onClick={() => printTicket(o)} className="ml-1.5 text-[var(--text-tertiary)] hover:text-primary transition-colors" title="Imprimir comanda">Impr.</button>
                        </td>
                      </tr>
                      {/* U2: Admin note row */}
                      <tr className="border-b border-gray-50 dark:border-card-border">
                        <td colSpan={7} className="px-4 py-1">
                          <input
                            type="text"
                            placeholder="Nota interna…"
                            value={adminNotes[o.id] ?? o.adminNote ?? ""}
                            onChange={(e) => saveAdminNote(o.id, e.target.value)}
                            className="w-full text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted bg-transparent border-none outline-none placeholder:text-[var(--text-tertiary)] dark:placeholder:text-[var(--text-secondary)]"
                          />
                        </td>
                      </tr>
                      {/* Y3: Status history timeline */}
                      {expandedHistory.has(o.id) && o.statusHistory && o.statusHistory.length > 0 && (
                        <tr className="border-b border-gray-50 dark:border-card-border bg-gray-50/50 dark:bg-surface/30">
                          <td colSpan={7} className="px-3 sm:px-6 py-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              {o.statusHistory.map((h: any, hi: number) => (
                                <div key={hi} className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full bg-primary" />
                                  <span className="text-[length:var(--ts-2xs)] font-semibold text-foreground capitalize">{h.status.replace("_", " ")}</span>
                                  <span className="text-[length:var(--ts-2xs)] text-muted">{fmtDate(h.at)} {fmtTime(h.at)}</span>
                                  {hi < o.statusHistory!.length - 1 && <span className="text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">→</span>}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalRecentPages > 1 && (
                <div className="flex items-center justify-between mt-3 px-1">
                  <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">
                    {filteredRecent.length} pedidos &middot; pág. {safePage} de {totalRecentPages}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => setRecentPage(p => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-accent text-[var(--text-secondary)] dark:text-muted hover:bg-gray-200 dark:hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >&lsaquo; Ant</button>
                    <button
                      onClick={() => setRecentPage(p => Math.min(totalRecentPages, p + 1))}
                      disabled={safePage === totalRecentPages}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-accent text-[var(--text-secondary)] dark:text-muted hover:bg-gray-200 dark:hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >Sig &rsaquo;</button>
                  </div>
                </div>
              )}
              </div>
              );
            })()}
          </Card>
        </div>
  );
}
