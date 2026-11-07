"use client";

import { Search, List, LayoutGrid, FileText, ChevronLeft, ChevronRight } from "@buleje/design-system/icons";
import { TIPO_LABELS } from "@/lib/types/contracts";
import { cn } from "@/lib/utils";
import { BarraFiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import { presetsContratos } from "@/components/admin/shared/vistas-de-fabrica";
import { CardTitle } from "@buleje/design-system";
import { TarjetasContratos } from "./TarjetasContratos";
import { TablaContratos } from "./TablaContratos";
import type { EstadoContratos } from "./use-contratos";
export default function VistaContratos({ arch }: { arch: EstadoContratos }) {
  const { search, setSearch, filterTipo, setFilterTipo, filterEstado, setFilterEstado, viewMode, setViewMode,
    contratos, fCols, setActiveTab, filteredContratos, clearContratosFilters, paginated, setSelected,
    menuDeContrato, verContratos, ordCols, totalPages, page, setPage } = arch;
  return (
    <>
              <div className="space-y-6">
                {/* Filtros en UNA fila pegada a la lista (11-10): buscador, tipo,
                    estado y vista, todos de 48 px. Los autofiltros que vivían en
                    las cabeceras de la tabla repetían estos dos selects: fuera. */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-full sm:w-auto sm:min-w-[14rem] sm:flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
                    <input
                      type="search"
                      aria-label="Buscar contratos"
                      placeholder="Buscar por cliente, número…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <select aria-label="Filtrar por tipo" value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="h-12 min-w-0 flex-1 sm:flex-none rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="ALL">Todos los tipos</option>
                    {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select aria-label="Filtrar por estado" value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="h-12 min-w-0 flex-1 sm:flex-none rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="ALL">Todos los estados</option>
                    <option value="VIGENTE">Vigentes</option>
                    <option value="POR_VENCER">Por vencer</option>
                    <option value="VENCIDO">Vencidos</option>
                  </select>
                  {/* En el celular la lista ya se dibuja como tarjetas: el cambio de vista sobra. */}
                  <div className="flex items-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-0.5 max-sm:hidden" role="group" aria-label="Cómo ver los contratos">
                    <button type="button" aria-label="Vista en lista" aria-pressed={viewMode === "list"} title="Lista" onClick={() => setViewMode("list")} className={cn("flex h-11 w-11 items-center justify-center rounded-[10px] transition-colors", viewMode === "list" ? "bg-primary text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]")}><List className="h-4 w-4" aria-hidden /></button>
                    <button type="button" aria-label="Vista en cuadrícula" aria-pressed={viewMode === "cards"} title="Tarjetas" onClick={() => setViewMode("cards")} className={cn("flex h-11 w-11 items-center justify-center rounded-[10px] transition-colors", viewMode === "cards" ? "bg-primary text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]")}><LayoutGrid className="h-4 w-4" aria-hidden /></button>
                  </div>
                </div>

                {contratos.length > 0 && <BarraFiltrosTabla excel="Contratos" vistas="contratos" presets={presetsContratos()} f={fCols} plegableSiempre={viewMode === "cards"} />}

                {contratos.length === 0 ? (
                  // El vacío de "no hay nada" se decide por el total SIN
                  // filtrar — si hay contratos pero el filtro los deja todos
                  // afuera, esto NO es lo que se muestra (ver más abajo).
                  <div className="text-center py-16">
                    <FileText className="h-12 w-12 text-[var(--text-tertiary)] mx-auto mb-3" />
                    <CardTitle className="text-[length:var(--ts-xl)] font-bold text-[var(--text-primary)] mb-2">Sin contratos</CardTitle>
                    <p className="text-sm text-[var(--text-secondary)] mb-6">Crea tu primer contrato desde una plantilla</p>
                    <button onClick={() => setActiveTab("plantillas")} className="bg-primary text-white px-6 min-h-11 rounded-xl font-medium hover:bg-primary-dark">Ver Plantillas</button>
                  </div>
                ) : viewMode === "cards" && filteredContratos.length === 0 ? (
                  <div className="text-center py-16">
                    <FileText className="h-12 w-12 text-[var(--text-tertiary)] mx-auto mb-3" />
                    <CardTitle className="text-[length:var(--ts-xl)] font-bold text-[var(--text-primary)] mb-2">Ningún contrato coincide con el filtro</CardTitle>
                    <p className="text-sm text-[var(--text-secondary)] mb-6">Prueba con otro tipo o estado, o limpia la búsqueda.</p>
                    <button onClick={clearContratosFilters} className="bg-primary text-white px-6 min-h-11 rounded-xl font-medium hover:bg-primary-dark">Quitar filtros</button>
                  </div>
                ) : viewMode === "cards" ? (
                  <TarjetasContratos paginados={paginated} onAbrir={setSelected} menuDe={menuDeContrato} />
                ) : (
                  <TablaContratos
                    filtrados={filteredContratos}
                    visibles={verContratos}
                    paginados={paginated}
                    fCols={fCols}
                    ordCols={ordCols}
                    onAbrir={setSelected}
                    onQuitarFiltros={clearContratosFilters}
                    menuDe={menuDeContrato}
                  />
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-[var(--text-secondary)]">{verContratos.length} contrato{verContratos.length !== 1 ? "s" : ""} · página {page} de {totalPages}</p>
                    <div className="flex gap-1">
                      <button type="button" aria-label="Anterior" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="flex h-12 w-12 items-center justify-center rounded-xl hover:bg-[var(--surface-sunken)] disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                      <button type="button" aria-label="Siguiente" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="flex h-12 w-12 items-center justify-center rounded-xl hover:bg-[var(--surface-sunken)] disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
                    </div>
                  </div>
                )}
              </div>
    </>
  );
}