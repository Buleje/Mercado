"use client";

/**
 * «Producir lote»: cuántas unidades, cuánto cuesta y si alcanzan los insumos.
 * Mueve stock (descuenta los ingredientes): el pedido es el mismo de siempre,
 * `POST /api/recetas/:id/producir` con `{ cantidad, notas? }`.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Layers, Loader2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { m, AnimatePresence } from "@/components/admin/providers";
import { Field } from "@/components/admin/shared/Field";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { ProductInfo, Receta } from "./tipos";

interface Props {
  /** La receta a producir; `null` = cerrado. */
  receta: Receta | null;
  productos: Record<number, ProductInfo>;
  onCerrar: () => void;
  onProducida: () => void;
}

export function ModalProducir({ receta: selected, productos: productsMap, onCerrar, onProducida }: Props) {
  const [producirCantidad, setProducirCantidad] = useState("");
  const [producirNotas, setProducirNotas] = useState("");
  const [producing, setProducing] = useState(false);
  const [producirError, setProducirError] = useState<string | null>(null);

  const producirPanelRef = useRef<HTMLDivElement>(null);
  const producirTitleId = useId();
  const cerrarProducir = useCallback(() => onCerrar(), [onCerrar]);
  const showProducir = !!selected;

  /* Cada receta que se abre arranca limpia. */
  useEffect(() => {
    setProducirCantidad("");
    setProducirNotas("");
    setProducirError(null);
  }, [selected?.id]);

  useModalAccesible(producirPanelRef, { onCerrar: cerrarProducir, activo: showProducir, cerrarConEscape: false });
  /** Ventana: se mueve, se achica y se fija (ADR-420). Sin fila de encabezado propia: `asaAutomatica` engancha el título. */
  const ventanaProducir = useVentanaDeModal(showProducir, {
    ref: producirPanelRef,
    aplicarTranslate: true,
    asaAutomatica: true,
    claveMemoria: "recetas-producir-lote",
  });

  const handleProducir = async () => {
    if (!selected) return;
    setProducirError(null);
    const cantidad = parseInt(producirCantidad);
    if (isNaN(cantidad) || cantidad <= 0) { setProducirError("Cantidad inválida"); return; }

    setProducing(true);
    try {
      const body: Record<string, unknown> = { cantidad };
      if (producirNotas.trim()) body.notas = producirNotas.trim();

      const res = await fetch(`/api/recetas/${selected.id}/producir`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(err.error || "Error al producir");
      }
      onCerrar();
      onProducida();
    } catch (e) {
      setProducirError(e instanceof Error ? e.message : "Error");
    } finally {
      setProducing(false);
    }
  };

  return (
      <AnimatePresence>
        {showProducir && selected && (
          <>
            <m.div
              key="producir-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="modal-backdrop" style={{ zIndex: 60 }}
              onClick={() => onCerrar()}
            />
            <m.div
              key="producir-modal"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-0 z-modal-2 flex items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && !ventanaProducir.fijado && onCerrar()}
            >
              <div ref={producirPanelRef} role="dialog" aria-modal="true" aria-labelledby={producirTitleId} tabIndex={-1}
                className="relative w-full max-w-sm bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-5 space-y-4">
                <div {...ventanaProducir.asaProps} className="flex items-center justify-between gap-2">
                  <CardTitle id={producirTitleId} className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">Producir Lote</CardTitle>
                  <ControlesDeVentana ventana={ventanaProducir} />
                </div>
                <p className="text-sm text-[var(--text-secondary)]">
                  Receta: <span className="font-bold text-[var(--text-primary)]">{selected.nombre}</span>
                </p>

                <div className="space-y-3">
                  <Field label="Cantidad a producir" labelClassName="block text-sm font-bold text-[var(--text-secondary)] mb-1">
                    <input
                      type="number"
                      min="1"
                      value={producirCantidad}
                      onChange={e => setProducirCantidad(e.target.value)}
                      placeholder="Ej: 10"
                      className="w-full px-3 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ink)]/30"
                    />
                  </Field>

                  {/* Cost estimate card */}
                  {(() => {
                    const qty = parseInt(producirCantidad) || 0;
                    if (qty <= 0 || selected.costoTotal <= 0) return null;
                    const costoLote = selected.costoTotal * qty;
                    const costoUnitario = selected.costoTotal;
                    const prodFinal = selected.productoId ? productsMap[selected.productoId] : null;
                    const precioVenta = prodFinal?.price ?? 0;
                    const margen = precioVenta > 0 ? Math.round(((precioVenta - costoUnitario) / precioVenta) * 100) : null;

                    return (
                      <div className="bg-[var(--accent-ink)]/5 border border-[var(--accent-ink)]/20 rounded-xl p-3 space-y-1.5">
                        <p className="text-sm uppercase font-bold text-[var(--accent-ink)]">Estimación de costos</p>
                        <div className="flex justify-between text-sm text-[var(--text-primary)]">
                          <span>Costo por lote ({qty} uds):</span>
                          <span className="font-bold">{formatCurrency(costoLote)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-[var(--text-primary)]">
                          <span>Costo por unidad:</span>
                          <span className="font-bold">{formatCurrency(costoUnitario)}</span>
                        </div>
                        {margen !== null && (
                          <div className="flex justify-between text-sm text-[var(--text-primary)] pt-1 border-t border-[var(--accent-ink)]/10">
                            <span>Si vendes a {formatCurrency(precioVenta)}:</span>
                            <span className={cn(
                              "font-bold",
                              margen >= 30
                                ? "text-[var(--data-success-500)]"
                                : margen >= 10
                                  ? "text-[var(--data-warning-500)]"
                                  : "text-[var(--data-error-500)]"
                            )}>
                              margen de {margen}%
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Mejora M5: Alerta de ingredientes insuficientes */}
                  {(() => {
                    const qty = parseInt(producirCantidad) || 0;
                    if (qty <= 0 || selected.ingredientes.length === 0) return null;

                    const faltantes: { nombre: string; necesario: number; disponible: number; unidad: string }[] = [];
                    let todosDisponibles = true;

                    for (const ing of selected.ingredientes) {
                      const prod = productsMap[ing.productoId];
                      const necesario = ing.cantidad * qty;
                      const disponible = (prod as unknown as { stock?: number })?.stock ?? 0;
                      const nombre = prod?.name ?? `Producto #${ing.productoId}`;

                      if (necesario > disponible) {
                        todosDisponibles = false;
                        faltantes.push({ nombre, necesario, disponible, unidad: ing.unidad });
                      }
                    }

                    if (todosDisponibles) {
                      return (
                        <div className="bg-primary/10 border border-[var(--data-success-500)]/30 rounded-xl p-3 text-center">
                          <p className="text-sm font-bold text-[var(--data-success-500)]">Todos los ingredientes disponibles</p>
                        </div>
                      );
                    }

                    return (
                      <div className="bg-[var(--data-error-50)] border border-[var(--data-error-500)] rounded-xl p-3 space-y-2">
                        <p className="text-sm font-bold text-[var(--data-error-500)]">
                          {faltantes.length} ingrediente{faltantes.length !== 1 ? "s" : ""} insuficiente{faltantes.length !== 1 ? "s" : ""} — no se puede producir
                        </p>
                        {faltantes.map((f, i) => (
                          <p key={i} className="text-sm text-[var(--data-error-500)]">
                            Insuficiente: necesitas {f.necesario} {f.unidad} de {f.nombre}, tienes {f.disponible}
                          </p>
                        ))}
                      </div>
                    );
                  })()}

                  <Field label="Notas (opcional)" labelClassName="block text-sm font-bold text-[var(--text-secondary)] mb-1">
                    <input
                      type="text"
                      value={producirNotas}
                      onChange={e => setProducirNotas(e.target.value)}
                      placeholder="Observaciones..."
                      className="w-full px-3 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ink)]/30"
                    />
                  </Field>
                </div>

                {producirError && (
                  <p className="text-sm text-[var(--data-error-500)] font-semibold">{producirError}</p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => onCerrar()}
                    className="flex-1 px-4 min-h-12 rounded-xl text-sm font-bold text-[var(--text-secondary)] bg-[var(--rule-soft)] hover:bg-[var(--rule-base)] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleProducir}
                    disabled={producing}
                    className="flex-1 flex items-center justify-center gap-2 px-4 min-h-12 rounded-xl text-sm font-semibold text-white bg-[var(--accent-dark)] hover:brightness-110 disabled:opacity-50 transition-colors"
                  >
                    {producing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
                    Producir
                  </button>
                </div>
                <TiradorDeVentana ventana={ventanaProducir} />
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
  );
}
