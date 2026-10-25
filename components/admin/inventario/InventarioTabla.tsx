"use client";

import { DataTable } from "@buleje/design-system";
import EmptyState from "@/components/admin/shared/EmptyState";
import { cn } from "@/lib/utils";
import { Paginator } from "@/hooks/use-pagination";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import { FiltroColumnaMulti, FiltroColumnaRango } from "@/components/admin/shared/filtros-columna";
import type { Rango } from "@/lib/admin/filtros-columna";
import { ThCelda } from "@/components/admin/inventario/th-celda";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";
import InventarioAltaRapida from "@/components/admin/inventario/InventarioAltaRapida";
import InventarioFilasTabla from "@/components/admin/inventario/InventarioFilasTabla";

/** Tabla de productos (cabecera ordenable). Pieza de InventoryTab: recibe `useInventario` entero. */
export default function InventarioTabla({ inv }: { inv: Inventario }) {
  const {
    products, viewMode, selectedIds, showExtendedCols, orden, verColumnaCosto, filteredProducts, pgProducts,
    toggleSelectAll, ordenCol, catFilter, setCatFilter, dynamicCategories, estadoFiltro, setEstadoFiltro,
    activeProducts, totalProducts, stockRango, setStockRango, vencRango, setVencRango,
    precioRango, setPrecioRango, costoRango, setCostoRango,
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
                    producto: <ThCelda col="producto" label="Producto" orden={ordenCol} ordenId="producto" />,
                    categoria: (
                      <ThCelda col="categoria" label="Categoría" orden={ordenCol} ordenId="categoria">
                        <FiltroColumnaMulti
                          compacto label="Categoría" value={catFilter} onChange={setCatFilter}
                          options={dynamicCategories.filter(c => c.id !== "todos").map(c => ({ value: c.id, count: c.count }))}
                          etiqueta={(id) => dynamicCategories.find(c => c.id === id)?.label ?? id}
                        />
                      </ThCelda>
                    ),
                    precio: (
                      <ThCelda col="precio" label="Precio" orden={ordenCol} ordenId="precio">
                        <FiltroColumnaRango compacto label="Precio" unidad="S/" paso={0.01} valor={precioRango} onChange={(r) => setPrecioRango(r as Rango<number>)} />
                      </ThCelda>
                    ),
                    historial: <th data-col="historial" className={cn(!showExtendedCols && "hidden")}>Historial</th>,
                    badge: <th data-col="badge" className={cn(!showExtendedCols && "hidden")}>Badge</th>,
                    stock: (
                      <ThCelda col="stock" label="Stock" orden={ordenCol} ordenId="stock">
                        <FiltroColumnaRango compacto label="Stock" paso={1} valor={stockRango} onChange={(r) => setStockRango(r as Rango<number>)} />
                      </ThCelda>
                    ),
                    costoProm: (
                      <ThCelda col="costoProm" label="Costo" className={cn(!verColumnaCosto && "hidden")} title="Lo que te cuesta cada unidad; con él sale el margen. Enter guarda, Esc cancela" orden={ordenCol} ordenId="costoProm">
                        <FiltroColumnaRango compacto label="Costo" unidad="S/" paso={0.01} valor={costoRango} onChange={(r) => setCostoRango(r as Rango<number>)} />
                      </ThCelda>
                    ),
                    rotacion: <th data-col="rotacion" className={cn(!showExtendedCols && "hidden")}>Rotación</th>,
                    cambio30d: <th data-col="cambio30d" className={cn(!showExtendedCols && "hidden")}>Cambio 30d</th>,
                    vence: (
                      <ThCelda col="vence" label="Vence" className={cn(!showExtendedCols && "hidden")} orden={ordenCol} ordenId="vence">
                        <FiltroColumnaRango compacto esFecha label="Vence" valor={vencRango} onChange={(r) => setVencRango(r as Rango<string>)} />
                      </ThCelda>
                    ),
                    estado: (
                      <ThCelda col="estado" label="Estado" orden={ordenCol} ordenId="estado">
                        <FiltroColumnaMulti
                          compacto label="Estado" value={estadoFiltro} onChange={setEstadoFiltro}
                          options={[{ value: "Activo", count: activeProducts }, { value: "Inactivo", count: totalProducts - activeProducts }]}
                        />
                      </ThCelda>
                    ),
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
          <>
            <EmptyState
              illustration={products.length === 0 ? "products" : "search"}
              title={products.length === 0 ? "Sin inventario" : "Sin resultados"}
              description={products.length === 0 ? "Agrega productos y registra movimientos de stock." : "Prueba con otro filtro o búsqueda."}
            />
            <InventarioAltaRapida inv={inv} />
          </>
        )}
        <Paginator page={pgProducts.page} totalPages={pgProducts.totalPages} total={pgProducts.total} pageSize={pgProducts.pageSize} onPage={pgProducts.setPage} onPageSize={pgProducts.setPageSize} />
      </div>
    </>
  );
}
