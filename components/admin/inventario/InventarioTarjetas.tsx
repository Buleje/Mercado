"use client";

import { Package, RefreshCw, Pencil, Trash2, BookOpen, Sliders } from "@buleje/design-system/icons";
import EmptyState from "@/components/admin/shared/EmptyState";
import StatusBadge from "@/components/admin/shared/StatusBadge";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { StockLevelBar } from "@/components/admin/inventario/StockLevelBar";
import ImageWarningBadge from "@/components/admin/inventario/ImageWarningBadge";
import { categories } from "@/data/products";
import { Paginator } from "@/hooks/use-pagination";
import { formatCurrency } from "@/lib/format";
import { ChipsDeFiltros } from "@/components/admin/shared/filtros-columna";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

/** Chips de filtros de columna y la vista en tarjetas. Pieza de InventoryTab: recibe `useInventario` entero. */
export default function InventarioTarjetas({ inv }: { inv: Inventario }) {
  const {
    products, setCatFilter, setEstadoFiltro, setStockRango, setVencRango, viewMode, setKardexProduct,
    setModifiersProduct, openEditModal, toggleActive, deleteProduct, isLowStock, topRentables,
    filteredProducts, chipsDeColumna, quitarChip, pgProducts,
  } = inv;
  return (
    <>
      <ChipsDeFiltros
        chips={chipsDeColumna}
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
          const cat = categories.find(c => c.id === p.category);
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
                onClick={() => toggleActive(p)}
                title={p.active ? "Activo — toca para desactivar" : "Inactivo — toca para activar"}
                className={cn(
                  "absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold transition-colors",
                  p.active
                    ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] hover:brightness-95"
                    : "bg-[var(--surface-sunken)] dark:bg-accent text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--rule-soft)]"
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", p.active ? "bg-[var(--data-success-500)]" : "bg-[var(--text-tertiary)]")} />
                {p.active ? "Activo" : "Inactivo"}
              </button>

              {/* Cabecera: imagen + nombre (protagonista) + precio */}
              <div className="flex items-start gap-3 pr-20">
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
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--accent)]">Servicio</span>
                    )}
                    {topRentables.includes(p.id) && (
                      <StatusBadge variant="success" label="Alta rentabilidad" size="sm" />
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)] dark:text-muted">{cat?.label ?? p.category} · {p.unit}</p>
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-base font-extrabold text-primary">{formatCurrency(Number(p.price))}</span>
                    {p.costPrice && <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">costo {formatCurrency(Number(p.costPrice))}</span>}
                    {p.badge && <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">{p.badge}</span>}
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
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-semibold text-[var(--text-tertiary)] dark:text-muted" title="Este producto no gestiona inventario">
                    <RefreshCw className="h-3 w-3" /> No controla stock
                  </span>
                )}
              </div>

              {/* Acciones — fila horizontal ordenada (Editar protagonista + secundarias) */}
              <div className="mt-3 flex items-center gap-1.5 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] pt-3">
                <button onClick={() => openEditModal(p)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-alt)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] dark:text-muted transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary" title="Editar producto">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                <button onClick={() => setKardexProduct({ id: p.id, name: p.name })} title="Ver Kardex (movimientos)" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-alt)] text-[var(--text-secondary)] dark:text-muted transition-colors hover:bg-primary/10 hover:text-[var(--data-success-500)]">
                  <BookOpen className="h-4 w-4" />
                </button>
                <button onClick={() => setModifiersProduct({ id: p.id, name: p.name })} title="Modificadores (cremas, adicionales, talla)" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-alt)] text-[var(--text-secondary)] dark:text-muted transition-colors hover:bg-primary/10 hover:text-[var(--accent)]">
                  <Sliders className="h-4 w-4" />
                </button>
                <button onClick={() => deleteProduct(p.id)} title="Eliminar producto" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-alt)] text-[var(--text-secondary)] dark:text-muted transition-colors hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-500)]">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {p.barcode && <p className="mt-2 font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">#{p.barcode}</p>}
            </div>
          );
        })}
        {filteredProducts.length === 0 && (
          <EmptyState
            illustration={products.length === 0 ? "products" : "search"}
            title={products.length === 0 ? "Sin inventario" : "Sin resultados"}
            description={products.length === 0 ? "Agrega productos y registra movimientos de stock." : "Prueba con otro filtro o busqueda."}
          />
        )}
        <Paginator page={pgProducts.page} totalPages={pgProducts.totalPages} total={pgProducts.total} pageSize={pgProducts.pageSize} onPage={pgProducts.setPage} onPageSize={pgProducts.setPageSize} />
      </div>
    </>
  );
}
