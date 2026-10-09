"use client";

import { AlertTriangle, Loader2, X, Download, TrendingUp, Layers, Upload, CheckCircle, Maximize2, Sparkles } from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";
import { exportToExcel } from "@/lib/export-excel";
import { formatCurrency } from "@/lib/format";
import type { FacetaOpcion, Rango } from "@/lib/admin/filtros-columna";
import { FiltroColumnaMulti, FiltroColumnaRango } from "@/components/admin/shared/filtros-columna";
import { BotonRestablecerColumnas } from "@/components/admin/shared/columnas-ordenables";
import { claveCategoria } from "@/components/admin/inventario/inventario-compartido";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

/** Panel «Más» (vista, importar/exportar) y avisos de CSV y precios. Pieza de InventoryTab: recibe `useInventario` entero. */
export default function InventarioOpciones({ inv }: { inv: Inventario }) {
  const {
    products, loading, view, setView, search, setSearch, catFilter, setCatFilter, estadoFiltro,
    setEstadoFiltro, stockRango, setStockRango, vencRango, setVencRango, showFilters,
    setShowBulkImageAssign, setBulkModal, setBulkField, setBulkValue, showExtendedCols,
    setShowExtendedCols, setShowExpandedTable, orden, csvImportRef, csvImporting, csvResult,
    setCsvResult, handleCsvImport, totalProducts, activeProducts, inconsistentes, dynamicCategories,
    noImageCount,
  } = inv;
  return (
    <>
      {/* Expanded options panel (Vista + Import/Export) — collapsible from toolbar "Mas" button */}
      {showFilters && (
        <div className="bg-[var(--surface-alt)] rounded-xl p-3 border border-[var(--rule-soft)] dark:border-[var(--rule-base)] space-y-3">
          {/* Grupo: Filtros de columna — SÓLO mobile (<640px no hay tabla, es
              cards; ahí el autofiltro de la cabecera no tiene dónde vivir). En
              desktop estos mismos controles ya están en su `<th>`: repetirlos
              acá enseñaría a dudar de cuál manda. */}
          <div className="sm:hidden">
            <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted mb-2">Filtros</p>
            <div className="flex flex-wrap gap-2">
              <FiltroColumnaMulti
                label="Categoría"
                value={catFilter}
                options={dynamicCategories.filter(c => c.id !== "todos").map((c): FacetaOpcion => ({ value: c.id, count: c.count }))}
                etiqueta={(id) => dynamicCategories.find(c => c.id === id)?.label ?? id}
                onChange={setCatFilter}
                placeholder="Todas"
              />
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
              <FiltroColumnaRango label="Stock" paso={1} valor={stockRango} onChange={(r) => setStockRango(r as Rango<number>)} />
              <FiltroColumnaRango label="Vence" esFecha valor={vencRango} onChange={(r) => setVencRango(r as Rango<string>)} />
            </div>
          </div>

          {/* Grupo: Vista */}
          <div>
            <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted mb-2">Vista</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { const next = !showExtendedCols; setShowExtendedCols(next); try { localStorage.setItem("inv-extended-cols", String(next)); } catch {} }}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                  showExtendedCols ? "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:border-[var(--data-success-500)]/30 dark:bg-primary/15 dark:text-[var(--data-success-500)]" : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-white dark:hover:bg-[var(--surface-raised)]"
                )}
              >
                <Layers className="h-3.5 w-3.5" /> {showExtendedCols ? "Menos columnas" : "Mas columnas"}
              </button>
              <BotonRestablecerColumnas cambiado={orden.cambiado} onRestablecer={orden.restablecer} />
              <button
                onClick={() => setShowExpandedTable(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:border-[var(--data-success-500)]/30 dark:bg-primary/15 dark:text-[var(--data-success-500)] hover:bg-primary/10 dark:hover:bg-primary/15 transition-colors"
              >
                <Maximize2 className="h-3.5 w-3.5" /> Expandir tabla
              </button>
              {view === "productos" && (
                <button
                  onClick={() => { setBulkField("pricePercent"); setBulkValue(""); setBulkModal(true); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-primary/30 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/5 transition-colors"
                >
                  <TrendingUp className="h-3.5 w-3.5" /> Ajuste %
                </button>
              )}
              <button
                onClick={() => setShowBulkImageAssign(true)}
                title="Asigna imágenes del banco a varios productos a la vez con drag & drop"
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all",
                  noImageCount > 0
                    ? "border-primary bg-linear-to-r from-primary to-[var(--data-success-500)] text-white hover:opacity-90 shadow-[var(--shadow-sm)]"
                    : "border-primary/30 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/5",
                )}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Añadir IMG Amplio
                {noImageCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-white/25 text-[length:var(--ts-2xs)] font-extrabold">
                    {noImageCount} sin foto
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Grupo: Importar / Exportar */}
          <div>
            <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted mb-2">Importar / Exportar</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  const filtered = products.filter(p => {
                    if (catFilter.length > 0 && !catFilter.includes(claveCategoria(p.category))) return false;
                    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !(p.barcode ?? "").includes(search)) return false;
                    return true;
                  });
                  exportToCSV(filtered.map(p => ({
                    nombre: p.name, categoria: p.category, precio: p.price,
                    costo: p.costPrice ?? "", stock: p.stock ?? "",
                    stockMin: p.stockMin ?? "", stockMax: p.stockMax ?? "",
                    unidad: p.unit, codigo: p.barcode ?? "", activo: p.active ? "Si" : "No",
                  })), `inventario_${new Date().toISOString().slice(0, 10)}.csv`);
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-white dark:hover:bg-[var(--surface-raised)] transition-colors"
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
              <button
                onClick={() => {
                  const filtered = products.filter(p => {
                    if (catFilter.length > 0 && !catFilter.includes(claveCategoria(p.category))) return false;
                    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !(p.barcode ?? "").includes(search)) return false;
                    return true;
                  });
                  exportToExcel(filtered.map(p => ({
                    Nombre: p.name, Categoria: p.category, "Precio (S/)": p.price,
                    "Costo (S/)": p.costPrice ?? "", Stock: p.stock ?? "",
                    "Stock Min": p.stockMin ?? "", "Stock Max": p.stockMax ?? "",
                    Unidad: p.unit, Codigo: p.barcode ?? "", Activo: p.active ? "Si" : "No",
                  })), `inventario-${new Date().toISOString().slice(0, 10)}`, "Inventario");
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 text-[var(--data-success-500)] dark:text-[var(--data-success-500)] hover:bg-primary/10 dark:hover:bg-primary/15 transition-colors"
              >
                <Download className="h-3.5 w-3.5" /> Excel
              </button>
              <input ref={csvImportRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvImport} />
              <button
                onClick={() => { setCsvResult(null); csvImportRef.current?.click(); }}
                disabled={csvImporting}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 text-[var(--data-success-500)] dark:text-[var(--data-success-500)] hover:bg-primary/10 dark:hover:bg-primary/15 transition-colors disabled:opacity-50"
              >
                {csvImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Subir CSV
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Content */}
      {/* CSV import result feedback */}
      {csvResult && (
        <div className={`flex items-start gap-3 px-2 sm:px-4 py-2 sm:py-3 rounded-xl text-sm mb-2 ${csvResult.errors.length > 0 ? "bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/40 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]" : "bg-primary/10 dark:bg-primary/15 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"}`}>
          <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-bold">{csvResult.created} producto{csvResult.created !== 1 ? "s" : ""} importado{csvResult.created !== 1 ? "s" : ""} correctamente.</p>
            {csvResult.errors.length > 0 && <ul className="mt-1 text-xs space-y-0.5">{csvResult.errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}{csvResult.errors.length > 5 && <li>...y {csvResult.errors.length - 5} más</li>}</ul>}
          </div>
          <button aria-label="Quitar" onClick={() => setCsvResult(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] shrink-0"><X className="h-4 w-4" /></button>
        </div>
      )}
      {/* Mejora QW-10j: Alerta precio inconsistente */}
      {!loading && inconsistentes.length > 0 && (
        <div className="bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] rounded-xl p-3 mb-2">
          <p className="text-sm font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="h-4 w-4" /> {inconsistentes.length} producto{inconsistentes.length !== 1 ? "s" : ""} se vende{inconsistentes.length !== 1 ? "n" : ""} por debajo del costo:
          </p>
          <ul className="space-y-0.5 mb-2">
            {inconsistentes.slice(0, 5).map(p => (
              <li key={p.id} className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
                {p.name}: costo {formatCurrency(p.costPrice!)} &gt; precio {formatCurrency(Number(p.price))} (perdida {formatCurrency(p.costPrice! - p.price)}/unid)
              </li>
            ))}
            {inconsistentes.length > 5 && <li className="text-xs text-[var(--data-error-500)]">...y {inconsistentes.length - 5} mas</li>}
          </ul>
          <button onClick={() => { setView("productos"); setSearch(""); }} className="text-xs font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] hover:underline">
            Corregir precios &rarr;
          </button>
        </div>
      )}
    </>
  );
}
