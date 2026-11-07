"use client";

import { ArrowRight, Package } from "@buleje/design-system/icons";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import { proximoPaso, soles, valorItem, type Devolucion } from "./tipos";

const ROTULO = "mb-1 text-sm font-medium text-[var(--text-secondary)]";

/** Lo que se ve al abrir una devolución: qué toca ahora, los ítems con su costo y las notas. */
export function DetalleDevolucion({ dev }: { dev: Devolucion }) {
  return (
    <div className="space-y-3 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]/50 px-4 py-3">
      {/* C53: la siguiente acción, dicha; no hay que adivinarla por el estado. */}
      <p className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
        <span><strong>Próximo paso:</strong> {proximoPaso(dev)}</span>
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className={ROTULO}>Motivo</p>
          <p className="text-sm text-[var(--text-primary)]">{dev.motivo}</p>
        </div>
        {dev.notas && (
          <div>
            <p className={ROTULO}>Notas</p>
            {/* El origen, la anulación y la vuelta al almacén van en líneas propias. */}
            <p className="whitespace-pre-line text-sm text-[var(--text-secondary)]">{dev.notas}</p>
          </div>
        )}
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-[var(--text-secondary)]">Items devueltos</p>
        <div className="space-y-1">
          {dev.items.map((item, i) => {
            const valor = valorItem(item);
            return (
              <div key={item.id ?? i} className="flex flex-wrap items-center gap-x-2 text-sm">
                <Package className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                <span className="min-w-0 flex-1 text-[var(--text-primary)]">
                  {/* Sin productId el ítem es texto libre (ADR-379): no hay ficha a la que ir. */}
                  <EnlacePanel cosa="producto" id={item.productId != null ? String(item.productId) : null} apariencia="heredada">{item.nombre}</EnlacePanel>
                </span>
                <span className="font-medium tabular-nums text-[var(--text-primary)]">{item.cantidad} {item.unidad}</span>
                <span className={valor != null ? "w-28 text-right tabular-nums text-[var(--text-secondary)]" : "w-28 text-right font-semibold text-[var(--data-warning-ink)]"}>
                  {valor != null ? `${soles(Number(item.precioUnitario))} c/u` : "sin costo"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
