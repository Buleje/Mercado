"use client";

import { Package, RefreshCw } from "@buleje/design-system/icons";
import EmptyState from "@/components/admin/shared/EmptyState";
import StatusBadge from "@/components/admin/shared/StatusBadge";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { StockLevelBar } from "@/components/admin/inventario/StockLevelBar";
import ImageWarningBadge from "@/components/admin/inventario/ImageWarningBadge";
import { Paginator } from "@/hooks/use-pagination";
import { formatCurrency } from "@/lib/format";
import CostoEnFila from "@/components/admin/inventario/CostoEnFila";
import { ChipsDeFiltros } from "@/components/admin/shared/filtros-columna";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";
import InventarioAccionesProducto from "@/components/admin/inventario/InventarioAccionesProducto";

/** Chips de filtros de columna y la vista en tarjetas. Pieza de InventoryTab: recibe `useInventario` entero. */
export default function InventarioTarjetas({ inv }: { inv: Inventario }) {
  const {
    products, setCatFilter, setEstadoFiltro, setStockRango, setVencRango, viewMode, toggleActive,
    isLowStock, topRentables, filteredProducts, chipsDeColumna, quitarChip, pgProducts, guardarCosto,
    verColumnaCosto, catLabelOf,
  } = inv;
  return (
    <>
      <ChipsDeFiltros
        chips={chipsDeColumna.filter(c => c.id !== "categoria")}
        onQuitar={quitarChip}
        onLimpiarTodo={() => { setCatFilter([]); setEstadoFiltro(["Activo"]); setStockRango({ min: null, max: null }); setVencRango({ min: null, max: null }); }}
      />
      {/* Cards view — siempre en mobile, opcional en desktop via viewMode */}
      <div className={cn(
        "grid grid-cols-1 gap-3",
        viewMode === "cards"
          ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          : "sm:hidden"
      )}>
        {pgProducts.items.map(p => {
          const lowStock = isLowStock(p);
          return (
            <div
              key={p.id}
              className={cn(
                "group relative flex flex-col rounded-2xl border bg-[var(--surface-raised)] p-4 transition-all hover:shadow-[var(--shadow-sm)]",
                !p.active && "opacity-70 bg-[var(--surface-canvas)]",
                lowStock ? "border-[var(--data-warning-500)]/60" : "border-[var(--rule-base)] dark:border-[var(--rule-base)]"
              )}
            >
              {/* Estado — pill clickeable arriba a la derecha (uno solo para activo/inactivo) */}
              <button
                type="button"
                onClick={() => toggleActive(p)}
                aria-label={`${p.name}: ${p.active ? "activo, toca para desactivar" : "inactivo, toca para activar"}`}
                title={p.active ? "Activo — toca para desactivar" : "Inactivo — toca para activar"}
                className={cn(
                  "absolute right-2 top-2 z-10 inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-bold transition-colors",
                  p.active
                    ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] hover:brightness-95"
                    : "bg-[var(--surface-sunken)] dark:bg-accent text-[var(--text-secondary)] hover:bg-[var(--rule-soft)]"
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", p.active ? "bg-[var(--data-success-500)]" : "bg-[var(--text-tertiary)]")} />
                {p.active ? "Activo" : "Inactivo"}
              </button>

              {/* Cabecera: imagen + nombre (protagonista) + precio */}
              <div className="flex items-start gap-3 pr-24">
                {p.image ? (
                  <span className="relative inline-block shrink-0">
                    <Image src={p.image} alt={p.name} width={56} height={56} unoptimized={p.image.startsWith("data:")} className="h-14 w-14 rounded-xl object-cover border border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-alt)] " />
                    <ImageWarningBadge image={p.image} size="md" />
                  </span>
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                    <Package className="h-6 w-6 text-primary/40" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-bold text-sm leading-tight text-[var(--text-primary)] dark:text-[var(--text-primary)] line-clamp-2">{p.name}</p>
                    {p.type === "service" && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-sm font-bold uppercase tracking-wide text-[var(--accent-ink)] dark:text-[var(--accent)]">Servicio</span>
                    )}
                    {topRentables.includes(p.id) && (
                      <StatusBadge variant="success" label="Alta rentabilidad" size="sm" />
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-[var(--text-tertiary)]">{catLabelOf(p.category)} · {p.unit}</p>
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-base font-extrabold text-primary">{formatCurrency(Number(p.price))}</span>
                    {verColumnaCosto && p.type !== "service" ? (
                      <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)]">
                        costo <CostoEnFila productId={p.id} nombre={p.name} costPrice={p.costPrice} guardar={guardarCosto} />
                      </span>
                    ) : p.costPrice ? <span className="text-sm text-[var(--text-tertiary)]">costo {formatCurrency(Number(p.costPrice))}</span> : null}
                    {p.badge && <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">{p.badge}</span>}
                  </div>
                </div>
              </div>

              {/* Stock — compacto, deja respirar */}
              <div className="mt-3">
                {p.stock !== undefined ? (
                  <StockLevelBar
                    variant="compact"
                    stock={p.stock}
                    stockMin={p.stockMin}
                    stockMax={p.stockMax}
                    unit={p.unit}
                  />
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-sm font-semibold text-[var(--text-tertiary)]" title="Este producto no gestiona inventario">
                    <RefreshCw className="h-3 w-3" /> No controla stock
                  </span>
                )}
              </div>

              {/* Editar a la vista y el resto en el ⋯ (las mismas acciones que la fila de la tabla). */}
              <div className="mt-3 border-t border-[var(--rule-soft)] pt-3 dark:border-[var(--rule-base)]">
                <InventarioAccionesProducto inv={inv} p={p} variante="tarjeta" />
              </div>

              {p.barcode && <p className="mt-2 font-mono text-sm text-[var(--text-tertiary)]">#{p.barcode}</p>}
            </div>
          );
        })}
        {filteredProducts.length === 0 && (
          <EmptyState
            illustration={products.length === 0 ? "products" : "search"}
            title={products.length === 0 ? "Sin inventario" : "Sin resultados"}
            description={products.length === 0 ? "Agrega productos y registra movimientos de stock." : "Prueba con otro filtro o búsqueda."}
          />
        )}
        <Paginator page={pgProducts.page} totalPages={pgProducts.totalPages} total={pgProducts.total} pageSize={pgProducts.pageSize} onPage={pgProducts.setPage} onPageSize={pgProducts.setPageSize} />
      </div>
    </>
  );
}
