"use client";

import { useRef } from "react";
import { AlertTriangle, RefreshCw, Search, Plus, ScanBarcode, X, Camera, Filter, ChevronDown, Eye, EyeOff, Layers, LayoutGrid, LayoutList } from "@buleje/design-system/icons";
import { ModuleActionMenu } from "@/components/admin/shared/ModuleActionMenu";
import BotonIconoTip from "@/components/admin/shared/boton-icono-tip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { ETIQUETA_FALTA } from "@/lib/inventario/catalogo-incompleto";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

const TONO_ACENTO = "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]";
const TONO_AVISO = "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)]";
const TONO_NEUTRO = "border-[var(--text-tertiary)] bg-[var(--surface-sunken)] text-[var(--text-primary)]";

/** Chip de filtro: botón secundario del DS (48 px), compacto; encendido toma su tono. */
const chip = (activo: boolean, tono: string = TONO_ACENTO) =>
  button({ variant: "secondary", className: cn("gap-1 rounded-xl px-3 text-xs", activo ? tono : "text-[var(--text-secondary)]") });

/** Barra de Inventario: buscar, filtros rápidos, vista y acciones. Pieza de InventoryTab: recibe `useInventario` entero. */
export default function InventarioBarra({ inv, onBuscarConEscaner }: { inv: Inventario; onBuscarConEscaner: () => void }) {
  const {
    loading, view, setView, search, setSearch, searchPlaceholders, phIndex, catFilter, setCatFilter,
    lowOnly, setLowOnly, setEstadoFiltro, showInactive, stockRango, setStockRango, vencRango,
    setVencRango, noImageOnly, setNoImageOnly, faltaDato, setFaltaDato, showFilters, setShowFilters,
    viewMode, setViewMode, setShowPicker, setPickerSearch, setPickerCat, setShowScanner, scanLoading,
    load, noImageCount, headerActions,
  } = inv;
  /* El ítem del menú desaparece al elegirlo: si abre una ventana (etiquetas,
     declaración), la ventana se abría antes de que el menú devolviera el foco a
     su botón, guardaba «nada» como de dónde vino y al cerrarla el foco caía al
     inicio de la página (medido: `activeElement` = body tras Escape). Se espera
     a que el menú suelte el foco (o 400 ms) y recién se abre. */
  const menuRef = useRef<HTMLDivElement>(null);
  const conFocoEnElMenu = (accion?: () => void) => () => {
    const boton = menuRef.current?.querySelector("button");
    const desde = performance.now();
    const intentar = () => {
      if (document.activeElement === boton || performance.now() - desde > 400) {
        boton?.focus({ preventScroll: true });
        accion?.();
      } else requestAnimationFrame(intentar);
    };
    requestAnimationFrame(intentar);
  };
  return (
    <>
      {/* Toolbar único — búsqueda + filtros + acciones en UNA sola fila */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        {/* En celular el buscador va en su propia fila; desde sm pide 10 rem y crece (a 400 px `min-w-[200px]` no lo sostenía y quedaba de 40 px). */}
        <div className="relative h-12 min-w-0 grow basis-full sm:basis-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] dark:text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={searchPlaceholders[phIndex]}
            aria-label="Buscar producto por nombre o código de barras"
            className="h-12 w-full pl-10 pr-12 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary transition-colors"
          />
          {/* El escáner llena la búsqueda: la tabla queda filtrada al producto
              de ese código (la búsqueda ya mira el código de barras). */}
          <button
            type="button"
            onClick={onBuscarConEscaner}
            aria-label="Buscar con el escáner de código de barras"
            title="Buscar con el escáner"
            className="absolute right-0.5 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-alt)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <ScanBarcode className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {/* Chips de filtro: botón del DS a 48 px con `aria-pressed`; encendido = su tono. */}
        <button type="button" aria-pressed={lowOnly} onClick={() => setLowOnly(!lowOnly)} className={chip(lowOnly, TONO_AVISO)}>
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Bajo stock
        </button>
        <button
          type="button"
          aria-pressed={showInactive}
          // El botón sigue siendo el atajo rápido; escribe el MISMO estado
          // que el autofiltro de la columna Estado — no un segundo filtro.
          onClick={() => setEstadoFiltro(showInactive ? ["Activo"] : [])}
          className={chip(showInactive, TONO_NEUTRO)}
        >
          {showInactive ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
          Inactivos
        </button>
        <button type="button" aria-pressed={noImageOnly} onClick={() => setNoImageOnly(!noImageOnly)} className={chip(noImageOnly)}>
          <Camera className="h-3.5 w-3.5" aria-hidden /> Sin foto ({noImageCount})
        </button>
        {faltaDato && (
          <button
            type="button"
            onClick={() => setFaltaDato(null)}
            aria-label={`Quitar el filtro ${ETIQUETA_FALTA[faltaDato]}`}
            className={chip(true)}
          >
            {ETIQUETA_FALTA[faltaDato]} <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
        {(lowOnly || showInactive || noImageOnly || faltaDato || catFilter.length > 0 || stockRango.min != null || stockRango.max != null || vencRango.min != null || vencRango.max != null) && (
          <button
            type="button"
            onClick={() => {
              setLowOnly(false);
              setEstadoFiltro(["Activo"]);
              setNoImageOnly(false);
              setFaltaDato(null);
              setCatFilter([]);
              setStockRango({ min: null, max: null });
              setVencRango({ min: null, max: null });
            }}
            className={button({ variant: "ghost", className: "rounded-xl px-3 text-xs text-[var(--data-error-ink)] hover:bg-[var(--data-error-500)]/10" })}
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Limpiar
          </button>
        )}
        {/* Filtros: categoría, estado, rangos, vista e importar/exportar (antes «Mas», sin tilde). */}
        <button type="button" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)} className={chip(showFilters)}>
          <Filter className="h-3.5 w-3.5" aria-hidden />
          Filtros
          <ChevronDown className={cn("h-3 w-3 transition-transform", showFilters && "rotate-180")} aria-hidden />
        </button>
        {/* Vista tabla / tarjetas (solo desktop): grupo de 48 px como los filtros. */}
        <div className="hidden sm:inline-flex h-12 items-center gap-0.5 rounded-xl border border-[var(--rule-base)] p-0.5 ml-auto">
          <BotonIconoTip
            icon={LayoutList}
            tamano="sm"
            label="Vista tabla"
            aria-pressed={viewMode === "table"}
            onClick={() => setViewMode("table")}
            className={cn("h-full w-9 rounded-lg", viewMode === "table" && "bg-[var(--text-primary)] text-[var(--surface-raised)] hover:bg-[var(--text-primary)] hover:text-[var(--surface-raised)]")}
          />
          <BotonIconoTip
            icon={LayoutGrid}
            tamano="sm"
            label="Vista tarjetas"
            aria-pressed={viewMode === "cards"}
            onClick={() => setViewMode("cards")}
            className={cn("h-full w-9 rounded-lg", viewMode === "cards" && "bg-[var(--text-primary)] text-[var(--surface-raised)] hover:bg-[var(--text-primary)] hover:text-[var(--surface-raised)]")}
          />
        </div>
        {/* Nuevo + Más acciones. CTA del panel: negro en claro y blanco en oscuro
            (el blanco sobre turquesa daba 3,2:1). */}
        <button
          type="button"
          onClick={() => { setPickerSearch(""); setPickerCat("todos"); setShowPicker(true); }}
          className={button({ variant: "primary", className: "rounded-xl px-4" })}
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden /> Nuevo
        </button>
        <div ref={menuRef} className="contents">
        <ModuleActionMenu
          className="h-12"
          items={[
            // Acciones del módulo padre (Conteo físico, Generar declaración, Imprimir etiquetas…)
            ...headerActions.map((a) => ({ ...a, onClick: conFocoEnElMenu(a.onClick) })),
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
      </div>
    </>
  );
}
