"use client";

import { DataTable } from "@buleje/design-system";
import EmptyState from "@/components/admin/shared/EmptyState";
import { cn } from "@/lib/utils";
import { Paginator } from "@/hooks/use-pagination";
import type { FacetaOpcion, Rango } from "@/lib/admin/filtros-columna";
import { FiltroColumnaMulti, FiltroColumnaRango } from "@/components/admin/shared/filtros-columna";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";
import InventarioFilasTabla from "@/components/admin/inventario/InventarioFilasTabla";

/** Tabla de productos (cabecera ordenable). Pieza de InventoryTab: recibe `useInventario` entero. */
export default function InventarioTabla({ inv }: { inv: Inventario }) {
  const {
    products, catFilter, setCatFilter, estadoFiltro, setEstadoFiltro, stockRango, setStockRango,
    vencRango, setVencRango, viewMode, selectedIds, showExtendedCols, orden, totalProducts,
    activeProducts, dynamicCategories, filteredProducts, pgProducts, toggleSelectAll,
  } = inv;
  return (
    <>
      {/* Desktop table — UX Mejora 18: Sticky header. Oculta cuando viewMode==="cards". */}
      <div className={cn(
        viewMode === "cards" ? "hidden" : "hidden sm:block"
      )}>
        <div className="max-h-[65vh] overflow-y-auto">
          <DataTable stickyHeader filtrable className="min-w-[600px]">
            <thead ref={orden.refCabecera}>
              <tr>
                <th className="w-10">
                  <input type="checkbox" aria-label="Seleccionar todos" checked={filteredProducts.length > 0 && selectedIds.size === filteredProducts.length} onChange={toggleSelectAll} className="rounded border-[var(--rule-base)] text-primary focus:ring-primary" />
                </th>
                <EnOrden
                  orden={orden.orden}
                  celdas={{
                    img: <th data-col="img" className="w-12">Img</th>,
                    producto: <th data-col="producto">Producto</th>,
                    categoria: (
                      <th data-col="categoria">
                        <span className="block">Categoría</span>
                        <FiltroColumnaMulti
                          label="Categoría"
                          value={catFilter}
                          options={dynamicCategories.filter(c => c.id !== "todos").map((c): FacetaOpcion => ({ value: c.id, count: c.count }))}
                          etiqueta={(id) => dynamicCategories.find(c => c.id === id)?.label ?? id}
                          onChange={setCatFilter}
                          placeholder="Todas"
                        />
                      </th>
                    ),
                    precio: <th data-col="precio">Precio</th>,
                    historial: <th data-col="historial" className={cn(!showExtendedCols && "hidden")}>Historial</th>,
                    badge: <th data-col="badge" className={cn(!showExtendedCols && "hidden")}>Badge</th>,
                    stock: (
                      <th data-col="stock">
                        <span className="block">Stock</span>
                        <FiltroColumnaRango label="Stock" paso={1} valor={stockRango} onChange={(r) => setStockRango(r as Rango<number>)} />
                      </th>
                    ),
                    costoProm: <th data-col="costoProm" className={cn(!showExtendedCols && "hidden")} title="Basado en las ultimas compras">Costo Prom.</th>,
                    rotacion: <th data-col="rotacion" className={cn(!showExtendedCols && "hidden")}>Rotacion</th>,
                    cambio30d: <th data-col="cambio30d" className={cn(!showExtendedCols && "hidden")}>Cambio 30d</th>,
                    vence: (
                      <th data-col="vence" className={cn(!showExtendedCols && "hidden")}>
                        <span className="block">Vence</span>
                        <FiltroColumnaRango label="Vence" esFecha valor={vencRango} onChange={(r) => setVencRango(r as Rango<string>)} />
                      </th>
                    ),
                    estado: (
                      <th data-col="estado">
                        <span className="block">Estado</span>
                        <FiltroColumnaMulti
                          label="Estado"
                          value={estadoFiltro}
                          options={[
                            { value: "Activo", count: activeProducts },
                            { value: "Inactivo", count: totalProducts - activeProducts },
                          ]}
                          onChange={setEstadoFiltro}
                          placeholder="Todos"
                        />
                      </th>
                    ),
                  }}
                />
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <InventarioFilasTabla inv={inv} />
            </tbody>
          </DataTable>
        </div>
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
