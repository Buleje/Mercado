"use client";

import { DataTable } from "@buleje/design-system";
import { Package } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { calculateSuggestedQty, needsReorder } from "@/lib/types/purchases";
import { naturalezaDe } from "@/lib/compras/naturaleza";
import PuntoCompraProductCard from "@/components/admin/pos/PuntoCompraProductCard";
import type { CompraCatalogo } from "./use-compra-catalogo";
import type { CompraCarrito } from "./use-compra-carrito";

/** Columna de productos del inventario: cuadrícula o lista, vacío y paginación. */
export default function CompraProductos({ catalogo, carrito }: { catalogo: CompraCatalogo; carrito: CompraCarrito }) {
  const { showInventario, setShowInventario, needsReorderCount, setSoloReponer, loading, viewMode, paginatedProducts, filtered, totalPages, page, setPage } = catalogo;
  const { cartMap, addToCart } = carrito;
  return (
    <div className="flex-1 min-w-0">
      {/* Audit 2026-05-17: oculto si el toggle "Mostrar inventario" está OFF.
          El usuario puede agregar gastos via el catálogo de arriba sin ver
          productos de inventario que no quiera comprar. */}
      {!showInventario ? (
        <div className="bg-[var(--surface-sunken)] border border-dashed border-[var(--rule-base)] rounded-xl p-6 text-center">
          <Package className="h-8 w-8 mx-auto text-[var(--text-tertiary)] mb-2" strokeWidth={1.5} />
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {needsReorderCount > 0
              ? `${needsReorderCount} bajo el mínimo`
              : "Inventario oculto"}
          </p>
          {/* Antes esto mandaba a buscar un toggle que estaba en otra parte
              de la pantalla. La acción va acá, donde se necesita. */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {needsReorderCount > 0 && (
              <button
                type="button"
                onClick={() => { setShowInventario(true); setSoloReponer(true); }}
                className={button({ variant: "primary", className: "gap-2 rounded-xl px-4" })}
              >
                Ver los {needsReorderCount} que faltan
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowInventario(true)}
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors"
            >
              Ver todo el inventario
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className="h-40 rounded-xl bg-[var(--surface-sunken)] animate-pulse"
            />
          ))}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {paginatedProducts.map((p) => {
            const inCartQty = cartMap.get(p.id) ?? 0;
            return (
              <div
                key={p.id}
                className={cn(
                  "rounded-xl transition-all",
                  inCartQty > 0 && "ring-2 ring-primary ring-offset-1",
                )}
              >
                <PuntoCompraProductCard
                  product={p}
                  inCart={inCartQty}
                  onAdd={addToCart}
                />
              </div>
            );
          })}
        </div>
      ) : (
        /* Vista lista */
        <div className="overflow-x-auto -mx-1">
        <div className="border border-[var(--rule-base)] rounded-xl overflow-hidden">
          <DataTable className="w-full">
            <thead>
              <tr>
                <th>
                  Producto
                </th>
                <th className="text-right">
                  Costo
                </th>
                <th className="text-right">
                  Stock
                </th>
                <th className="text-right">
                  Sugerido
                </th>
                <th aria-label="Acción" />
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.map((p) => {
                const needs = needsReorder(p);
                // Servicio o alquiler (C01): sin «REPONER», sin stock ni sugerido; se pide por su unidad de cobro.
                const nat = naturalezaDe(p);
                const servicio = nat.naturaleza !== "inventario";
                const sug = servicio ? 1 : calculateSuggestedQty(p);
                const unidad = servicio ? nat.unidad : p.unit || "und";
                return (
                  <tr
                    key={p.id}
                   
                  >
                    <td>
                      <div className="flex items-center gap-2">
                        {needs && (
                          <span className="text-xs font-bold px-1 py-0.5 rounded bg-[var(--data-error-100)] text-[var(--data-error-500)]">
                            REPONER
                          </span>
                        )}
                        {nat.distintivo && (
                          <span className="text-xs font-bold px-1 py-0.5 rounded border border-[var(--rule-base)] text-[var(--text-secondary)]">
                            {nat.distintivo.toUpperCase()}
                          </span>
                        )}
                        <span className="font-medium text-[var(--text-primary)]">
                          {p.name}
                        </span>
                      </div>
                    </td>
                    <td className="text-right font-mono">
                      <span title={`Costo: ${p.costPrice ? formatCurrency(p.costPrice) : "sin cargar"} | Venta: ${formatCurrency(Number(p.price))} | Margen: ${p.costPrice ? ((1 - p.costPrice / p.price) * 100).toFixed(0) : "—"}%`}>
                        {p.costPrice ? formatCurrency(p.costPrice) : <span className="font-sans text-xs text-[var(--text-tertiary)]">sin costo</span>}
                      </span>
                    </td>
                    <td className="text-right text-[var(--text-secondary)]">
                      {servicio ? nat.cobro : <>{p.stock ?? "—"} {p.unit}</>}
                    </td>
                    <td className="text-right text-[var(--accent-ink)] dark:text-[var(--accent)] font-medium">
                      {servicio ? "—" : sug}
                    </td>
                    {/* +1 y «Pedir N» separados (auditoría Compras O02/C02). */}
                    <td className="text-right">
                      <div className="inline-flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => addToCart(p, 1)}
                          aria-label={`Agregar 1 ${unidad} de ${p.name}`}
                          className="h-11 w-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          +1
                        </button>
                        {sug > 1 && (
                          <button
                            type="button"
                            onClick={() => addToCart(p, sug)}
                            aria-label={`Agregar los ${sug} ${unidad} sugeridos de ${p.name}`}
                            className="h-11 whitespace-nowrap px-3 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-dark transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                          >
                            Pedir {sug}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </div>
        </div>
      )}

      {/* Estado vacío */}
      {filtered.length === 0 && !loading && (
        <div className="text-center py-12 text-[var(--text-tertiary)]">
          <Package
            aria-hidden="true"
            className="h-12 w-12 mx-auto mb-3 opacity-30"
          />
          <p className="text-sm">No se encontraron productos</p>
        </div>
      )}

      {/* Paginación — sólo si de verdad hay productos en pantalla. Antes se
          renderizaba igual con el inventario oculto: el cuerpo decía
          «productos ocultos» y el pie «Página 1 de 3 · 56 productos». */}
      {showInventario && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            type="button"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="h-12 px-4 rounded-xl text-sm font-semibold border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] disabled:opacity-40 hover:bg-[var(--surface-sunken)] transition-colors"
          >
            ← Anterior
          </button>
          <span className="text-sm tabular-nums text-[var(--text-secondary)]">
            Página {page} de {totalPages} · {filtered.length} productos
          </span>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="h-12 px-4 rounded-xl text-sm font-semibold border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] disabled:opacity-40 hover:bg-[var(--surface-sunken)] transition-colors"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
