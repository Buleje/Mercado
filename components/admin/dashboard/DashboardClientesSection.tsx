"use client";
import { CardTitle } from "@buleje/design-system";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import {
  Users, UserCheck, Star,
  Download, AlertTriangle, BarChart3 } from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

function fmt(n: number) { return `S/${n.toFixed(2)}`; }
function fmtDate(iso: string) { try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); } catch { return iso; } }
type Period = "hoy" | "semana" | "mes" | "todo";
function inPeriod(iso: string, p: Period): boolean {
  try {
    const d = new Date(iso); const now = new Date();
    if (p === "hoy") { const t = new Date(now.getFullYear(),now.getMonth(),now.getDate()); return d >= t; }
    if (p === "semana") { const t = new Date(now); t.setDate(t.getDate()-7); return d >= t; }
    if (p === "mes") { const t = new Date(now); t.setDate(t.getDate()-30); return d >= t; }
    return true;
  } catch { return false; }
}
function Donut({ data, total, size = 96 }: { data: { total: number; color: string }[]; total: number; size?: number }) {
  const segments = data.map((p, i) => { const pcts = data.map(x => total > 0 ? (x.total / total) * 100 : 0); const cum = pcts.reduce<number[]>((acc, pct) => [...acc, (acc[acc.length - 1] ?? 0) + pct], []); return `${p.color} ${cum[i - 1] ?? 0}% ${cum[i]}%`; });
  return (<div className="relative shrink-0" style={{ width: size, height: size }}><div className="w-full h-full rounded-full" style={{ background: `conic-gradient(${segments.join(", ")})` }} /><div className="absolute rounded-full bg-[var(--surface-raised)] flex items-center justify-center" style={{ inset: size*0.2 }}><span className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{total}</span></div></div>);
}

function Kpi({ label, value, icon: Icon, accent, delta }: { label: string; value: string; icon: React.ComponentType<{className?:string}>; accent: string; delta?: number|null }) {
  const isPositive = delta != null ? delta >= 0 : false;
  const arrowUp = delta != null ? delta >= 0 : false;
  return (<div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] px-2 sm:px-4 py-2 sm:py-3.5 hover:border-gray-200 dark:hover:border-gray-600 transition-all relative overflow-hidden">
    {delta != null && Math.abs(delta) >= 10 && <div className={cn("absolute top-0 left-0 right-0 h-1", isPositive ? "bg-[var(--data-success-500)]" : "bg-[var(--data-error-500)]")} />}
    <p className="text-xs font-medium text-[var(--text-tertiary)] dark:text-muted mb-2.5 truncate">{label}</p>
    <div className="flex flex-wrap items-end justify-between gap-2"><div className="flex flex-col gap-1.5">
      <p className="text-base sm:text-xl font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] tabular-nums leading-none">{value}</p>
      {delta != null && delta !== undefined ? <div className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-bold", isPositive ? "bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" : "bg-[var(--data-error-50)] dark:bg-red-950/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]")}>{arrowUp ? "\u2191" : "\u2193"} {Math.abs(delta).toFixed(1)}%</div> : delta === null ? <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">\u2014 Sin datos anteriores</span> : null}
    </div><Icon className={cn("h-4 w-4 shrink-0 mb-0.5", accent)} /></div>
  </div>);
}
function Card({ title, icon: Icon, children, action }: { title: string; icon: React.ComponentType<{className?:string}>; children: React.ReactNode; action?: React.ReactNode }) {
  return (<div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-4"><div className="flex items-center justify-between mb-4"><CardTitle className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-[var(--text-tertiary)] dark:text-muted" style={{letterSpacing:"0.06em"}}><Icon className="h-3 w-3 text-[var(--text-tertiary)] dark:text-muted" />{title.toUpperCase()}</CardTitle>{action}</div>{children}</div>);
}
function Empty({ text = "Sin datos en este periodo" }: { text?: string }) { return <div className="py-8 text-center text-xs text-[var(--text-tertiary)] dark:text-muted">{text}</div>; }
function _DBadge({ children, color }: { children: React.ReactNode; color: "green"|"red"|"amber"|"blue"|"purple"|"gray" }) {
  const m: Record<string,string> = { green:"bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", red:"bg-red-50 text-[var(--data-error-600)]", amber:"bg-amber-50 text-[var(--data-warning-600)]", blue:"bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", purple:"bg-[var(--surface-sunken)] text-[var(--text-secondary)]", gray:"bg-gray-100 text-[var(--text-secondary)]" };
  return <span className={cn("inline-flex px-1.5 py-0.5 rounded text-xs font-semibold",m[color])}>{children}</span>;
}

