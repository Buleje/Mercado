"use client";

import { Plus, X, Calendar, Repeat, Pause, Play, ChevronDown } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";

/** Pedidos recurrentes próximos. Pieza de PurchaseOrdersTab: recibe `useOrdenesCompra` entero. */
export default function OcRecurrentes({ oc }: { oc: OrdenesCompra }) {
  const {
    upcomingRecurring, pausados, removeRecurring, generarDesdeRecurrente, cambiarActivo,
  } = oc;
  return (
    <>
      {/* ─── Mejora 15: cards de pedidos recurrentes (+ los pausados, para activarlos) ─── */}
      {(upcomingRecurring.length > 0 || pausados.length > 0) && (
        <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-primary/10 shrink-0">
              <Repeat className="h-4 w-4 text-primary" strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-[var(--text-primary)]">
                {upcomingRecurring.length === 0
                  ? "Pedidos recurrentes"
                  : `${upcomingRecurring.length} pedido${upcomingRecurring.length > 1 ? "s" : ""} recurrente${upcomingRecurring.length > 1 ? "s" : ""} programado${upcomingRecurring.length > 1 ? "s" : ""}`}
              </p>
              {(() => {
                const tocan = upcomingRecurring.filter(r => r.daysUntil <= r.notifyDaysBefore).length;
                if (tocan === 0) return null;
                return (
                  <p className="text-xs font-bold text-[var(--data-warning-ink)]">
                    {tocan === 1 ? "1 toca pedirlo ahora" : `${tocan} tocan pedirlos ahora`}
                  </p>
                );
              })()}
            </div>
            <InfoTip
              title="Pedidos recurrentes"
              what={<span>Cada tantos días te avisa y arma la orden con los mismos productos. Pausado, no avisa ni se pide.</span>}
              example={<span>Una plantilla que guardaste en Punto de compra aparece en «Pausados»: actívala y se repite cada 15 días.</span>}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {upcomingRecurring.map(r => {
              const dueToday = r.daysUntil === 0 || r.vencido;
              // Acá es donde `notifyDaysBefore` por fin significa algo: cada
              // recurrencia se pone en amarillo según SU propio umbral, no
              // según un 3 fijo que ignoraba lo que el usuario configuró.
              const dueSoon = r.daysUntil <= r.notifyDaysBefore;
              return (
                <div
                  key={r.id}
                  className={cn(
                    "rounded-2xl border-2 p-4 bg-[var(--surface-raised)] transition-all",
                    dueToday ? "border-[var(--data-error-500)]/50 ring-2 ring-[var(--data-error-500)]/20" : dueSoon ? "border-[var(--data-warning-500)]/40" : "border-[var(--rule-base)]",
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">OC a</p>
                      <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                        <EnlacePanel cosa="proveedor" id={r.supplierId} apariencia="heredada">{r.supplierName}</EnlacePanel>
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        {r.items.length} producto{r.items.length === 1 ? "" : "s"} · {formatCurrency(r.items.reduce((s, i) => s + i.quantity * i.unitCost, 0))}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => void cambiarActivo(r, false)}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
                        title="Pausar: no avisa ni se pide hasta que lo actives"
                        aria-label="Pausar pedido recurrente"
                      >
                        <Pause className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRecurring(r.id)}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-500)] transition-colors"
                        title="Eliminar recurrencia"
                        aria-label="Eliminar pedido recurrente"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-bold border",
                      dueToday
                        ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 text-[var(--data-error-500)] border-[var(--data-error-500)]/30"
                        : dueSoon
                        ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/15 text-[var(--data-warning-ink)] border-[var(--data-warning-500)]/30"
                        : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border-[var(--rule-base)]",
                    )}>
                      <Calendar className="h-3.5 w-3.5" />
                      {r.vencido ? "Atrasado" : dueToday ? "Hoy" : r.daysUntil === 1 ? "Mañana" : `En ${r.daysUntil} días`}
                    </span>
                    <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-semibold bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
                      <Repeat className="h-3 w-3" />
                      Cada {r.intervalDays}d
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => generarDesdeRecurrente(r.id)}
                    className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Crear OC ahora
                  </button>
                </div>
              );
            })}
          </div>
          {/* Pausados: las plantillas de Punto de compra nacen así. Antes no se veían acá y no había
              cómo activarlas (09-10). Plegado: es lo que menos se mira. */}
          {pausados.length > 0 && (
            <details className="group rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
              <summary className="flex items-center gap-2 min-h-11 px-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
                Pausados ({pausados.length})
              </summary>
              <ul className="divide-y divide-[var(--rule-soft)] border-t border-[var(--rule-soft)]">
                {pausados.map(r => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[var(--text-primary)] truncate">{r.notes || r.supplierName}</p>
                      <p className="text-xs text-[var(--text-secondary)] truncate">
                        {r.notes && (
                          <>
                            <EnlacePanel cosa="proveedor" id={r.supplierId} apariencia="heredada">{r.supplierName}</EnlacePanel>
                            {" · "}
                          </>
                        )}
                        {r.items.length} producto{r.items.length === 1 ? "" : "s"} · {formatCurrency(r.items.reduce((s, i) => s + i.quantity * i.unitCost, 0))} · cada {r.intervalDays} días
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void cambiarActivo(r, true)}
                      className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors"
                      aria-label={`Activar ${r.notes || r.supplierName}`}
                    >
                      <Play className="h-4 w-4" aria-hidden />
                      Activar
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRecurring(r.id)}
                      className="h-11 w-11 inline-flex items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-500)] transition-colors"
                      title="Eliminar"
                      aria-label={`Eliminar ${r.notes || r.supplierName}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </>
  );
}
