"use client";

import { LoadingState } from "@buleje/design-system";
import { Search, Package } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { VENTAS_A_REVISAR, fmt, fmtDate } from "@/components/admin/pos/devolucion/devolucion-shared";
import type { Devolucion } from "@/components/admin/pos/devolucion/use-devolucion";

/** Paso 1: ventas de hoy o búsqueda por N° de boleta. */
export default function DevolucionPasoBuscar({ dev }: { dev: Devolucion }) {
  const { searchQuery, setSearchQuery, handleSearch, loading, sales, selectSale, errorVentas, reintentarVentas } = dev;
  return (
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSearch()}
                    placeholder="N° de boleta, cliente o producto…"
                    className="w-full pl-9 pr-3 h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleSearch}
                  className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-colors"
                >
                  Buscar
                </button>
              </div>

              <div className="flex items-center gap-1">
                <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                  {searchQuery ? "Resultados" : "Ventas de hoy"}
                </p>
                <InfoTip
                  ariaLabel="Cómo buscar la venta"
                  what="Elige la venta de la que vuelve la mercadería."
                  example={`Escribe el N° de la boleta (los 8 primeros caracteres, como «a1b2c3d4»), el nombre o teléfono del cliente o un producto («leche») y presiona Enter. Se revisan las últimas ${VENTAS_A_REVISAR} ventas.`}
                />
              </div>

              {loading ? (
                <LoadingState />
              ) : errorVentas ? (
                <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/10 p-3">
                  <p className="text-sm font-bold text-[var(--data-error-500)]">No se pudieron traer las ventas.</p>
                  <button
                    type="button"
                    onClick={searchQuery.trim() ? handleSearch : reintentarVentas}
                    className="h-9 shrink-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
                  >
                    Reintentar
                  </button>
                </div>
              ) : sales.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-2" />
                  <p className="text-sm text-[var(--text-tertiary)]">{searchQuery.trim() ? "Ninguna venta coincide" : "Todavía no hay ventas hoy"}</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {sales.map(sale => (
                    <button
                      key={sale.id}
                      onClick={() => selectSale(sale)}
                      className="w-full text-left p-3 rounded-xl border border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)] transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-[var(--text-primary)]">
                            #{sale.id.slice(0, 8)}
                          </p>
                          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{fmtDate(sale.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-extrabold text-primary">{fmt(sale.total)}</p>
                          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] capitalize">{sale.payment}</p>
                        </div>
                      </div>
                      {sale.items && sale.items.length > 0 && (
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-1 truncate">
                          {sale.items.map(i => `${i.quantity}x ${i.name}`).join(", ")}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
  );
}
