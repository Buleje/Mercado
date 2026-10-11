"use client";

import { DataTable } from "@buleje/design-system";
import EmptyState from "@/components/admin/shared/EmptyState";
import { cn } from "@/lib/utils";
import { Paginator } from "@/hooks/use-pagination";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";
import InventarioFilasTabla from "@/components/admin/inventario/InventarioFilasTabla";

/** Tabla de productos (cabecera ordenable). Pieza de InventoryTab: recibe `useInventario` entero. */
export default function InventarioTabla({ inv }: { inv: Inventario }) {
  const {
    products, viewMode, selectedIds, showExtendedCols, orden, verColumnaCosto, filteredProducts, pgProducts,
    toggleSelectAll,
  } = inv;
  return (
    <>
      {/* Desktop table — UX Mejora 18: Sticky header. Oculta cuando viewMode==="cards". */}
      <div className={cn(
        viewMode === "cards" ? "hidden" : "hidden sm:block"
      )}>
        <div className="max-h-[65vh] overflow-y-auto">
          {/* Encabezados a 14 px y sin versalitas (el DataTable los trae a 12). Sin
              selects adentro: repetían Categoría/Stock/Estado de la fila de
              filtros y de «Filtros» (10-10). */}
          <DataTable stickyHeader className="min-w-[600px]">
            <thead ref={orden.refCabecera}>
              <tr>
                <th className="w-10">
                  <input type="checkbox" aria-label="Seleccionar todos" checked={filteredProducts.length > 0 && selectedIds.size === filteredProducts.length} onChange={toggleSelectAll} className="rounded border-[var(--rule-base)] text-primary focus:ring-primary" />
                </th>
                <EnOrden
                  orden={orden.orden}
                  celdas={{
                    img: <th data-col="img" className="w-12">Foto</th>,
                    producto: <th data-col="producto">Producto</th>,
                    categoria: <th data-col="categoria">Categoría</th>,
                    precio: <th data-col="precio">Precio</th>,
                    historial: <th data-col="historial" className={cn(!showExtendedCols && "hidden")}>Historial</th>,
                    badge: <th data-col="badge" className={cn(!showExtendedCols && "hidden")}>Badge</th>,
                    stock: <th data-col="stock">Stock</th>,
                    costoProm: <th data-col="costoProm" className={cn(!verColumnaCosto && "hidden")} title="Lo que te cuesta cada unidad; con él sale el margen. Enter guarda, Esc cancela">Costo</th>,
                    rotacion: <th data-col="rotacion" className={cn(!showExtendedCols && "hidden")}>Rotación</th>,
                    cambio30d: <th data-col="cambio30d" className={cn(!showExtendedCols && "hidden")}>Cambio 30d</th>,
                    vence: <th data-col="vence" className={cn(!showExtendedCols && "hidden")}>Vence</th>,
                    estado: <th data-col="estado">Estado</th>,
                  }}
                />
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <InventarioFilasTabla inv={inv} />
            </tbody>
          </DataTable>
        </div>
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
