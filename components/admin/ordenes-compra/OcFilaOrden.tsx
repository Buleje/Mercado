"use client";

import { Trash2, ChevronDown, ChevronUp, Package, PackageCheck, Copy, Calendar, Repeat, Hash, Truck } from "@buleje/design-system/icons";
import type { DbPurchaseOrder, DbSupplier, PurchaseStatus } from "@/lib/jsondb";
import { opcionesDeEstado } from "@/lib/compras/estados-oc";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import OCPDFExport from "@/components/admin/compras/OCPDFExport";
import { STATUS_LABELS, STATUS_COLORS, OCProgressBar } from "@/components/admin/ordenes-compra/oc-compartido";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";
import OcDetalleOrden from "@/components/admin/ordenes-compra/OcDetalleOrden";

/** Una orden de la lista. Pieza de PurchaseOrdersTab: recibe `useOrdenesCompra` entero. */
export default function OcFilaOrden({ oc, o, supplier, isExpanded }: { oc: OrdenesCompra; o: DbPurchaseOrder; supplier: DbSupplier | undefined; isExpanded: boolean }) {
  const {
    setExpanded, setRecepcionOC, setShowRecurringModal, setRecurringInterval, setRecurringNotifyDays,
    updateStatus, deleteOrder, duplicateOrder,
  } = oc;
  return (
    <>
      <div
        key={o.id}
        id={`oc-${o.id}`}
        className={cn(
          "scroll-mt-24 bg-[var(--surface-raised)] border-2 rounded-2xl overflow-hidden transition-all",
          isExpanded ? "border-primary/40 ring-2 ring-primary/15 shadow-sm" : "border-[var(--rule-base)] hover:border-[var(--text-tertiary)]",
        )}
      >
        <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-4">
          {/* Avatar + datos principales */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="inline-flex items-center justify-center h-11 w-11 rounded-xl bg-primary/10 shrink-0">
              <Truck className="h-5 w-5 text-primary" strokeWidth={2.2} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-base font-extrabold text-[var(--text-primary)] truncate">
                  {o.supplierName}
                </p>
                <span className={cn("inline-flex items-center gap-1 h-6 px-2 rounded-lg text-xs font-bold border", STATUS_COLORS[o.status])}>
                  {STATUS_LABELS[o.status]}
                </span>
              </div>
              <div className="flex items-center gap-3 flex-wrap mt-1.5 text-xs text-[var(--text-secondary)] font-medium">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                  {formatDate(o.createdAt)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Package className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                  {o.items.length} producto{o.items.length !== 1 ? "s" : ""}
                </span>
                {supplier?.ruc && (
                  <span className="inline-flex items-center gap-1">
                    <Hash className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                    {supplier.ruc}
                  </span>
                )}
              </div>
              {/* Progress bar visual */}
              <div className="mt-3">
                <OCProgressBar status={o.status} />
              </div>
              {o.notes && (
                <p className="text-xs text-[var(--text-tertiary)] mt-2 italic line-clamp-1">{o.notes}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Total</p>
              <p className="text-2xl font-extrabold text-primary tabular-nums leading-none mt-0.5">
                {formatCurrency(Number(o.total))}
              </p>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap items-center gap-2 shrink-0 lg:border-l-2 lg:border-[var(--rule-soft)] lg:pl-4">
            {/* Sólo los estados a los que esta orden puede ir de verdad.
                Una orden recibida no tiene destinos: el select queda
                deshabilitado en vez de ofrecer cambios que el servidor
                rechaza. */}
            {(() => {
              const destinos = opcionesDeEstado(o.status);
              const cerrada = destinos.length <= 1;
              return (
                <select
                  value={o.status}
                  onChange={(e) => updateStatus(o.id, e.target.value as PurchaseStatus)}
                  aria-label="Cambiar estado"
                  disabled={cerrada}
                  title={cerrada ? `Una orden ${STATUS_LABELS[o.status].toLowerCase()} ya no cambia de estado` : "Cambiar estado"}
                  className="h-10 px-3 rounded-xl border border-[var(--rule-base)] text-sm font-bold bg-[var(--surface-raised)] text-[var(--text-primary)] outline-none focus:border-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {destinos.map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              );
            })()}
            {(o.status === "pendiente" || o.status === "parcial") && (
              <button
                type="button"
                onClick={() => setRecepcionOC(o)}
                className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl bg-[var(--accent-dark)] text-white text-sm font-semibold hover:brightness-110 transition-colors shadow-sm"
                title="Registrar recepción"
              >
                <PackageCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Recibir</span>
              </button>
            )}
            <OCPDFExport oc={o} supplier={supplier} />
            <button
              type="button"
              onClick={() => duplicateOrder(o)}
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--rule-base)] text-sm font-semibold transition-colors"
              title="Duplicar orden"
            >
              <Copy className="h-4 w-4" />
              <span className="hidden md:inline">Duplicar</span>
            </button>
            {(o.status === "recibido" || o.status === "parcial") && (
              <button
                type="button"
                onClick={() => { setShowRecurringModal(o); setRecurringInterval(15); setRecurringNotifyDays(2); }}
                className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/10 text-sm font-semibold transition-colors"
                title="Hacer pedido recurrente"
              >
                <Repeat className="h-4 w-4" />
                <span className="hidden md:inline">Recurrente</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setExpanded(isExpanded ? null : o.id)}
              aria-label={isExpanded ? "Colapsar detalle" : "Ver detalle"}
              aria-expanded={isExpanded}
              className="inline-flex items-center justify-center h-10 w-10 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
            >
              {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={() => deleteOrder(o.id)}
              aria-label="Eliminar orden"
              className="inline-flex items-center justify-center h-10 w-10 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/10 transition-colors"
              title="Eliminar"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <OcDetalleOrden oc={oc} o={o} />
      </div>
    </>
  );
}
