"use client";
import { CardTitle } from "@buleje/design-system";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import {
  DollarSign, AlertTriangle, Package, PackageX, Timer, Truck,
  Sparkles, Gift, ChevronRight, Zap, TrendingDown, Clock,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import BatchStatsWidget from "@/components/admin/dashboard/BatchStatsWidget";
import ExpiringBatchesAlert from "@/components/admin/dashboard/ExpiringBatchesAlert";
import ExpiredBatchesWidget from "@/components/admin/dashboard/ExpiredBatchesWidget";
import PushNotificationBanner from "@/components/admin/dashboard/PushNotificationBanner";

function fmt(n: number) { return `S/${n.toFixed(2)}`; }
const CAT_LABELS: Record<string,string> = { "frutas-verduras":"Frutas y Verduras", abarrotes:"Abarrotes", carnes:"Carnes", lacteos:"Lácteos", bebidas:"Bebidas", limpieza:"Limpieza" };

function Kpi({ label, value, icon: Icon, accent }: { label: string; value: string; icon: React.ComponentType<{className?:string}>; accent: string }) {
  return (<div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-soft)] dark:border-card-border px-2 sm:px-4 py-2 sm:py-3.5 hover:border-gray-200 dark:hover:border-gray-600 transition-all relative overflow-hidden">
    <p className="text-xs font-medium text-[var(--text-tertiary)] dark:text-muted mb-2.5 truncate">{label}</p>
    <div className="flex flex-wrap items-end justify-between gap-2"><div className="flex flex-col gap-1.5">
      <p className="text-base sm:text-xl font-bold text-[var(--text-primary)] dark:text-foreground tabular-nums leading-none">{value}</p>
    </div><Icon className={cn("h-4 w-4 shrink-0 mb-0.5", accent)} /></div>
  </div>);
}
function Card({ title, icon: Icon, children, action }: { title: string; icon: React.ComponentType<{className?:string}>; children: React.ReactNode; action?: React.ReactNode }) {
  return (<div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-soft)] dark:border-card-border p-4"><div className="flex items-center justify-between mb-4"><CardTitle className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-[var(--text-tertiary)] dark:text-muted" style={{letterSpacing:"0.06em"}}><Icon className="h-3 w-3 text-[var(--text-tertiary)] dark:text-muted" />{title.toUpperCase()}</CardTitle>{action}</div>{children}</div>);
}
function Empty({ text = "Sin datos en este periodo" }: { text?: string }) { return <div className="py-8 text-center text-xs text-[var(--text-tertiary)] dark:text-muted">{text}</div>; }
function DBadge({ children, color }: { children: React.ReactNode; color: "green"|"red"|"amber"|"blue"|"purple"|"gray" }) {
  const m: Record<string,string> = { green:"bg-[var(--accent-soft)] text-[var(--data-success)]", red:"bg-red-50 text-red-600", amber:"bg-amber-50 text-amber-600", blue:"bg-[var(--accent-soft)] text-[var(--data-success)]", purple:"bg-[var(--surface-sunken)] text-[var(--text-secondary)]", gray:"bg-gray-100 text-[var(--text-secondary)]" };
  return <span className={cn("inline-flex px-1.5 py-0.5 rounded text-xs font-semibold",m[color])}>{children}</span>;
}

