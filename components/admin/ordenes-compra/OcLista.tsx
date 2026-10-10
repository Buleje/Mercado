"use client";

import { CardTitle } from "@buleje/design-system";
import { Plus, X, ShoppingBag, ChevronLeft, ChevronRight } from "@buleje/design-system/icons";
import { POR_PAGINA } from "@/hooks/use-filtros-ordenes-compra";
import TableSkeleton from "@/components/admin/shared/TableSkeleton";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";
import OcFilaOrden from "@/components/admin/ordenes-compra/OcFilaOrden";

/** Lista de órdenes con paginación. Pieza de PurchaseOrdersTab: recibe `useOrdenesCompra` entero. */
export default function OcLista({ oc }: { oc: OrdenesCompra }) {
  const {
    loading, expanded, setShowCreate, suppliers, f, filteredOrders,
  } = oc;
  return (
    <>
      {/* ─── Orders list ─────────────────────────────────────────────── */}
      {loading ? (
        <TableSkeleton rows={4} cols={5} className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl" />
      ) : filteredOrders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)]/40 px-6 py-14 text-center">
          <span className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-4">
            <ShoppingBag className="h-8 w-8 text-primary" strokeWidth={2.2} />
          </span>
          {/* Buscar sin resultados no es lo mismo que no tener órdenes: en el
              primer caso ofrecer "crear la primera" desorienta. */}
          <CardTitle className="text-[length:var(--ts-xl)] font-bold">
            {f.hayFiltros ? "Ninguna orden coincide" : "Sin órdenes de compra"}
          </CardTitle>
          <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-md mx-auto">
            {f.hayFiltros
              ? "Prueba con otro texto, amplía el rango de fechas o saca los filtros."
              : "Lleva registro de lo que pides a tus proveedores: fechas, cantidades, costos. Después puedes duplicar pedidos frecuentes o hacerlos recurrentes."}
          </p>
          {f.hayFiltros ? (
            <button
              type="button"
              onClick={f.limpiar}
              className="mt-5 inline-flex items-center gap-2 h-12 px-5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--text-primary)] transition-colors"
            >
              <X className="h-5 w-5" strokeWidth={2.5} />
              Limpiar filtros
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-5 inline-flex items-center gap-2 h-12 px-5 rounded-2xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors shadow-sm"
            >
              <Plus className="h-5 w-5" strokeWidth={2.5} />
              Crear primera orden
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((o) => {
            const supplier = suppliers.find(s => s.id === o.supplierId);
            const isExpanded = expanded === o.id;
            return (
            <OcFilaOrden key={o.id} oc={oc} o={o} supplier={supplier} isExpanded={isExpanded} />
            );
          })}

          {/* ─── Paginación ──────────────────────────────────────────── */}
          {f.totalPaginas > 1 && (
            <nav
              aria-label="Páginas de órdenes"
              className="flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3"
            >
              <p className="text-sm font-bold text-[var(--text-secondary)]">
                Mostrando {(f.pagina - 1) * POR_PAGINA + 1}–{Math.min(f.pagina * POR_PAGINA, f.filtradas.length)} de {f.filtradas.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => f.setPagina(f.pagina - 1)}
                  disabled={f.pagina <= 1}
                  className="inline-flex items-center gap-1.5 h-11 px-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </button>
                <span className="text-sm font-extrabold text-[var(--text-primary)] tabular-nums px-2">
                  {f.pagina} / {f.totalPaginas}
                </span>
                <button
                  type="button"
                  onClick={() => f.setPagina(f.pagina + 1)}
                  disabled={f.pagina >= f.totalPaginas}
                  className="inline-flex items-center gap-1.5 h-11 px-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </nav>
          )}
        </div>
      )}
    </>
  );
}
