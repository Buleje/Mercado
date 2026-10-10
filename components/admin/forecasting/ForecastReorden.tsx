"use client";

/**
 * Reorden de la Predicción de ventas: productos para reordenar según la
 * demanda durante el tiempo de entrega, y el botón «Auto-reorden» (POST
 * /api/forecasting/auto-reorder, que crea órdenes de compra). Salió de
 * `ForecastingDashboard.tsx` sin cambios.
 *
 * - `ForecastReordenPanel` dibuja con los datos de quien lo monta (el tablero
 *   entero comparte una sola carga y un solo «Actualizar»).
 * - El default se carga solo y pide únicamente el reorden: así lo monta
 *   Compras › Sugerencias (plan «panel unificado», ola 3).
 */

import { DataTable } from "@buleje/design-system";
import { RefreshCw, ShoppingCart, Loader2, CheckCircle } from "@buleje/design-system/icons";
import { cn, formatCurrency } from "@/lib/utils";
import { useForecasting, type Forecasting, type PanelForecast } from "./use-forecasting";
import { PanelCard } from "./ForecastPiezas";

const PANELES: readonly PanelForecast[] = ["reorder"];

export default function ForecastReorden() {
  const f = useForecasting(PANELES);
  return <ForecastReordenPanel f={f} />;
}

/** El panel B (ocupa las dos columnas de la grilla del tablero). */
export function ForecastReordenPanel({ f }: { f: Forecasting }) {
  const { state, autoReordering, autoReorderMsg, ejecutarAutoReorder } = f;
  return (
        <div className="lg:col-span-2">
          <PanelCard
            icon={<ShoppingCart className="w-4 h-4" />}
            title={`Productos para Reordenar${state.reorder.length > 0 ? ` (${state.reorder.length})` : ""}`}
            loading={state.loading}
            error={state.errors.reorder}
            isEmpty={state.reorder.length === 0 && !state.loading && !state.errors.reorder}
            emptyMsg="No hay productos que necesiten reorden en este momento"
            headerExtra={
              state.reorder.length > 0 ? (
                <button
                  onClick={ejecutarAutoReorder}
                  disabled={autoReordering}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold",
                    "bg-[var(--text-primary)] hover:opacity-90 dark:bg-zinc-700 dark:hover:bg-zinc-600",
                    "text-white transition-colors",
                    "disabled:opacity-60 disabled:cursor-not-allowed",
                    "min-h-[44px]", // touch target
                  )}
                  aria-label="Ejecutar reorden automática"
                >
                  {autoReordering
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <RefreshCw className="w-3.5 h-3.5" />
                  }
                  Auto-reorden
                </button>
              ) : undefined
            }
          >
            {/* Mensaje resultado de auto-reorder */}
            {autoReorderMsg && (
              <div className={cn(
                "flex items-start gap-2 rounded-xl p-3 mb-3 text-xs font-medium",
                autoReorderMsg.startsWith("Error")
                  ? "bg-[var(--data-error-50)] dark:bg-red-950/30 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/50 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
                  : "bg-primary/10 dark:bg-primary/15 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
              )}>
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {autoReorderMsg}
              </div>
            )}

            {state.reorder.length > 0 && (
              /* Tabla responsive — scroll horizontal en mobile */
              <div className="overflow-x-auto -mx-1">
                <DataTable className="w-full min-w-[540px] text-xs">
                  <thead>
                    <tr className="border-b border-[var(--rule-soft)]">
                      <th className="text-left py-2 px-2 font-semibold text-[var(--text-secondary)] ">Producto</th>
                      <th className="text-right py-2 px-2 font-semibold text-[var(--text-secondary)] ">Stock actual</th>
                      <th className="text-right py-2 px-2 font-semibold text-[var(--text-secondary)] ">Demanda LT</th>
                      <th className="text-right py-2 px-2 font-semibold text-[var(--text-secondary)] ">Pedir</th>
                      <th className="text-right py-2 px-2 font-semibold text-[var(--text-secondary)] ">Total est.</th>
                      <th className="py-2 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.reorder.map((item) => {
                      const critico = item.currentStock < item.demandDuringLeadTime;
                      return (
                        <tr
                          key={item.productId}
                          className={cn(
                            "border-b border-[var(--rule-soft)]/60 transition-colors",
                            critico
                              ? "bg-[var(--data-error-50)]/60 dark:bg-red-950/20"
                              : "hover:bg-[var(--surface-sunken)]/40",
                          )}
                        >
                          {/* Nombre + proveedor */}
                          <td className="py-2.5 px-2">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                                {item.productName}
                              </span>
                              <span className="text-xs text-[var(--text-tertiary)]">
                                {item.supplierName} · LT {item.leadTimeDays}d
                              </span>
                            </div>
                          </td>

                          {/* Stock actual */}
                          <td className="py-2.5 px-2 text-right">
                            <span className={cn(
                              "font-bold",
                              critico
                                ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
                                : "text-[var(--text-primary)]",
                            )}>
                              {item.currentStock} {item.unit}
                            </span>
                          </td>

                          {/* Demanda durante lead time */}
                          <td className="py-2.5 px-2 text-right font-medium text-[var(--text-secondary)]">
                            {item.demandDuringLeadTime} {item.unit}
                          </td>

                          {/* Cantidad sugerida */}
                          <td className="py-2.5 px-2 text-right">
                            <span className="font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
                              {item.suggestedQuantity} {item.unit}
                            </span>
                          </td>

                          {/* Total estimado */}
                          <td className="py-2.5 px-2 text-right font-semibold text-[var(--text-primary)]">
                            {formatCurrency(item.estimatedTotal)}
                          </td>

                          {/* Badges */}
                          <td className="py-2.5 px-2">
                            <div className="flex items-center justify-end gap-1 flex-wrap">
                              {critico && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-red-950/50 dark:text-[var(--data-error-500)]">
                                  Crítico
                                </span>
                              )}
                              {item.confidence < 0.5 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-amber-950/50 dark:text-[var(--data-warning-500)]">
                                  Baja conf.
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </DataTable>
              </div>
            )}
          </PanelCard>
        </div>
  );
}