export default function DashboardInventarioSection({ st, expandAll, products }: any) {
  const [showCrossSell, setShowCrossSell] = useState(false);
  const [selectedProductForCrossSell, setSelectedProductForCrossSell] = useState<string | null>(null);
  return (
        <div className={cn("space-y-4", expandAll && "bg-white dark:bg-card rounded-xl border border-[var(--rule-soft)] dark:border-card-border p-4")}>
          {expandAll && (
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-[var(--rule-soft)] dark:border-card-border">
              <div className="w-7 h-7 rounded-lg bg-[var(--data-warning-50)] dark:bg-[var(--data-warning)]/30 flex items-center justify-center">
                <Package className="h-3.5 w-3.5 text-[var(--data-warning)] dark:text-[var(--data-warning)]" />
              </div>
              <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">Inventario</CardTitle>
            </div>
          )}
          {/* ── Widgets de lotes (BatchStats + Expiring) ── */}
          <PushNotificationBanner />
          <BatchStatsWidget />
          <ExpiringBatchesAlert />
          <ExpiredBatchesWidget />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Stock Valor." value={fmt(st.stockVal)} icon={DollarSign} accent="text-amber-500" />
            <Kpi label="Stock Crítico" value={String(st.stockCritico.length)} icon={AlertTriangle} accent={st.stockCritico.length>0?"text-red-500":"text-[var(--data-success)]"} />
            <Kpi label="Agotados" value={String(st.agotados.length)} icon={PackageX} accent={st.agotados.length>0?"text-red-500":"text-[var(--data-success)]"} />
            <Kpi label="Sin Movimiento" value={String(st.sinMov.length)} icon={Timer} accent="text-[var(--text-tertiary)]" />
          </div>

          <Card title="Productos con stock crítico" icon={AlertTriangle}>
            {st.stockCritico.length===0&&st.agotados.length===0?(
              <div className="py-6 text-center text-xs text-[var(--data-success)] font-medium">Inventario saludable</div>
            ):(
              <div className="space-y-1">
                {st.agotados.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-[var(--data-error-50)] dark:bg-red-950/30 rounded-lg">
                    <div>
                      <span className="text-xs font-medium text-[var(--text-primary)] dark:text-foreground">{p.name}</span>
                      <span className="text-xs text-[var(--text-tertiary)] ml-2">{CAT_LABELS[p.category]??p.category}</span>
                    </div>
                    <DBadge color="red">Agotado</DBadge>
                  </div>
                ))}
                {st.stockCritico.filter((p: any)=>(p.stock??0)>0).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-[var(--data-warning-50)] dark:bg-amber-950/30 rounded-lg">
                    <div>
                      <span className="text-xs font-medium text-[var(--text-primary)] dark:text-foreground">{p.name}</span>
                      <span className="text-xs text-[var(--text-tertiary)] ml-2">{CAT_LABELS[p.category]??p.category}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {/* E2 — Margin badge */}
                      {p.costPrice != null && p.price > 0 && (
                        <span className="text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]">
                          {Math.round((p.price - p.costPrice) / p.price * 100)}% mg
                        </span>
                      )}
                      {/* J2 — Suggested price (30% margin target) */}
                      {p.costPrice != null && p.costPrice > 0 && (
                        <span className="text-[length:var(--ts-2xs)] font-mono text-[var(--data-success)]" title="Precio sugerido (30% margen)">
                          →S/{(p.costPrice / 0.7).toFixed(2)}
                        </span>
                      )}
                      <span className="text-xs font-semibold text-[var(--data-warning)]">{p.stock}/{p.stockMin} uds</span>
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(`Hola, necesito reponer: ${p.name}. Stock actual: ${p.stock} uds (mínimo: ${p.stockMin}). Por favor confirmar disponibilidad y precio.`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success)] bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] dark:hover:bg-[var(--accent-muted)] px-1.5 py-0.5 rounded transition-colors"
                        title="Pedir al proveedor por WhatsApp"
                      >
                        Pedir
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Productos sin movimiento" icon={Timer}>
            {st.sinMov.length===0?(
              <div className="py-6 text-center text-xs text-[var(--data-success)] font-medium">Todos con rotación</div>
            ):(
              <div className="space-y-0.5">
                {st.sinMov.slice(0,20).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between py-1.5 px-2 text-xs rounded hover:bg-gray-50 dark:hover:bg-accent">
                    <span className="text-[var(--text-secondary)] truncate flex-1">{p.name}</span>
                    <span className="text-[var(--text-tertiary)] ml-2">{p.stock??0} uds</span>
                  </div>
                ))}
                {st.sinMov.length>20 && <p className="text-xs text-[var(--text-tertiary)] text-center pt-1">+{st.sinMov.length-20} más</p>}
              </div>
            )}
          </Card>

          {/* FASE 6.3: Cross-Sell Recommendations */}
          <Card title="Recomendaciones Cross-Sell" icon={Sparkles}
            action={
              <button onClick={() => setShowCrossSell(!showCrossSell)}
                className="text-xs font-bold text-primary hover:text-primary/80 transition-colors">
                {showCrossSell ? "Ocultar" : "Ver sugerencias"}
              </button>
            }>
            {showCrossSell ? (
              st.crossSellRecommendations.size === 0 ? <Empty text="No hay datos suficientes para recomendaciones" /> : (
                <div className="space-y-3">
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted">
                    Basado en patrones de compra reales. Haz clic en un producto para ver qué productos se compran junto a él.
                  </p>
                  <div className="space-y-2">
                    {[...st.crossSellRecommendations.entries()].slice(0, 10).map(([productId, recommendations]: [any, any]) => {
                      const product = (products ?? []).find((p: any) => p.id === productId);
                      if (!product) return null;
                      const isExpanded = selectedProductForCrossSell === productId;
                      return (
                        <div key={productId} className="border border-[var(--rule-base)] dark:border-card-border rounded-lg overflow-hidden">
                          <button
                            onClick={() => setSelectedProductForCrossSell(isExpanded ? null : productId)}
                            className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-accent/50 transition-colors text-left"
                          >
                            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
                              <div className="w-2 h-2 rounded-full bg-[var(--text-primary)] shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm text-[var(--text-primary)] dark:text-foreground truncate">{product.name}</div>
                                <div className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted">{recommendations.length} productos relacionados</div>
                              </div>
                            </div>
                            <ChevronRight className={cn("h-4 w-4 text-[var(--text-tertiary)] transition-transform", isExpanded && "rotate-90")} />
                          </button>
                          {isExpanded && (
                            <div className="border-t border-[var(--rule-base)] dark:border-card-border bg-gray-50 dark:bg-surface p-3 space-y-2">
                              <div className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-secondary)] mb-2">Frecuentemente comprado junto con:</div>
                              {(recommendations as any[]).map((rec: any) => {
                                const relatedProduct = (products ?? []).find((p: any) => p.id === rec.productId);
                                if (!relatedProduct) return null;
                                return (
                                  <div key={rec.productId} className="flex items-center justify-between py-2 px-3 bg-white dark:bg-card rounded-lg">
                                    <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                                      <Gift className="h-3.5 w-3.5 text-[var(--text-secondary)] shrink-0" />
                                      <span className="text-xs text-[var(--text-primary)] dark:text-foreground truncate">{relatedProduct.name}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                                      <div className="flex items-center gap-1">
                                        <div className="h-1.5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                          <div className="h-full bg-[var(--text-primary)] rounded-full" style={{ width: `${rec.confidence}%` }} />
                                        </div>
                                        <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] w-8 text-right">{rec.confidence}%</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                              <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-lg p-2.5 text-xs mt-3">
                                <div className="font-semibold text-[var(--data-success)] dark:text-[var(--data-success)] mb-1">Sugerencia</div>
                                <p className="text-[var(--data-success)] dark:text-[var(--data-success)] text-[length:var(--ts-2xs)]">
                                  Crea un combo especial con estos productos o sugiérelos activamente cuando vendes {product.name}.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="bg-[var(--surface-sunken)] rounded-xl p-3 border border-[var(--rule-base)]">
                    <div className="flex flex-wrap items-start gap-2">
                      <Zap className="h-4 w-4 text-[var(--text-secondary)] dark:text-[var(--text-primary)] shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-xs mb-1">Análisis de asociación de productos</div>
                        <p className="text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-[length:var(--ts-2xs)]">
                          El % indica la frecuencia con la que los clientes compran ambos productos juntos. Valores altos (&gt;50%) sugieren alta afinidad.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="py-6 text-center">
                <Sparkles className="h-12 w-12 text-[var(--text-tertiary)] dark:text-muted mx-auto mb-2" />
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Haz clic en &quot;Ver sugerencias&quot; para descubrir oportunidades de venta cruzada</p>
              </div>
            )}
          </Card>

          {/* Stock Projection - Intelligent forecasting */}
          <Card title="Proyección de Stock (Próximos 30 días)" icon={TrendingDown}>
            {st.criticalStock.length === 0 && st.needsReorderSoon.length === 0 ? (
              <div className="py-6 text-center text-xs text-[var(--data-success)] font-medium">Stock proyectado saludable</div>
            ) : (
              <div className="space-y-6">
                {/* Critical products (< 7 days) */}
                {st.criticalStock.length > 0 && (
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-[var(--data-error)]" />
                      <span className="text-xs font-semibold text-[var(--data-error)] dark:text-[var(--data-error)]">Crítico (&lt;7 días)</span>
                    </div>
                    <div className="space-y-1.5">
                      {st.criticalStock.map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-[var(--data-error-50)] dark:bg-red-950/30 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-[var(--text-primary)] dark:text-foreground truncate">{p.name}</div>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                              <span className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
                                {p.daysRemaining < 1 ? 'Se agota HOY' : `${Math.floor(p.daysRemaining)} días restantes`}
                              </span>
                              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                                • {p.dailyRate.toFixed(1)} uds/día
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <div className="text-right">
                              <div className="text-xs font-semibold text-[var(--data-error)]">{p.stock} uds</div>
                              <div className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">Pedir: {p.suggestedOrderQty}</div>
                            </div>
                            <a
                              href={`https://wa.me/?text=${encodeURIComponent(`URGENTE: ${p.name}\n\nStock actual: ${p.stock} uds\nSe agota en: ${Math.floor(p.daysRemaining)} días\nCantidad sugerida: ${p.suggestedOrderQty} uds\n\nPor favor confirmar disponibilidad inmediata.`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[length:var(--ts-2xs)] font-bold text-white bg-[var(--data-error)] hover:bg-[var(--data-error)] px-2 py-1 rounded transition-colors"
                              title="Pedir URGENTE por WhatsApp"
                            >
                              Ordenar (urgente)
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warning products (7-14 days) */}
                {st.needsReorderSoon.length > 0 && (
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-[var(--data-warning)]" />
                      <span className="text-xs font-semibold text-[var(--data-warning)] dark:text-[var(--data-warning)]">Reordenar pronto (7-14 días)</span>
                    </div>
                    <div className="space-y-1.5">
                      {st.needsReorderSoon.slice(0, 10).map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-[var(--data-warning-50)] dark:bg-amber-950/30 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-[var(--text-primary)] dark:text-foreground truncate">{p.name}</div>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                              <span className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
                                ~{Math.floor(p.daysRemaining)} días restantes
                              </span>
                              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                                • {p.dailyRate.toFixed(1)} uds/día
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <div className="text-right">
                              <div className="text-xs font-semibold text-[var(--data-warning)]">{p.stock} uds</div>
                              <div className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">Pedir: {p.suggestedOrderQty}</div>
                            </div>
                            <a
                              href={`https://wa.me/?text=${encodeURIComponent(`Reorden: ${p.name}\n\nStock actual: ${p.stock} uds\nDías restantes: ${Math.floor(p.daysRemaining)}\nCantidad sugerida: ${p.suggestedOrderQty} uds\n\nPor favor confirmar disponibilidad.`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning)] bg-[var(--data-warning-100)] hover:bg-[var(--data-warning)] dark:bg-[var(--data-warning)]/50 dark:hover:bg-[var(--data-warning)]/50 px-2 py-1 rounded transition-colors"
                              title="Pedir por WhatsApp"
                            >
                              Pedir
                            </a>
                          </div>
                        </div>
                      ))}
                      {st.needsReorderSoon.length > 10 && (
                        <p className="text-xs text-[var(--text-tertiary)] text-center pt-1">
                          +{st.needsReorderSoon.length - 10} productos más...
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Info box */}
                <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-lg p-3 text-xs">
                  <div className="font-semibold text-[var(--data-success)] dark:text-[var(--data-success)] mb-1">Proyección inteligente</div>
                  <p className="text-[var(--data-success)] dark:text-[var(--data-success)] text-[length:var(--ts-2xs)]">
                    Basado en ventas de los últimos 30 días. Las cantidades sugeridas cubren 30 días de demanda proyectada.
                  </p>
                </div>

                {/* Sprint 3: Bulk reorder button */}
                {(st.criticalStock.length + st.needsReorderSoon.length) > 0 && (
                  <div className="border-t border-[var(--rule-soft)] dark:border-card-border pt-3">
                    <button
                      onClick={() => {
                        const allReorder = [...st.criticalStock, ...st.needsReorderSoon];
                        const grouped = new Map<string,typeof allReorder>();
                        allReorder.forEach(p => {
                          const cat = p.category ?? "general";
                          const arr = grouped.get(cat) ?? [];
                          arr.push(p); grouped.set(cat, arr);
                        });
                        let msg = `ORDEN DE COMPRA MASIVA\n${new Date().toLocaleDateString("es-PE")}\n\n`;
                        let totalItems = 0;
                        grouped.forEach((items, cat) => {
                          msg += `-- ${(CAT_LABELS[cat] ?? cat).toUpperCase()} --\n`;
                          items.forEach(p => {
                            msg += `- ${p.name}: ${p.suggestedOrderQty} uds (stock: ${p.stock}, ${p.daysRemaining < 7 ? "URGENTE" : "pronto"})\n`;
                            totalItems += p.suggestedOrderQty;
                          });
                          msg += "\n";
                        });
                        msg += `----------------\nTotal: ${allReorder.length} productos, ${totalItems} unidades\n\nPor favor confirmar disponibilidad y costo.`;
                        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
                      }}
                      className="w-full flex flex-wrap items-center justify-center gap-2 py-3 rounded-lg bg-[var(--data-success)] hover:opacity-90 text-white font-bold text-sm transition-all  hover:shadow-sm"
                    >
                      <Truck className="h-4 w-4" />
                      Generar Orden Masiva ({st.criticalStock.length + st.needsReorderSoon.length} productos)
                    </button>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-center mt-1.5">
                      Envía una lista completa por WhatsApp con cantidades sugeridas por categoría
                    </p>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
  );
}
