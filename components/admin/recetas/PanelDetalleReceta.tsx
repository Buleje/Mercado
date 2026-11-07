"use client";

/**
 * El detalle de una receta en un panel lateral: análisis de costo del servidor
 * (`cost-breakdown`), ingredientes con su costo y el paso a «Producir lote».
 */
import { useId, useRef } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { Layers, Loader2, Package, X } from "@buleje/design-system/icons";
import { BlockTitle, CardTitle } from "@buleje/design-system";
import { m, AnimatePresence } from "@/components/admin/providers";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { RecetaCostBreakdown } from "@/lib/types/recetas";
import type { ProductInfo, Receta } from "./tipos";

interface Props {
  receta: Receta | null;
  productos: Record<number, ProductInfo>;
  costData: RecetaCostBreakdown | null;
  costLoading: boolean;
  onCerrar: () => void;
  onProducir: (r: Receta) => void;
}

export function PanelDetalleReceta({ receta: selected, productos: productsMap, costData, costLoading, onCerrar, onProducir }: Props) {
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const detailTitleId = useId();
  useModalAccesible(detailPanelRef, { onCerrar, activo: !!selected, cerrarConEscape: false });

  return (
      <AnimatePresence>
        {selected && (
          <>
            <m.div
              key="receta-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="modal-backdrop" style={{ zIndex: 40 }}
              onClick={() => onCerrar()}
            />
            <m.div
              key="receta-panel"
              ref={detailPanelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={detailTitleId}
              tabIndex={-1}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[var(--surface-raised)] border-l border-[var(--rule-base)] overflow-y-auto"
            >
              <div className="p-4 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <CardTitle id={detailTitleId} className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">{selected.nombre}</CardTitle>
                  <button aria-label="Cerrar" onClick={() => onCerrar()} className="h-12 w-12 flex items-center justify-center rounded-xl hover:bg-[var(--rule-soft)] transition-colors">
                    <X className="h-5 w-5 text-[var(--text-secondary)]" />
                  </button>
                </div>

                {selected.descripcion && (
                  <p className="text-sm text-[var(--text-secondary)]">{selected.descripcion}</p>
                )}

                {/* ── Análisis de costo (contract RecetaCostBreakdown) ─────── */}
                {costLoading && (
                  <div className="flex items-center gap-2 p-3 bg-[var(--surface-sunken)] rounded-xl">
                    <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-ink)]" />
                    <span className="text-sm text-[var(--text-secondary)]">Cargando análisis de costo...</span>
                  </div>
                )}
                {costData && (
                  <div className="bg-primary/10 border border-[var(--data-success-500)]/30 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm uppercase font-bold text-[var(--data-success-500)]">Análisis de costo</p>
                      <span className={cn(
                        "text-sm font-bold px-2 py-0.5 rounded-lg",
                        costData.margenPorcentaje >= 30
                          ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                          : costData.margenPorcentaje >= 10
                            ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]"
                            : "bg-[var(--data-error-100)] text-[var(--data-error-500)]"
                      )}>
                        Margen: {Number(costData.margenPorcentaje).toFixed(1)}%
                      </span>
                    </div>

                    {/* Desglose por componente */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-[var(--surface-raised)] rounded-lg p-2">
                        <p className="text-sm uppercase text-[var(--text-secondary)]">Ingredientes</p>
                        <p className="font-bold font-mono text-[var(--text-primary)]">{formatCurrency(costData.costoIngredientes)}</p>
                      </div>
                      <div className="bg-[var(--surface-raised)] rounded-lg p-2">
                        <p className="text-sm uppercase text-[var(--text-secondary)]">Mano de obra</p>
                        <p className="font-bold font-mono text-[var(--text-primary)]">{formatCurrency(costData.costoManoObra)}</p>
                      </div>
                      <div className="bg-[var(--surface-raised)] rounded-lg p-2">
                        <p className="text-sm uppercase text-[var(--text-secondary)]">Indirectos</p>
                        <p className="font-bold font-mono text-[var(--text-primary)]">{formatCurrency(costData.costoIndirectos)}</p>
                      </div>
                      <div className="bg-[var(--surface-raised)] rounded-lg p-2 border border-[var(--data-success-500)]/30">
                        <p className="text-sm uppercase text-[var(--data-success-500)]">Total unitario</p>
                        <p className="font-bold font-mono text-[var(--text-primary)]">{formatCurrency(costData.costoTotalUnitario)}</p>
                      </div>
                    </div>

                    {/* Precio venta + margen bruto */}
                    <div className="flex items-center justify-between text-sm pt-2 border-t border-[var(--data-success-500)]/30">
                      <span className="text-[var(--text-secondary)]">
                        Precio venta: <span className="font-bold text-[var(--text-primary)]">{formatCurrency(costData.precioVenta)}</span>
                      </span>
                      <span className="text-[var(--text-secondary)]">
                        Margen bruto: <span className={cn(
                          "font-bold",
                          costData.margenBruto >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]",
                        )}>{formatCurrency(costData.margenBruto)}</span>
                      </span>
                    </div>

                    {costData.ingredientes.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-[var(--data-success-500)]/30">
                        <p className="text-sm uppercase font-bold text-[var(--text-secondary)]">Desglose de ingredientes</p>
                        {costData.ingredientes.map((ing, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-[var(--text-primary)] truncate flex-1 mr-2">
                              {ing.nombre} ({ing.cantidad} {ing.unidad} x {formatCurrency(ing.costoUnitario)})
                            </span>
                            <span className="font-bold font-mono text-[var(--text-primary)] shrink-0">
                              {formatCurrency(ing.costoLinea)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {(() => {
                  const prodFinal = selected.productoId ? productsMap[selected.productoId] : null;
                  const precioVenta = prodFinal?.price ?? 0;
                  const margen = precioVenta > 0 && selected.costoTotal > 0
                    ? Math.round(((precioVenta - selected.costoTotal) / precioVenta) * 100)
                    : null;

                  return (
                    <>
                      {/* Cost summary */}
                      <div className="bg-[var(--surface-sunken)] rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm uppercase font-bold text-[var(--text-tertiary)]">Costo total estimado</p>
                          <p className="text-xl font-bold text-[var(--text-primary)]">{formatCurrency(selected.costoTotal)}</p>
                        </div>
                        {prodFinal && (
                          <div className="pt-2 border-t border-[var(--rule-base)] space-y-1">
                            <p className="text-sm text-[var(--text-secondary)]">
                              Producto final: <span className="font-bold text-[var(--text-primary)]">{prodFinal.name}</span>
                            </p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-[var(--text-secondary)]">
                                Costo: <span className="font-bold">{formatCurrency(selected.costoTotal)}</span>
                              </span>
                              <span className="text-sm text-[var(--text-tertiary)]">&rarr;</span>
                              <span className="text-sm text-[var(--text-secondary)]">
                                Venta: <span className="font-bold">{formatCurrency(precioVenta)}</span>
                              </span>
                              {margen !== null && (
                                <>
                                  <span className="text-sm text-[var(--text-tertiary)]">&rarr;</span>
                                  <span className={cn(
                                    "text-sm font-bold px-2 py-0.5 rounded-lg",
                                    margen >= 30
                                      ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                                      : margen >= 10
                                        ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]"
                                        : "bg-[var(--data-error-100)] text-[var(--data-error-500)]"
                                  )}>
                                    Margen: {margen}%
                                  </span>
                                </>
                              )}
                            </div>
                            {margen !== null && margen < 10 && (
                              <p className="text-sm font-bold text-[var(--data-error-500)] mt-1">
                                Margen muy bajo — revisa tus precios
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Ingredientes with cost column */}
                      <div>
                        <BlockTitle className="mb-3">Ingredientes</BlockTitle>
                        {selected.ingredientes.length === 0 ? (
                          <p className="text-sm text-[var(--text-tertiary)]">Sin ingredientes</p>
                        ) : (
                          <div className="space-y-2">
                            {selected.ingredientes.map(ing => {
                              const prod = productsMap[ing.productoId];
                              const costoUnit = prod?.costPrice ?? prod?.price ?? 0;
                              const costoLinea = costoUnit * ing.cantidad;
                              return (
                                <div key={ing.id} className="flex items-center gap-3 p-3 bg-[var(--surface-sunken)] rounded-xl">
                                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <Package className="h-4 w-4 text-[var(--data-success-500)]" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                                      {prod?.name ?? `Producto #${ing.productoId}`}
                                    </p>
                                    <p className="text-sm text-[var(--text-tertiary)]">
                                      {ing.cantidad} {ing.unidad} x {formatCurrency(costoUnit)}
                                    </p>
                                  </div>
                                  <p className="text-sm font-bold text-[var(--text-primary)] shrink-0">
                                    {formatCurrency(costoLinea)}
                                  </p>
                                </div>
                              );
                            })}
                            {/* Total row */}
                            <div className="flex items-center justify-between p-3 bg-[var(--rule-soft)] rounded-xl">
                              <p className="text-sm font-bold text-[var(--text-secondary)]">Total ingredientes</p>
                              <p className="text-sm font-bold text-[var(--text-primary)]">{formatCurrency(selected.costoTotal)}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Producir button */}
                      <button
                        onClick={() => onProducir(selected)}
                        className="w-full flex items-center justify-center gap-2 px-4 min-h-12 rounded-xl text-sm font-semibold text-white bg-[var(--accent-dark)] hover:brightness-110 transition-colors"
                      >
                        <Layers className="h-4 w-4" />
                        Producir Lote
                      </button>
                    </>
                  );
                })()}
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
  );
}
