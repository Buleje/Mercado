"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import {
  DollarSign, AlertTriangle, Package, PackageX, Timer, Truck,
  Sparkles, Gift, ChevronRight, Zap, TrendingDown, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import BatchStatsWidget from "@/components/admin/dashboard/BatchStatsWidget";
import ExpiringBatchesAlert from "@/components/admin/dashboard/ExpiringBatchesAlert";
import ExpiredBatchesWidget from "@/components/admin/dashboard/ExpiredBatchesWidget";
import PushNotificationBanner from "@/components/admin/dashboard/PushNotificationBanner";

function fmt(n: number) { return `S/${n.toFixed(2)}`; }
const CAT_LABELS: Record<string,string> = { "frutas-verduras":"Frutas y Verduras", abarrotes:"Abarrotes", carnes:"Carnes", lacteos:"Lácteos", bebidas:"Bebidas", limpieza:"Limpieza" };

function Kpi({ label, value, icon: Icon, accent }: { label: string; value: string; icon: React.ComponentType<{className?:string}>; accent: string }) {
  return (<div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border px-2 sm:px-4 py-2 sm:py-3.5 hover:border-gray-200 dark:hover:border-gray-600 transition-all relative overflow-hidden">
    <p className="text-xs font-medium text-gray-400 dark:text-muted mb-2.5 truncate">{label}</p>
    <div className="flex flex-wrap items-end justify-between gap-2"><div className="flex flex-col gap-1.5">
      <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-foreground tabular-nums leading-none">{value}</p>
    </div><Icon className={cn("h-4 w-4 shrink-0 mb-0.5", accent)} /></div>
  </div>);
}
function Card({ title, icon: Icon, children, action }: { title: string; icon: React.ComponentType<{className?:string}>; children: React.ReactNode; action?: React.ReactNode }) {
  return (<div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4"><div className="flex items-center justify-between mb-4"><h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-gray-400 dark:text-muted" style={{letterSpacing:"0.06em"}}><Icon className="h-3 w-3 text-gray-300 dark:text-muted" />{title.toUpperCase()}</h3>{action}</div>{children}</div>);
}
function Empty({ text = "Sin datos en este periodo" }: { text?: string }) { return <div className="py-8 text-center text-xs text-gray-300 dark:text-muted">{text}</div>; }
function DBadge({ children, color }: { children: React.ReactNode; color: "green"|"red"|"amber"|"blue"|"purple"|"gray" }) {
  const m: Record<string,string> = { green:"bg-emerald-50 text-emerald-600", red:"bg-red-50 text-red-600", amber:"bg-amber-50 text-amber-600", blue:"bg-blue-50 text-blue-600", purple:"bg-purple-50 text-purple-600", gray:"bg-gray-100 text-gray-500" };
  return <span className={cn("inline-flex px-1.5 py-0.5 rounded text-xs font-semibold",m[color])}>{children}</span>;
}

