"use client";

import { AlertTriangle, Search, ScanBarcode, X, Camera, Filter, ChevronDown, Eye, EyeOff } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { rangoActivo, type FacetaOpcion } from "@/lib/admin/filtros-columna";
import { FiltroColumnaMulti } from "@/components/admin/shared/filtros-columna";
import { ETIQUETA_FALTA } from "@/lib/inventario/catalogo-incompleto";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

const TONO_ACENTO = "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]";
const TONO_AVISO = "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)]";
const TONO_NEUTRO = "border-[var(--text-tertiary)] bg-[var(--surface-sunken)] text-[var(--text-primary)]";

/** Chip de filtro: botón secundario del DS (48 px) a 14 px; encendido toma su tono. */
const chip = (activo: boolean, tono: string = TONO_ACENTO) =>
  button({ variant: "secondary", className: cn("shrink-0 gap-1.5 rounded-xl px-3 text-sm", activo ? tono : "text-[var(--text-secondary)]") });

/** El desplegable de la fila a 48 px (mismo arreglo que Facturas y boletas). */
const FILTRO_EN_FILA = "mt-0! min-w-0 shrink-0 [&_summary]:h-12 [&_summary]:rounded-xl";

/**
 * La fila de filtros de Productos y stock, pegada a la tabla (10-10): buscar
 * (con el escáner adentro), categoría, Bajo stock, Inactivos, Sin foto y
 * «Filtros» (estado, stock y vencimiento). Antes las 8 categorías eran una
 * fila propia de pastillas que se salía de la pantalla, y los mismos filtros
 * estaban OTRA vez como selects dentro de las cabeceras de la tabla.
 * «Nuevo» y el «⋯» se mudaron a la cabecera de la vista.
 */
export default function InventarioBarra({ inv, onBuscarConEscaner }: { inv: Inventario; onBuscarConEscaner: () => void }) {
  const {
    search, setSearch, searchPlaceholders, phIndex, catFilter, setCatFilter, dynamicCategories,
    lowOnly, setLowOnly, estadoFiltro, setEstadoFiltro, showInactive, stockRango, setStockRango, vencRango,
    setVencRango, noImageOnly, setNoImageOnly, faltaDato, setFaltaDato, showFilters, setShowFilters,
    noImageCount, lowStockCount, filteredProducts, products,
  } = inv;
  /* Lo que vive dentro de «Filtros»: se cuenta en el botón para que un filtro
     puesto no quede escondido con el panel cerrado. El Estado por defecto
     («Activo») no cuenta: es lo de siempre. */
  const estadoPuesto = !(estadoFiltro.length === 1 && estadoFiltro[0] === "Activo") && !(showInactive && estadoFiltro.length === 0);
  const avanzados = (estadoPuesto ? 1 : 0) + (rangoActivo(stockRango) ? 1 : 0) + (rangoActivo(vencRango) ? 1 : 0);
  const hayFiltros = lowOnly || showInactive || noImageOnly || Boolean(faltaDato) || catFilter.length > 0 || avanzados > 0;
  const limpiar = () => {
    setLowOnly(false);
    setEstadoFiltro(["Activo"]);
    setNoImageOnly(false);
    setFaltaDato(null);
    setCatFilter([]);
    setStockRango({ min: null, max: null });
    setVencRango({ min: null, max: null });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* En celular el buscador va en su propia fila; desde sm pide 16 rem y crece. */}
      <div className="relative h-12 min-w-0 grow basis-full sm:basis-64">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={searchPlaceholders[phIndex]}
          aria-label="Buscar producto por nombre o código de barras"
          className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-10 pr-12 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-primary"
        />
        {/* El escáner llena la búsqueda: la tabla queda en el producto de ese código. */}
        <button
          type="button"
          onClick={onBuscarConEscaner}
          aria-label="Buscar con el escáner de código de barras"
          title="Buscar con el escáner"
          className="absolute right-0.5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-alt)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <ScanBarcode className="h-5 w-5" aria-hidden />
        </button>
      </div>
      {dynamicCategories.length > 1 && (
        <FiltroColumnaMulti
          label="Categoría"
          value={catFilter}
          options={dynamicCategories.filter(c => c.id !== "todos").map((c): FacetaOpcion => ({ value: c.id, count: c.count }))}
          etiqueta={(id) => dynamicCategories.find(c => c.id === id)?.label ?? id}
          onChange={setCatFilter}
          placeholder="Categoría: todas"
          className={FILTRO_EN_FILA}
        />
      )}
      <button type="button" aria-pressed={lowOnly} onClick={() => setLowOnly(!lowOnly)} className={chip(lowOnly, TONO_AVISO)}>
        <AlertTriangle className="h-4 w-4" aria-hidden /> Bajo stock{lowStockCount > 0 ? ` (${lowStockCount})` : ""}
      </button>
      <button
        type="button"
        aria-pressed={showInactive}
        // Atajo del filtro de Estado: escribe el MISMO estado, no un segundo filtro.
        onClick={() => setEstadoFiltro(showInactive ? ["Activo"] : [])}
        className={chip(showInactive, TONO_NEUTRO)}
      >
        {showInactive ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
        Inactivos
      </button>
      <button type="button" aria-pressed={noImageOnly} onClick={() => setNoImageOnly(!noImageOnly)} className={chip(noImageOnly)}>
        <Camera className="h-4 w-4" aria-hidden /> Sin foto ({noImageCount})
      </button>
      {faltaDato && (
        <button type="button" onClick={() => setFaltaDato(null)} aria-label={`Quitar el filtro ${ETIQUETA_FALTA[faltaDato]}`} className={chip(true)}>
          {ETIQUETA_FALTA[faltaDato]} <X className="h-4 w-4" aria-hidden />
        </button>
      )}
      <button
        type="button"
        aria-expanded={showFilters}
        onClick={() => setShowFilters(!showFilters)}
        title="Estado, rango de stock y de vencimiento"
        className={chip(showFilters || avanzados > 0)}
      >
        <Filter className="h-4 w-4" aria-hidden />
        Filtros{avanzados > 0 ? ` (${avanzados})` : ""}
        <ChevronDown className={cn("h-4 w-4 transition-transform", showFilters && "rotate-180")} aria-hidden />
      </button>
      {/* Con un filtro puesto, cuántos quedan (antes, una fila propia «Mostrando 88 de 89»). */}
      {hayFiltros && (
        <span className="shrink-0 text-sm tabular-nums text-[var(--text-secondary)]" aria-live="polite">
          Mostrando {filteredProducts.length} de {products.length}
        </span>
      )}
      {hayFiltros && (
        <button
          type="button"
          onClick={limpiar}
          className={button({ variant: "ghost", className: "shrink-0 rounded-xl px-3 text-sm text-[var(--data-error-ink)] hover:bg-[var(--data-error-500)]/10" })}
        >
          <X className="h-4 w-4" aria-hidden /> Limpiar
        </button>
      )}
    </div>
  );
}