export default function DashboardClientesSection({ st, expandAll, orders, customers, _products, showCohortRetention, setShowCohortRetention, _showCrossSell, _setShowCrossSell, _selectedProductForCrossSell, _setSelectedProductForCrossSell, reviewFilter, setReviewFilter, reviews, period }: any) {
  const [selectedClientPhone, setSelectedClientPhone] = useState<string | null>(null);
  return (
        <div className={cn("space-y-4", expandAll && "bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-4")}>
          {expandAll && (
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <div className="w-7 h-7 rounded-lg bg-[var(--surface-sunken)] flex items-center justify-center">
                <Users className="h-3.5 w-3.5 text-[var(--text-secondary)] dark:text-[var(--text-primary)]" />
              </div>
              <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Clientes</CardTitle>
            </div>
          )}
          {/* Customer CSV export with filters */}
          {(() => {
            const handleExportCustomers = () => {
              // Build spend map from orders
              const spendMap = new Map<string, number>();
              orders.filter((o: any) => o.status !== "cancelado").forEach((o: any) => {
                if (!o.customer.phone) return;
                spendMap.set(o.customer.phone, (spendMap.get(o.customer.phone) ?? 0) + o.total);
              });
              const getTier = (phone: string) => {
                const spend = spendMap.get(phone) ?? 0;
                if (spend >= 500) return "VIP";
                if (spend >= 200) return "Frecuente";
                if (spend >= 50) return "Regular";
                return "Nuevo";
              };
              const rows = customers.map((c: any) => ({
                teléfono: c.phone,
                nombre: c.name,
                ubicacion: c.location,
                registrado: c.createdAt.slice(0, 10),
                gasto_total: (spendMap.get(c.phone) ?? 0).toFixed(2),
                tier: getTier(c.phone),
              }));
              exportToCSV(rows, `clientes_${new Date().toISOString().slice(0, 10)}.csv`);
            };
            return (
              <div className="flex items-center justify-end">
                <button
                  onClick={handleExportCustomers}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] dark:hover:bg-primary/15/20 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" /> Exportar clientes CSV
                </button>
              </div>
            );
          })()}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Total Clientes" value={String(st.totalCustomers)} icon={Users} accent="text-[var(--text-secondary)]" />
            <Kpi label="Atendidos" value={String(st.clientesAtendidos)} icon={Users} accent="text-[var(--text-secondary)]" />
            <Kpi label="Rating Prom." value={`${Number(st.avgRating).toFixed(1)}`} icon={Star} accent="text-[var(--data-warning-500)]" />
            <Kpi label="Reseñas" value={String(reviews.length)} icon={Star} accent="text-amber-400" />
          </div>

          <Card title="Clientes más frecuentes" icon={Users}>
            {(() => {
              const clientSpend = new Map<string,{name:string;orders:number;total:number}>();
              orders.filter((o: any)=>o.status!=="cancelado"&&inPeriod(o.createdAt,period as Period)).forEach((o: any) => {
                if(!o.customer.phone) return;
                const e = clientSpend.get(o.customer.phone)??{name:o.customer.name,orders:0,total:0};
                e.orders++;e.total+=o.total;clientSpend.set(o.customer.phone,e);
              });
              const top = [...clientSpend.entries()].map(([ph,x])=>({phone:ph,...x})).sort((a,b)=>b.total-a.total).slice(0,10);
              if(top.length===0) return <Empty text="Sin datos de clientes" />;
              const mx = top[0]?.total??1;
              return (
                <div className="space-y-2">
                  {top.map((c,i) => (
                    <div key={c.phone}>
                      {/* E3 — Clickable client row */}
                      <button
                        onClick={() => setSelectedClientPhone(c.phone === selectedClientPhone ? null : c.phone)}
                        className="flex flex-wrap items-center gap-2.5 w-full text-left hover:bg-gray-50 dark:hover:bg-accent/60 rounded-lg px-1 -mx-1 py-0.5 transition-colors"
                      >
                        <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                          i<3?"bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]":"bg-gray-100 dark:bg-accent text-[var(--text-tertiary)] dark:text-muted"
                        )}>{i+1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between mb-0.5">
                            <span className="text-xs text-[var(--text-secondary)] truncate">{c.name}</span>
                            <span className="text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] ml-2 shrink-0">{fmt(c.total)} <span className="text-[var(--text-tertiary)] font-normal">({c.orders})</span></span>
                          </div>
                          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{width:`${(c.total/mx)*100}%`,background:"#8b5cf6"}} />
                          </div>
                        </div>
                      </button>
                      {selectedClientPhone === c.phone && (() => {
                        const clientOrders = orders.filter((o: any) => o.customer.phone === c.phone).slice(0,5);
                        return (
                          <div className="mt-1.5 mb-1 ml-7 pl-2 border-l-2 border-[var(--rule-base)] space-y-1">
                            {clientOrders.length === 0
                              ? <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Sin pedidos registrados</p>
                              : clientOrders.map((o: any) => (
                                <div key={o.id} className="flex items-center justify-between text-[length:var(--ts-2xs)]">
                                  <span className="text-[var(--text-secondary)]">#{o.id.slice(-6)} · {fmtDate(o.createdAt)}</span>
                                  <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(o.total)}</span>
                                </div>
                              ))
                            }
                            <a
                              href={`https://wa.me/51${c.phone.replace(/\D/g,"")}?text=${encodeURIComponent(`Hola ${c.name}, ¡gracias por ser cliente de Buleje!`)}`}
                              target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)] hover:underline mt-0.5"
                            >Contactar por WA</a>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              );
            })()}
          </Card>

          <Card title="Nuevos vs Recurrentes" icon={UserCheck}>
            {period === "todo" || st.clientesAtendidos === 0 ? (
              <p className="text-xs text-[var(--text-tertiary)] dark:text-muted py-4 text-center">
                {st.clientesAtendidos === 0 ? "Sin clientes en el periodo" : "Selecciona un periodo para ver retención"}
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-6 justify-center py-2">
                <Donut
                  data={[
                    { total: st.newCust, color: "var(--accent)" },
                    { total: st.returningCust, color: "var(--accent)" },
                  ].filter(x => x.total > 0)}
                  total={st.clientesAtendidos}
                  size={100}
                />
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full bg-[var(--text-primary)] shrink-0" />
                    <span className="text-[var(--text-secondary)] w-24">Nuevos</span>
                    <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{st.newCust}</span>
                    <span className="text-[var(--text-tertiary)]">({st.clientesAtendidos > 0 ? ((st.newCust/st.clientesAtendidos)*100).toFixed(0) : 0}%)</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary/10 shrink-0" />
                    <span className="text-[var(--text-secondary)] w-24">Recurrentes</span>
                    <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{st.returningCust}</span>
                    <span className="text-[var(--text-tertiary)]">({st.clientesAtendidos > 0 ? ((st.returningCust/st.clientesAtendidos)*100).toFixed(0) : 0}%)</span>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* FASE 6.1: Cohort Retention Analysis */}
          <Card title="Retención por Cohorte" icon={BarChart3}
            action={
              <button onClick={() => setShowCohortRetention(!showCohortRetention)}
                className="text-xs font-bold text-primary hover:text-primary/80 transition-colors">
                {showCohortRetention ? "Ocultar" : "Ver análisis"}
              </button>
            }>
            {showCohortRetention ? (
              st.cohortData.length === 0 ? <Empty text="No hay datos suficientes para análisis de cohortes" /> : (
                <div className="space-y-6">
                  {/* Retention metrics summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    <div className="bg-[var(--surface-sunken)] rounded-lg p-3 text-center">
                      <div className="text-[length:var(--ts-2xs)] font-semibold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mb-0.5">Día 1</div>
                      <div className="text-lg font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">{st.retentionMetrics.day1}%</div>
                    </div>
                    <div className="bg-[var(--surface-sunken)] rounded-lg p-3 text-center">
                      <div className="text-[length:var(--ts-2xs)] font-semibold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mb-0.5">Día 7</div>
                      <div className="text-lg font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">{st.retentionMetrics.day7}%</div>
                    </div>
                    <div className="bg-[var(--surface-sunken)] rounded-lg p-3 text-center">
                      <div className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-0.5">Día 30</div>
                      <div className="text-lg font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{st.retentionMetrics.day30}%</div>
                    </div>
                  </div>

                  {/* Cohort heatmap table */}
                  <div className="overflow-x-auto -mx-2">
                    <table className="w-full min-w-[600px] text-xs">
                      <thead>
                        <tr className="border-b border-[var(--rule-base)] dark:border-[var(--rule-base)]">
                          <th className="text-left px-2 py-2 text-[var(--text-secondary)] dark:text-muted font-semibold">Cohorte</th>
                          <th className="text-center px-2 py-2 text-[var(--text-secondary)] dark:text-muted font-semibold">M0</th>
                          <th className="text-center px-2 py-2 text-[var(--text-secondary)] dark:text-muted font-semibold">M1</th>
                          <th className="text-center px-2 py-2 text-[var(--text-secondary)] dark:text-muted font-semibold">M2</th>
                          <th className="text-center px-2 py-2 text-[var(--text-secondary)] dark:text-muted font-semibold">M3</th>
                          <th className="text-center px-2 py-2 text-[var(--text-secondary)] dark:text-muted font-semibold">M4</th>
                          <th className="text-center px-2 py-2 text-[var(--text-secondary)] dark:text-muted font-semibold">M5+</th>
                        </tr>
                      </thead>
                      <tbody>
                        {st.cohortData.map((cohort: any, idx: number) => (
                          <tr key={idx} className="border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]/50">
                            <td className="px-2 py-2 font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)]">{cohort.cohortMonth}</td>
                            {[cohort.month0, cohort.month1, cohort.month2, cohort.month3, cohort.month4, cohort.month5plus].map((val, i) => {
                              const color = val >= 50 ? "bg-primary/10" : val >= 30 ? "bg-primary/10" : val >= 15 ? "bg-[var(--data-warning-500)]" : val > 0 ? "bg-[var(--data-error-500)]" : "bg-gray-100 dark:bg-accent";
                              const textColor = val >= 15 ? "text-white" : "text-[var(--text-secondary)]";
                              return (
                                <td key={i} className="px-2 py-2 text-center">
                                  <div className={cn("inline-block px-2 py-1 rounded font-bold text-xs", color, textColor)} title={`${val}% retención`}>
                                    {val}%
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-primary/10 dark:bg-primary/15 rounded-lg p-3 text-xs">
                    <div className="font-semibold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mb-1">Interpretación</div>
                    <p className="text-[var(--data-success-500)] dark:text-[var(--data-success-500)] text-[length:var(--ts-2xs)]">
                      Verde (≥50%): Excelente retención. Naranja (30-49%): Retención aceptable. Rojo (&lt;30%): Requiere acción inmediata. 
                      Los primeros 30 días son críticos para fidelizar clientes.
                    </p>
                  </div>
                </div>
              )
            ) : (
              <div className="py-6 text-center">
                <Users className="h-12 w-12 text-[var(--text-tertiary)] dark:text-muted mx-auto mb-2" />
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Haz clic en &quot;Ver análisis&quot; para explorar retención por cohorte</p>
              </div>
            )}
          </Card>

          {/* Sprint 3: At-risk VIP Clients */}
          {(st.atRiskClients.length > 0 || st.decliningClients.length > 0) && (
            <Card title="Clientes VIP en riesgo" icon={AlertTriangle}>
              <div className="space-y-3">
                {st.atRiskClients.length > 0 && (
                  <div>
                    <div className="text-[length:var(--ts-2xs)] font-semibold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] mb-2">
                      Sin compras recientes ({st.atRiskClients.length})
                    </div>
                    <div className="space-y-1.5">
                      {st.atRiskClients.slice(0, 8).map((c: any) => (
                        <div key={c.phone} className="flex items-center justify-between py-2 px-3 bg-[var(--data-error-50)] dark:bg-red-950/30 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{c.name}</div>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                              <span className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">Gastó {fmt(c.totalSpent)}</span>
                              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">• {c.orderCount} pedidos</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <div className="text-right">
                              <div className="text-xs font-semibold text-[var(--data-error-500)]">{c.daysSinceLastOrder} días</div>
                              <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">sin comprar</div>
                            </div>
                            <a
                              href={`https://wa.me/51${c.phone.replace(/\D/g,"")}?text=${encodeURIComponent(`Hola ${c.name}, ¡te extrañamos en Buleje!\n\n¿Necesitas algo? Tenemos novedades y ofertas especiales para ti.`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12 hover:bg-primary/10 dark:bg-primary/15 dark:hover:bg-primary/15 px-2 py-1 rounded transition-colors"
                            >
                              Contactar
                            </a>
                          </div>
                        </div>
                      ))}
                      {st.atRiskClients.length > 8 && (
                        <p className="text-xs text-[var(--text-tertiary)] text-center pt-1">+{st.atRiskClients.length - 8} más</p>
                      )}
                    </div>
                  </div>
                )}
                {st.decliningClients.length > 0 && (
                  <div>
                    <div className="text-[length:var(--ts-2xs)] font-semibold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mb-2">
                      Frecuencia en declive ({st.decliningClients.length})
                    </div>
                    <div className="space-y-1.5">
                      {st.decliningClients.slice(0, 5).map((c: any) => (
                        <div key={c.phone} className="flex items-center justify-between py-2 px-3 bg-[var(--data-warning-50)] dark:bg-amber-950/30 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{c.name}</div>
                            <span className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">{c.orderCount} pedidos totales • Último: hace {c.daysSinceLastOrder} días</span>
                          </div>
                          <a
                            href={`https://wa.me/51${c.phone.replace(/\D/g,"")}?text=${encodeURIComponent(`Hola ${c.name}, esperamos que estés bien. En Buleje tenemos tus productos favoritos listos para ti. ¿Te enviamos algo?`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-500)] bg-[var(--data-warning-100)] hover:bg-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/50 dark:hover:bg-[var(--data-warning-500)]/50 px-2 py-1 rounded transition-colors shrink-0"
                          >
                            Reactivar
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="bg-primary/10 dark:bg-primary/15 rounded-lg p-3 text-xs">
                  <div className="font-semibold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mb-1">Retención proactiva</div>
                  <p className="text-[var(--data-success-500)] dark:text-[var(--data-success-500)] text-[length:var(--ts-2xs)]">
                    Los clientes VIP (top 20% en gasto) que no compran en 3+ semanas tienen alto riesgo de irse. Un mensaje personalizado recupera hasta 30% de clientes inactivos.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* V3: Full reviews panel */}
          <Card title="Reseñas de clientes" icon={Star}
            action={
              <div className="flex items-center bg-gray-100 dark:bg-accent rounded-md p-0.5">
                {([0,5,4,3,2,1] as const).map(r => (
                  <button key={r} onClick={() => setReviewFilter(r)}
                    className={cn("px-2 py-0.5 rounded text-xs font-semibold transition-all",
                      reviewFilter === r ? "bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] " : "text-[var(--text-tertiary)] dark:text-muted"
                    )}>
                    {r === 0 ? "Todas" : `${r}★`}
                  </button>
                ))}
              </div>
            }>
            {(() => {
              const filtered = reviewFilter === 0 ? reviews : reviews.filter((r: any) => r.rating === reviewFilter);
              if (filtered.length === 0) return <Empty text="Sin reseñas" />;
              return (
                <div className="space-y-2.5 max-h-80 overflow-y-auto">
                  {filtered.map((r: any) => (
                    <div key={r.id} className="flex flex-wrap items-start gap-3 py-2.5 px-3 rounded-xl bg-gray-50 dark:bg-accent/40 border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                      <div className="w-8 h-8 rounded-full bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 flex items-center justify-center text-xs font-bold text-[var(--data-warning-500)] shrink-0">
                        {r.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{r.name}</span>
                          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{fmtDate(r.date)}</span>
                        </div>
                        <div className="flex items-center gap-0.5 my-0.5">
                          {Array.from({ length: 5 }).map((_, s) => (
                            <Star key={s} className={cn("h-3 w-3", s < r.rating ? "text-[var(--data-warning-500)] fill-[var(--data-warning-500)]" : "text-gray-200 dark:text-[var(--text-secondary)]")} />
                          ))}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{r.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </Card>
        </div>
  );
}
