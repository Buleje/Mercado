"use client";

import { AlertTriangle, Search, ScanBarcode, Camera } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { rangoActivo, type FacetaOpcion, type Rango } from "@/lib/admin/filtros-columna";
import { FiltroColumnaMulti, FiltroColumnaRango } from "@/components/admin/shared/filtros-columna";
import { FiltrosEnBoton } from "@/components/admin/shared";
import type { ChipFiltroActivo } from "@/components/admin/shared";
import { ETIQUETA_FALTA } from "@/lib/inventario/catalogo-incompleto";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

const TONO_ACENTO = "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]";
const TONO_AVISO = "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)]";

/** Chip de filtro: botón secundario del DS (48 px) a 14 px; encendido toma su tono. */
const chip = (activo: boolean, tono: string = TONO_ACENTO) =>
  button({ variant: "secondary", className: cn("shrink-0 gap-1.5 rounded-xl px-3 text-sm", activo ? tono : "text-[var(--text-secondary)]") });

/** El desplegable de la fila a 48 px (mismo arreglo que Facturas y boletas). */
const FILTRO_EN_FILA = "mt-0! min-w-0 w-full [&_summary]:h-12 [&_summary]:rounded-xl";

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
    setVencRango, noImageOnly, setNoImageOnly, faltaDato, setFaltaDato,
    noImageCount, lowStockCount, filteredProducts, products, activeProducts, totalProducts,
  } = inv;
  /* Lo que vive dentro de «Filtros»: se cuenta en el botón para que un filtro
     puesto no quede escondido con el panel cerrado. El Estado por defecto
     («Activo») no cuenta: es lo de siempre. */
  const estadoPuesto = !(estadoFiltro.length === 1 && estadoFiltro[0] === "Activo") && !(showInactive && estadoFiltro.length === 0);
  const avanzados = (estadoPuesto ? 1 : 0) + (rangoActivo(stockRango) ? 1 : 0) + (rangoActivo(vencRango) ? 1 : 0);
  const activos = (lowOnly ? 1 : 0) + (noImageOnly ? 1 : 0) + (faltaDato ? 1 : 0) + (catFilter.length > 0 ? 1 : 0) + avanzados;
  const textoRango = (r: { min: unknown; max: unknown }) => `${r.min ?? "…"} – ${r.max ?? "…"}`;
  const chips: ChipFiltroActivo[] = [
    ...catFilter.map(id => ({ id: `cat-${id}`, label: dynamicCategories.find(c => c.id === id)?.label ?? id, onQuitar: () => setCatFilter(catFilter.filter(x => x !== id)) })),
    ...(lowOnly ? [{ id: "bajo", label: "Bajo stock", onQuitar: () => setLowOnly(false) }] : []),
    ...(noImageOnly ? [{ id: "sinfoto", label: "Sin foto", onQuitar: () => setNoImageOnly(false) }] : []),
    ...(faltaDato ? [{ id: "falta", label: ETIQUETA_FALTA[faltaDato], onQuitar: () => setFaltaDato(null) }] : []),
    ...(estadoPuesto ? [{ id: "estado", label: showInactive && estadoFiltro.length === 0 ? "Todos los estados" : estadoFiltro.join(" / "), onQuitar: () => setEstadoFiltro(["Activo"]) }] : []),
    ...(rangoActivo(stockRango) ? [{ id: "stock", label: `Stock ${textoRango(stockRango)}`, onQuitar: () => setStockRango({ min: null, max: null }) }] : []),
    ...(rangoActivo(vencRango) ? [{ id: "venc", label: `Vence ${textoRango(vencRango)}`, onQuitar: () => setVencRango({ min: null, max: null }) }] : []),
  ];
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
      <FiltrosEnBoton activos={activos} chips={chips} onLimpiar={limpiar}>
        <div className="flex flex-col gap-2">
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
          <FiltroColumnaMulti
            label="Estado"
            value={estadoFiltro}
            options={[
              { value: "Activo", count: activeProducts },
              { value: "Inactivo", count: totalProducts - activeProducts },
            ]}
            onChange={setEstadoFiltro}
            placeholder="Estado: todos"
            className={FILTRO_EN_FILA}
          />
          <FiltroColumnaRango label="Stock" paso={1} valor={stockRango} onChange={(r) => setStockRango(r as Rango<number>)} placeholder="Stock: cualquiera" className={FILTRO_EN_FILA} />
          <FiltroColumnaRango label="Vence" esFecha valor={vencRango} onChange={(r) => setVencRango(r as Rango<string>)} placeholder="Vence: cuando sea" className={FILTRO_EN_FILA} />
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={lowOnly} onClick={() => setLowOnly(!lowOnly)} className={chip(lowOnly, TONO_AVISO)}>
              <AlertTriangle className="h-4 w-4" aria-hidden /> Bajo stock{lowStockCount > 0 ? ` (${lowStockCount})` : ""}
            </button>
            <button type="button" aria-pressed={noImageOnly} onClick={() => setNoImageOnly(!noImageOnly)} className={chip(noImageOnly)}>
              <Camera className="h-4 w-4" aria-hidden /> Sin foto ({noImageCount})
            </button>
          </div>
        </div>
      </FiltrosEnBoton>
      {/* Con un filtro puesto, cuántos quedan (antes, una fila propia «Mostrando 88 de 89»). */}
      {hayFiltros && (
        <span className="shrink-0 text-sm tabular-nums text-[var(--text-secondary)]" aria-live="polite">
          Mostrando {filteredProducts.length} de {products.length}
        </span>
      )}
    </div>
  );
}
