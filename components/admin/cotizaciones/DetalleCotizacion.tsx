"use client";

/**
 * El panel lateral de una cotización: cliente, montos (los del servidor),
 * ítems, seguimiento y acciones. Modal a mano con `useModalAccesible`
 * (foco atrapado, Escape cierra, cede el teclado a un diálogo encima).
 */
import { useId, useRef } from "react";
import { BlockTitle, CardTitle } from "@buleje/design-system";
import { Calendar, Loader2, X } from "@buleje/design-system/icons";
import { AnimatePresence, m } from "@/components/admin/providers";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AccionesCotizacion } from "./AccionesCotizacion";
import { SeguimientoCotizacion } from "./SeguimientoCotizacion";
import { STATUS_META, type Cotizacion } from "./tipos";
import type { DetalleCotizacion as Detalle } from "./use-detalle-cotizacion";

interface Props {
  detalle: Detalle;
  onDuplicar: (c: Cotizacion) => void;
  onRenovar: (c: Cotizacion) => void;
  onImprimir: (c: Cotizacion) => void;
  onGuardarPlantilla: (c: Cotizacion, nombre: string) => boolean;
}

export function DetalleCotizacion({ detalle, onDuplicar, onRenovar, onImprimir, onGuardarPlantilla }: Props) {
  const { selected: c, cerrar, detailLoading } = detalle;
  const panelRef = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  useModalAccesible(panelRef, { onCerrar: cerrar, activo: !!c });

  return (
    <AnimatePresence>
      {c && (
        <>
          <m.div key="cot-fondo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" style={{ zIndex: 40 }} onClick={cerrar} />
          <m.div
            key="cot-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={tituloId}
            tabIndex={-1}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 250 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto border-l border-[var(--rule-base)] bg-[var(--surface-raised)]"
          >
            <div className="space-y-5 p-4 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <CardTitle id={tituloId}>Cotización {c.numero}</CardTitle>
                <button type="button" aria-label="Cerrar" onClick={cerrar} className="flex h-12 w-12 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>

              <div className="space-y-3 rounded-xl bg-[var(--surface-sunken)] p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-[var(--text-primary)]">
                      <EnlacePanel cosa="cliente" id={c.customerId} className="font-bold" title="Abrir su ficha de cliente">{c.clienteNombre}</EnlacePanel>
                    </p>
                    {c.clienteRuc && <p className="text-sm text-[var(--text-secondary)]">RUC {c.clienteRuc}</p>}
                  </div>
                  <span className={cn("ml-auto shrink-0 rounded-lg px-2 py-1 text-sm font-semibold", STATUS_META[c.status].clase)}>{STATUS_META[c.status].label}</span>
                </div>
                <dl className="grid grid-cols-3 gap-3 border-t border-[var(--rule-base)] pt-3">
                  {([["Subtotal", c.subtotal], ["IGV", c.igv], ["Total", c.total]] as const).map(([rotulo, valor]) => (
                    <div key={rotulo}>
                      <dt className="text-sm text-[var(--text-secondary)]">{rotulo}</dt>
                      <dd className={cn("text-sm font-bold tabular-nums", rotulo === "Total" ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-primary)]")}>{formatCurrency(valor)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <Calendar className="h-4 w-4" aria-hidden /> Válida hasta el {formatDate(c.validoHasta)}
                </p>
                {c.notas && <p className="text-sm text-[var(--text-secondary)]">{c.notas}</p>}
              </div>

              {detailLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" aria-label="Cargando los ítems" /></div>
              ) : (
                <div>
                  <BlockTitle className="mb-3">Ítems</BlockTitle>
                  <ul className="space-y-2">
                    {(c.items ?? []).map((it, i) => (
                      <li key={it.id ?? i} className="flex items-center gap-3 rounded-xl bg-[var(--surface-sunken)] p-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[var(--text-primary)]">{it.descripcion}</p>
                          <p className="text-sm text-[var(--text-secondary)]">
                            {it.cantidad} × {formatCurrency(it.precioUnit)} {it.descuento > 0 ? `(−${it.descuento} %)` : ""}
                          </p>
                        </div>
                        <p className="text-sm font-bold tabular-nums text-[var(--text-primary)]">{formatCurrency(it.subtotal)}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <SeguimientoCotizacion c={c} onRenovar={() => onRenovar(c)} />
              <AccionesCotizacion
                key={c.id}
                c={c}
                detalle={detalle}
                onDuplicar={() => onDuplicar(c)}
                onImprimir={() => onImprimir(c)}
                onGuardarPlantilla={(nombre) => onGuardarPlantilla(c, nombre)}
              />
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}