export default function DashboardInventarioSection({ st, expandAll, products }: any) {
  const [showCrossSell, setShowCrossSell] = useState(false);
  const [selectedProductForCrossSell, setSelectedProductForCrossSell] = useState<string | null>(null);
  return (
        <div className={cn("space-y-4", expandAll && "bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-4")}>
          {expandAll && (
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-card-border">
              <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
                <Package className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-foreground">Inventario</h3>
            </div>
          )}
          {/* ── Widgets de lotes (BatchStats + Expiring) ── */}
          <PushNotificationBanner />
          <BatchStatsWidget />
          <ExpiringBatchesAlert />
          <ExpiredBatchesWidget />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Stock Valor." value={fmt(st.stockVal)} icon={DollarSign} accent="text-amber-500" />
            <Kpi label="Stock Crítico" value={String(st.stockCritico.length)} icon={AlertTriangle} accent={st.stockCritico.length>0?"text-red-500":"text-emerald-500"} />
            <Kpi label="Agotados" value={String(st.agotados.length)} icon={PackageX} accent={st.agotados.length>0?"text-red-500":"text-emerald-500"} />
            <Kpi label="Sin Movimiento" value={String(st.sinMov.length)} icon={Timer} accent="text-gray-400" />
          </div>

          <Card title="Productos con stock crítico" icon={AlertTriangle}>
            {st.stockCritico.length===0&&st.agotados.length===0?(
              <div className="py-6 text-center text-xs text-emerald-500 font-medium">✓ Inventario saludable</div>
            ):(
              <div className="space-y-1">
                {st.agotados.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
                    <div>
                      <span className="text-xs font-medium text-gray-700 dark:text-foreground">{p.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{CAT_LABELS[p.category]??p.category}</span>
                    </div>
                    <DBadge color="red">Agotado</DBadge>
                  </div>
                ))}
                {st.stockCritico.filter((p: any)=>(p.stock??0)>0).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                    <div>
                      <span className="text-xs font-medium text-gray-700 dark:text-foreground">{p.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{CAT_LABELS[p.category]??p.category}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {/* E2 — Margin badge */}
                      {p.costPrice != null && p.price > 0 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                          {Math.round((p.price - p.costPrice) / p.price * 100)}% mg
                        </span>
                      )}
                      {/* J2 — Suggested price (30% margin target) */}
                      {p.costPrice != null && p.costPrice > 0 && (
                        <span className="text-[9px] font-mono text-blue-500" title="Precio sugerido (30% margen)">
                          →S/{(p.costPrice / 0.7).toFixed(2)}
                        </span>
                      )}
                      <span className="text-xs font-semibold text-amber-600">{p.stock}/{p.stockMin} uds</span>
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(`Hola, necesito reponer: ${p.name}. Stock actual: ${p.stock} uds (mínimo: ${p.stockMin}). Por favor confirmar disponibilidad y precio. 📦`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/50 px-1.5 py-0.5 rounded transition-colors"
                        title="Pedir al proveedor por WhatsApp"
                      >
                        📲 Pedir
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Productos sin movimiento" icon={Timer}>
            {st.sinMov.length===0?(
              <div className="py-6 text-center text-xs text-emerald-500 font-medium">✓ Todos con rotación</div>
            ):(
              <div className="space-y-0.5">
                {st.sinMov.slice(0,20).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between py-1.5 px-2 text-xs rounded hover:bg-gray-50 dark:hover:bg-accent">
                    <span className="text-gray-600 dark:text-gray-400 truncate flex-1">{p.name}</span>
                    <span className="text-gray-300 ml-2">{p.stock??0} uds</span>
                  </div>
                ))}
                {st.sinMov.length>20 && <p className="text-xs text-gray-300 text-center pt-1">+{st.sinMov.length-20} más</p>}
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
                  <p className="text-[10px] text-gray-500 dark:text-muted">
                    Basado en patrones de compra reales. Haz clic en un producto para ver qué productos se compran junto a él.
                  </p>
                  <div className="space-y-2">
                    {[...st.crossSellRecommendations.entries()].slice(0, 10).map(([productId, recommendations]: [any, any]) => {
                      const product = (products ?? []).find((p: any) => p.id === productId);
                      if (!product) return null;
                      const isExpanded = selectedProductForCrossSell === productId;
                      return (
                        <div key={productId} className="border border-gray-200 dark:border-card-border rounded-lg overflow-hidden">
                          <button
                            onClick={() => setSelectedProductForCrossSell(isExpanded ? null : productId)}
                            className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-accent/50 transition-colors text-left"
                          >
                            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
                              <div className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm text-gray-900 dark:text-foreground truncate">{product.name}</div>
                                <div className="text-[10px] text-gray-500 dark:text-muted">{recommendations.length} productos relacionados</div>
                              </div>
                            </div>
                            <ChevronRight className={cn("h-4 w-4 text-gray-400 transition-transform", isExpanded && "rotate-90")} />
                          </button>
                          {isExpanded && (
                            <div className="border-t border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface p-3 space-y-2">
                              <div className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Frecuentemente comprado junto con:</div>
                              {(recommendations as any[]).map((rec: any) => {
                                const relatedProduct = (products ?? []).find((p: any) => p.id === rec.productId);
                                if (!relatedProduct) return null;
                                return (
                                  <div key={rec.productId} className="flex items-center justify-between py-2 px-3 bg-white dark:bg-card rounded-lg">
                                    <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                                      <Gift className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                                      <span className="text-xs text-gray-700 dark:text-foreground truncate">{relatedProduct.name}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                                      <div className="flex items-center gap-1">
                                        <div className="h-1.5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                          <div className="h-full bg-linear-to-r from-violet-500 to-purple-500 rounded-full" style={{ width: `${rec.confidence}%` }} />
                                        </div>
                                        <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 w-8 text-right">{rec.confidence}%</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-2.5 text-xs mt-3">
                                <div className="font-semibold text-blue-700 dark:text-blue-400 mb-1">💡 Sugerencia</div>
                                <p className="text-blue-600 dark:text-blue-300 text-[10px]">
                                  Crea un combo especial con estos productos o sugiérelos activamente cuando vendes {product.name}.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="bg-linear-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 rounded-xl p-3 border border-violet-200 dark:border-violet-800">
                    <div className="flex flex-wrap items-start gap-2">
                      <Zap className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-violet-700 dark:text-violet-400 text-xs mb-1">Análisis de asociación de productos</div>
                        <p className="text-violet-600 dark:text-violet-300 text-[10px]">
                          El % indica la frecuencia con la que los clientes compran ambos productos juntos. Valores altos (&gt;50%) sugieren alta afinidad.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="py-6 text-center">
                <Sparkles className="h-12 w-12 text-gray-300 dark:text-muted mx-auto mb-2" />
                <p className="text-xs text-gray-500 dark:text-muted">Haz clic en &quot;Ver sugerencias&quot; para descubrir oportunidades de venta cruzada</p>
              </div>
            )}
          </Card>

          {/* Stock Projection - Intelligent forecasting */}
          <Card title="Proyección de Stock (Próximos 30 días)" icon={TrendingDown}>
            {st.criticalStock.length === 0 && st.needsReorderSoon.length === 0 ? (
              <div className="py-6 text-center text-xs text-emerald-500 font-medium">✓ Stock proyectado saludable</div>
            ) : (
              <div className="space-y-4">
                {/* Critical products (< 7 days) */}
                {st.criticalStock.length > 0 && (
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400">Crítico (&lt;7 días)</span>
                    </div>
                    <div className="space-y-1.5">
                      {st.criticalStock.map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-700 dark:text-foreground truncate">{p.name}</div>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-gray-500">
                                {p.daysRemaining < 1 ? 'Se agota HOY' : `${Math.floor(p.daysRemaining)} días restantes`}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                • {p.dailyRate.toFixed(1)} uds/día
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <div className="text-right">
                              <div className="text-xs font-semibold text-red-600">{p.stock} uds</div>
                              <div className="text-[9px] text-gray-500">Pedir: {p.suggestedOrderQty}</div>
                            </div>
                            <a
                              href={`https://wa.me/?text=${encodeURIComponent(`🚨 URGENTE: ${p.name}\n\nStock actual: ${p.stock} uds\nSe agota en: ${Math.floor(p.daysRemaining)} días\nCantidad sugerida: ${p.suggestedOrderQty} uds\n\nPor favor confirmar disponibilidad inmediata.`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded transition-colors"
                              title="Pedir URGENTE por WhatsApp"
                            >
                              🚨 Ordenar
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
                      <Clock className="w-4 h-4 text-amber-500" />
                      <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Reordenar pronto (7-14 días)</span>
                    </div>
                    <div className="space-y-1.5">
                      {st.needsReorderSoon.slice(0, 10).map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-700 dark:text-foreground truncate">{p.name}</div>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-gray-500">
                                ~{Math.floor(p.daysRemaining)} días restantes
                              </span>
                              <span className="text-[10px] text-gray-400">
                                • {p.dailyRate.toFixed(1)} uds/día
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <div className="text-right">
                              <div className="text-xs font-semibold text-amber-600">{p.stock} uds</div>
                              <div className="text-[9px] text-gray-500">Pedir: {p.suggestedOrderQty}</div>
                            </div>
                            <a
                              href={`https://wa.me/?text=${encodeURIComponent(`📦 Reorden: ${p.name}\n\nStock actual: ${p.stock} uds\nDías restantes: ${Math.floor(p.daysRemaining)}\nCantidad sugerida: ${p.suggestedOrderQty} uds\n\nPor favor confirmar disponibilidad.`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/50 dark:hover:bg-amber-800/50 px-2 py-1 rounded transition-colors"
                              title="Pedir por WhatsApp"
                            >
                              📲 Pedir
                            </a>
                          </div>
                        </div>
                      ))}
                      {st.needsReorderSoon.length > 10 && (
                        <p className="text-xs text-gray-400 text-center pt-1">
                          +{st.needsReorderSoon.length - 10} productos más...
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Info box */}
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-xs">
                  <div className="font-semibold text-blue-700 dark:text-blue-400 mb-1">💡 Proyección inteligente</div>
                  <p className="text-blue-600 dark:text-blue-300 text-[10px]">
                    Basado en ventas de los últimos 30 días. Las cantidades sugeridas cubren 30 días de demanda proyectada.
                  </p>
                </div>

                {/* Sprint 3: Bulk reorder button */}
                {(st.criticalStock.length + st.needsReorderSoon.length) > 0 && (
                  <div className="border-t border-gray-100 dark:border-card-border pt-3">
                    <button
                      onClick={() => {
                        const allReorder = [...st.criticalStock, ...st.needsReorderSoon];
                        const grouped = new Map<string,typeof allReorder>();
                        allReorder.forEach(p => {
                          const cat = p.category ?? "general";
                          const arr = grouped.get(cat) ?? [];
                          arr.push(p); grouped.set(cat, arr);
                        });
                        let msg = `📦 ORDEN DE COMPRA MASIVA\n📅 ${new Date().toLocaleDateString("es-PE")}\n\n`;
                        let totalItems = 0;
                        grouped.forEach((items, cat) => {
                          msg += `── ${(CAT_LABELS[cat] ?? cat).toUpperCase()} ──\n`;
                          items.forEach(p => {
                            msg += `• ${p.name}: ${p.suggestedOrderQty} uds (stock: ${p.stock}, ${p.daysRemaining < 7 ? "🚨 URGENTE" : "⚠️ pronto"})\n`;
                            totalItems += p.suggestedOrderQty;
                          });
                          msg += "\n";
                        });
                        msg += `────────────────\nTotal: ${allReorder.length} productos, ${totalItems} unidades\n\nPor favor confirmar disponibilidad y costo. 🙏`;
                        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
                      }}
                      className="w-full flex flex-wrap items-center justify-center gap-2 py-3 rounded-xl bg-linear-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold text-sm transition-all shadow-sm hover:shadow-md"
                    >
                      <Truck className="h-4 w-4" />
                      Generar Orden Masiva ({st.criticalStock.length + st.needsReorderSoon.length} productos)
                    </button>
                    <p className="text-[10px] text-gray-400 text-center mt-1.5">
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
