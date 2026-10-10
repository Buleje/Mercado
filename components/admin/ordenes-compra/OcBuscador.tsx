"use client";

import { X, Building2, Search } from "@buleje/design-system/icons";
import { ORDENES_DE_LISTA, type OrdenDeLista } from "@/hooks/use-filtros-ordenes-compra";
import { Field } from "@/components/admin/shared/Field";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";

/** Buscador de órdenes: proveedor, factura, producto y fechas. Pieza de PurchaseOrdersTab: recibe `useOrdenesCompra` entero. */
export default function OcBuscador({ oc }: { oc: OrdenesCompra }) {
  const {
    orders, loading, suppliers, f, selectedSupplierId, setSelectedSupplierId,
  } = oc;
  return (
    <>
      {/* ─── Buscador: por proveedor, factura o producto ─────────────── */}
      {!loading && orders.length > 0 && (
        <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
              <input
                value={f.busqueda}
                onChange={(e) => f.setBusqueda(e.target.value)}
                placeholder="Buscar por proveedor, N° de factura o producto…"
                aria-label="Buscar órdenes de compra"
                className="w-full h-12 pl-10 pr-10 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] outline-none focus:border-primary"
              />
              {f.busqueda && (
                <button
                  type="button"
                  onClick={() => f.setBusqueda("")}
                  aria-label="Borrar búsqueda"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Field label="Desde" labelClassName="sr-only">
              <input
                type="date"
                value={f.desde}
                onChange={(e) => f.setDesde(e.target.value)}
                aria-label="Desde"
                className="h-12 px-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] outline-none focus:border-primary"
              />
            </Field>
            <Field label="Hasta" labelClassName="sr-only">
              <input
                type="date"
                value={f.hasta}
                onChange={(e) => f.setHasta(e.target.value)}
                aria-label="Hasta"
                className="h-12 px-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] outline-none focus:border-primary"
              />
            </Field>
            <div className="relative min-w-[190px]">
              <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
              <select
                value={selectedSupplierId ?? ""}
                onChange={(e) => setSelectedSupplierId(e.target.value || null)}
                aria-label="Filtrar por proveedor"
                className="w-full h-12 pl-10 pr-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-[var(--text-primary)] outline-none focus:border-primary appearance-none cursor-pointer"
              >
                <option value="">Todos los proveedores</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.ruc ? ` (${s.ruc})` : ""}</option>
                ))}
              </select>
            </div>
            <select
              value={f.orden}
              onChange={(e) => f.setOrden(e.target.value as OrdenDeLista)}
              aria-label="Ordenar por"
              className="h-12 px-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-[var(--text-primary)] outline-none focus:border-primary cursor-pointer"
            >
              {ORDENES_DE_LISTA.map(o => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            {f.hayFiltros && (
              <button
                type="button"
                onClick={f.limpiar}
                className="inline-flex items-center gap-1.5 h-12 px-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--data-error-500)] hover:text-[var(--data-error-500)] transition-colors"
              >
                <X className="h-4 w-4" />
                Limpiar
              </button>
            )}
          </div>
          {f.hayFiltros && (
            <p className="text-sm font-bold text-[var(--text-secondary)]">
              {f.filtradas.length === 0
                ? "Ninguna orden coincide con lo que buscas."
                : `${f.filtradas.length} de ${orders.length} ${orders.length === 1 ? "orden" : "órdenes"}`}
            </p>
          )}
        </div>
      )}
    </>
  );
}
