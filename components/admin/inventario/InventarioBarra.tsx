"use client";

import { AlertTriangle, RefreshCw, Search, Plus, ScanBarcode, X, Camera, Filter, ChevronDown, Eye, EyeOff, Layers, LayoutGrid, LayoutList } from "@buleje/design-system/icons";
import { ModuleActionMenu } from "@/components/admin/shared/ModuleActionMenu";
import BotonIconoTip from "@/components/admin/shared/boton-icono-tip";
import { cn } from "@/lib/utils";
import { ETIQUETA_FALTA } from "@/lib/inventario/catalogo-incompleto";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

/** Barra de Inventario: buscar, filtros rápidos, vista y acciones. Pieza de InventoryTab: recibe `useInventario` entero. */
export default function InventarioBarra({ inv }: { inv: Inventario }) {
  const {
    loading, view, setView, search, setSearch, searchPlaceholders, phIndex, catFilter, setCatFilter,
    lowOnly, setLowOnly, setEstadoFiltro, showInactive, stockRango, setStockRango, vencRango,
    setVencRango, noImageOnly, setNoImageOnly, faltaDato, setFaltaDato, showFilters, setShowFilters,
    viewMode, setViewMode, setShowPicker, setPickerSearch, setPickerCat, setShowScanner, scanLoading,
    load, noImageCount, headerActions,
  } = inv;
  return (
    <>
      {/* Toolbar único — búsqueda + filtros + acciones en UNA sola fila */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative h-10 min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] dark:text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={searchPlaceholders[phIndex]}
            className="h-10 w-full pl-10 pr-4 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary transition-colors"
          />
        </div>
        {/* Filter chips inline */}
        <button
          onClick={() => setLowOnly(!lowOnly)}
          className={cn(
            "flex items-center gap-1 px-3 h-10 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap",
            lowOnly ? "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] dark:bg-amber-950/20 dark:text-[var(--data-warning-500)]" : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-alt)] "
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5" /> Bajo stock
        </button>
        <button
          // El botón sigue siendo el atajo rápido; escribe el MISMO estado
          // que el autofiltro de la columna Estado — no un segundo filtro.
          onClick={() => setEstadoFiltro(showInactive ? ["Activo"] : [])}
          className={cn(
            "flex items-center gap-1 px-3 h-10 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap",
            showInactive ? "border-gray-400 bg-[var(--surface-sunken)] text-[var(--text-secondary)]" : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-alt)] "
          )}
        >
          {showInactive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          Inactivos
        </button>
        <button
          onClick={() => setNoImageOnly(!noImageOnly)}
          className={cn(
            "flex items-center gap-1 px-3 h-10 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap",
            noImageOnly ? "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:border-[var(--rule-base)] dark:bg-primary/15 dark:text-[var(--text-primary)]" : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-alt)] "
          )}
        >
          <Camera className="h-3.5 w-3.5" /> Sin foto ({noImageCount})
        </button>
        {faltaDato && (
          <button
            type="button"
            onClick={() => setFaltaDato(null)}
            aria-label={`Quitar el filtro ${ETIQUETA_FALTA[faltaDato]}`}
            className="flex items-center gap-1 px-3 h-10 rounded-xl text-xs font-bold border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] transition-colors whitespace-nowrap hover:bg-[var(--accent-muted)]"
          >
            {ETIQUETA_FALTA[faltaDato]} <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
        {(lowOnly || showInactive || noImageOnly || faltaDato || catFilter.length > 0 || stockRango.min != null || stockRango.max != null || vencRango.min != null || vencRango.max != null) && (
          <button
            onClick={() => {
              setLowOnly(false);
              setEstadoFiltro(["Activo"]);
              setNoImageOnly(false);
              setFaltaDato(null);
              setCatFilter([]);
              setStockRango({ min: null, max: null });
              setVencRango({ min: null, max: null });
            }}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 transition-colors whitespace-nowrap"
          >
            <X className="h-3.5 w-3.5" /> Limpiar
          </button>
        )}
        {/* Mas filtros (vista, import/export) */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "flex items-center gap-1 px-3 h-10 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap",
            showFilters ? "border-primary bg-primary/5 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-alt)] "
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          Mas
          <ChevronDown className={cn("h-3 w-3 transition-transform", showFilters && "rotate-180")} />
        </button>
        {/* View mode toggle: tabla / cards (solo desktop) */}
        <div className="hidden sm:inline-flex items-center gap-0.5 rounded-lg border border-[var(--rule-base)] p-0.5 ml-auto">
          <BotonIconoTip
            icon={LayoutList}
            tamano="sm"
            label="Vista tabla"
            aria-pressed={viewMode === "table"}
            onClick={() => setViewMode("table")}
            className={viewMode === "table" ? "bg-primary text-white hover:bg-primary hover:text-white" : ""}
          />
          <BotonIconoTip
            icon={LayoutGrid}
            tamano="sm"
            label="Vista tarjetas"
            aria-pressed={viewMode === "cards"}
            onClick={() => setViewMode("cards")}
            className={viewMode === "cards" ? "bg-primary text-white hover:bg-primary hover:text-white" : ""}
          />
        </div>
        {/* Nuevo + Más acciones */}
        <button
          onClick={() => { setPickerSearch(""); setPickerCat("todos"); setShowPicker(true); }}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" strokeWidth={2} /> Nuevo
        </button>
        <ModuleActionMenu
          items={[
            // Acciones del módulo padre (Conteo físico, Generar declaración…)
            ...headerActions,
            {
              label: view === "productos" ? "Vista rápida (kanban)" : "Vista de productos",
              icon: Layers,
              onClick: () => setView(view === "productos" ? "kanban" : "productos"),
              description: "Cambia entre lista y tablero",
              dividerBefore: headerActions.length > 0,
            },
            {
              label: scanLoading ? "Buscando..." : "Escanear código de barras",
              icon: ScanBarcode,
              onClick: () => setShowScanner(true),
              disabled: scanLoading,
              description: "Añadir producto con lector de barras",
            },
            {
              label: loading ? "Actualizando..." : "Actualizar",
              icon: RefreshCw,
              onClick: load,
              disabled: loading,
              description: "Recargar datos del servidor",
            },
          ]}
        />
      </div>
    </>
  );
}
