"use client";

import { Minus, Plus, AlertTriangle } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LineaAjustable } from "@/lib/notas-credito/remanente";

const BOTON_CHICO = "min-h-12 rounded-xl px-3 text-sm font-bold text-[var(--text-secondary)] bg-[var(--surface-sunken)] hover:bg-[var(--rule-soft)]";
const PASO = "h-12 w-12 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center hover:bg-[var(--rule-soft)] disabled:opacity-40";

/**
 * Líneas de la venta con lo que se cobró de verdad por unidad (F12) y lo que ya volvió por Caja (M55).
 * La suma nunca pasa de lo que queda del documento: el tope lo pone `importeDeLineas` y, al guardar, el servidor.
 */
export default function NcLineasNota({ lineas, cantidades, setCantidad, marcarTodo, usarDevueltoEnCaja, limpiar, notasActivas, titulo }: {
  lineas: readonly LineaAjustable[];
  cantidades: readonly number[];
  setCantidad: (i: number, n: number) => void;
  marcarTodo: () => void;
  usarDevueltoEnCaja: () => void;
  limpiar: () => void;
  notasActivas: number;
  titulo: string;
}) {
  const hayDevuelto = lineas.some((l) => l.devueltasEnCaja > 0);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-[var(--text-secondary)]">{titulo}</span>
        <div className="flex-1" />
        <button type="button" onClick={marcarTodo} className={BOTON_CHICO}>Todo</button>
        {hayDevuelto && (
          <button type="button" data-qa="nc-usar-devuelto" onClick={usarDevueltoEnCaja} className={BOTON_CHICO} title="Las mismas unidades que ya volvieron por Caja › Devolución">
            Lo devuelto en Caja
          </button>
        )}
        <button type="button" onClick={limpiar} className={BOTON_CHICO}>Ninguno</button>
      </div>

      {notasActivas > 0 && (
        <p role="note" className="flex items-start gap-2 rounded-xl bg-[var(--data-warning-50)] px-3 py-2 text-sm text-[var(--data-warning-ink)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Ya hay {notasActivas} nota{notasActivas === 1 ? "" : "s"} sobre esta venta: revisa que no acrediten las mismas unidades.
        </p>
      )}

      <div className="divide-y divide-[var(--rule-soft)] overflow-hidden rounded-xl border border-[var(--rule-base)]">
        {lineas.map((l, i) => {
          const q = cantidades[i] ?? 0;
          return (
            <div key={`${l.productId}-${i}`} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 p-3", q > 0 && "bg-primary/5")}>
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">{l.nombre}</p>
                <p className="text-sm text-[var(--text-tertiary)]">
                  {l.vendidas} vendida{l.vendidas === 1 ? "" : "s"} × {formatCurrency(l.precioCobrado)}
                  {l.precioCobrado < l.precioLista && ` (lista ${formatCurrency(l.precioLista)})`}
                  {l.devueltasEnCaja > 0 && ` · ${l.devueltasEnCaja} devuelta${l.devueltasEnCaja === 1 ? "" : "s"} en Caja`}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" aria-label={`Una menos de ${l.nombre}`} disabled={q <= 0} onClick={() => setCantidad(i, q - 1)} className={PASO}>
                  <Minus className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
                </button>
                <span className="w-8 text-center text-sm font-bold text-[var(--text-primary)]" aria-live="polite">{q}</span>
                <button type="button" aria-label={`Una más de ${l.nombre}`} disabled={q >= l.vendidas} onClick={() => setCantidad(i, q + 1)} className={PASO}>
                  <Plus className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
                </button>
              </div>
              <span className={cn("w-20 text-right text-sm font-bold", q > 0 ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]")}>
                {formatCurrency(q * l.precioCobrado)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
