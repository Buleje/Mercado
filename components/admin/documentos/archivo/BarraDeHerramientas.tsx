"use client";

import { VISTAS_CON_CONTENIDO_PROPIO } from "./compartido";
import MigasRuta from "../explorador/MigasRuta";
import { cn } from "@/lib/utils";
import { Sparkles, PanelLeft, PanelRight, Columns3, Clock, ArrowDownAZ, ArrowUpDown, HardDrive, CalendarClock, type LucideIcon } from "@buleje/design-system/icons";
import FiltrosDoc from "@/components/admin/documentos/FiltrosDoc";
import { familiasPresentes, tagsPresentes } from "@/lib/documentos/filtros-doc";
import { VISTAS_ARCHIVO } from "../explorador/vista-archivo";
import { ActionMenu } from "@/components/admin/shared/action-menu";
import type { ModeloArchivo } from "./use-archivo";

type Orden = ModeloArchivo["sortBy"];
/** Los órdenes del Archivo: el `<select>` de la barra y la sección «Ordenar» del menú Ver. */
const ORDENES: readonly { id: Orden; label: string; Icon: LucideIcon }[] = [
  { id: "relevancia", label: "Más parecidos", Icon: Sparkles },
  { id: "recent", label: "Más recientes", Icon: Clock },
  { id: "name", label: "Nombre A–Z", Icon: ArrowDownAZ },
  { id: "type", label: "Tipo", Icon: ArrowUpDown },
  { id: "size", label: "Tamaño", Icon: HardDrive },
  { id: "expiry", label: "Vence primero", Icon: CalendarClock },
];

/**
 * En el celular (Brandon 31-10: «el panel lo más cómodo en celular») el buscador
 * se estira y comparte fila con IA, Filtros y Ver: el `<select>` de orden se
 * esconde porque el menú Ver lo trae en su sección «Ordenar», como el Ver de
 * Windows. Antes eran tres filas (barra de dirección, buscador, comandos).
 */
const BUSCADOR_EN_FILA = "contents max-sm:[&>*]:min-w-0 max-sm:[&>*]:flex-1 max-sm:[&>*]:basis-0";

export default function BarraDeHerramientas({ arch }: { arch: ModeloArchivo }) {
  const { filterMode, barraExplorador, ex, activePath, abrirCarpetaExp, displayDocs, downloadFolderZip,
    zipping, buscador, setSemantic, semantic, filtros, setFiltros, documents, filtrosAbiertos,
    setFiltrosAbiertos, sortBy, setSortBy, terminosBusqueda, view, enExplorador, sinPanel, setColsMenuOpen,
    colsMenuOpen, colsVisibles, setColsVisibles, panelPrevia } = arch;
  /* Buscando, el orden por defecto pasa a ser el parecido con lo que pediste;
     sin búsqueda no tiene sentido ofrecerlo. */
  const ordenes = ORDENES.filter((o) => o.id !== "relevancia" || terminosBusqueda.length > 0);
  return (
    <>
          {/* Toolbar — solo en vistas tipo lista (no en resumen/asistente/actividad/calendario/enlaces) */}
          {!VISTAS_CON_CONTENIDO_PROPIO.has(filterMode) && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Explorador: Atrás, Adelante, Subir, Lugares y la ruta, como la
                barra de dirección de Windows; el buscador queda a su derecha. */}
            {/* Explorador: como Windows, la barra de dirección (Atrás, Adelante,
                Subir, Lugares y la ruta) y el buscador a su derecha van en una
                fila propia; los comandos (IA, Filtros, Orden, Ver), debajo. */}
            {barraExplorador ? (
              <div className="flex basis-full flex-col gap-2 max-sm:contents sm:flex-row sm:items-center">
                <MigasRuta
                  {...ex.barra}
                  ruta={activePath}
                  raiz="Archivo"
                  onIr={abrirCarpetaExp}
                  zip={filterMode === "folder" && displayDocs.length > 0 ? { onClick: () => void downloadFolderZip(), ocupado: zipping } : undefined}
                  className="min-w-0 flex-1 max-sm:basis-full"
                />
                <div className={BUSCADOR_EN_FILA}>{buscador}</div>
              </div>
            ) : <div className={BUSCADOR_EN_FILA}>{buscador}</div>}
            <button
              onClick={() => setSemantic((s) => !s)}
              aria-pressed={semantic}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 min-h-12 rounded-xl border-2 text-sm font-semibold transition-colors",
                semantic ? "bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent-ink)] dark:text-[var(--accent)]" : "bg-[var(--surface-raised)] border-[var(--rule-base)] text-[var(--text-tertiary)] hover:border-[var(--accent)]/40"
              )}
              title="Búsqueda inteligente: entiende lo que quieres decir, no solo palabras exactas"
            >
              <Sparkles className="h-4 w-4" /> <span className="hidden sm:inline">IA</span>
            </button>
            {/* Los tipos que se ofrecen salen de lo que hay en la vista actual,
                no de una lista fija: cada opción que no filtra nada es una que
                hay que descartar a mano. */}
            <FiltrosDoc
              filtros={filtros}
              onCambiar={setFiltros}
              presentes={familiasPresentes(documents)}
              tagsPresentes={tagsPresentes(documents)}
              abierto={filtrosAbiertos}
              onAlternar={() => setFiltrosAbiertos((v) => !v)}
              resultados={displayDocs.length}
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className={cn(
                "h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-secondary)] outline-none focus:border-primary",
                // En la papelera no hay menú Ver: ahí el orden sigue a la vista.
                filterMode !== "trash" && "max-sm:hidden",
              )}
              aria-label="Ordenar documentos"
              title="Ordenar documentos"
            >
              {ordenes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            {/* La papelera es siempre una lista con sus propias acciones:
                grilla/lista y columnas no le cambian nada (11-10). */}
            {/* Ver: como el Explorador de Windows (íconos grandes, medianos,
                lista, detalles) o las tarjetas de siempre. */}
            {filterMode !== "trash" && (() => {
              const actual = VISTAS_ARCHIVO.find((v) => v.id === view) ?? VISTAS_ARCHIVO[0];
              return (
                <ActionMenu
                  label="Ver"
                  icon={actual.Icon}
                  size="md"
                  compactoEnMovil
                  title={`Ver: ${actual.label}`}
                  actions={[
                    ...VISTAS_ARCHIVO.map((v) => ({ id: v.id, label: v.label, icon: v.Icon, activo: v.id === view, seccion: "Vista", onSelect: () => ex.elegirVista(v.id) })),
                    // Como en Windows: el panel de navegación se prende y se apaga desde Ver.
                    ...(enExplorador
                      ? [{ id: "panel", label: "Panel lateral", hint: "Carpetas, vistas y etiquetas a la izquierda", icon: PanelLeft, activo: !sinPanel, seccion: "Mostrar", onSelect: ex.alternarPanel }]
                      : []),
                    // Como el «Panel de vista previa» de Windows (Alt+P): un clic muestra el archivo a la derecha.
                    ...(panelPrevia.disponible
                      ? [{ id: "vista-previa", label: "Panel de vista previa", hint: "Alt+P · un clic muestra el archivo a la derecha", icon: PanelRight, activo: panelPrevia.prendido, seccion: "Mostrar", onSelect: panelPrevia.alternar }]
                      : []),
                    ...ordenes.map((o) => ({ id: `orden-${o.id}`, label: o.label, icon: o.Icon, activo: o.id === sortBy, seccion: "Ordenar", onSelect: () => setSortBy(o.id) })),
                  ]}
                />
              );
            })()}
            {/* Columnas opcionales — sólo tiene sentido en la tabla, la grilla
                no tiene columnas que ocultar. */}
            {view === "list" && filterMode !== "trash" && (
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setColsMenuOpen((v) => !v); }}
                  className={cn(
                    "inline-flex h-12 items-center gap-1.5 px-3 rounded-xl border-2 text-sm font-semibold transition-colors",
                    colsMenuOpen ? "border-primary text-primary bg-primary/5" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-primary hover:text-primary"
                  )}
                  title="Elegir columnas visibles"
                  aria-label="Elegir columnas visibles"
                  aria-expanded={colsMenuOpen}
                >
                  <Columns3 className="h-4 w-4" />
                </button>
                {colsMenuOpen && (
                  <div
                    className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <p className="px-2 py-1 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Columnas</p>
                    {(
                      [
                        ["categoria", "Categoría"],
                        ["etiquetas", "Etiquetas"],
                        ["vencimiento", "Vencimiento"],
                        ["tamano", "Tamaño"],
                        ["subido", "Subido"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={colsVisibles[key]}
                          onChange={(e) => setColsVisibles((c) => ({ ...c, [key]: e.target.checked }))}
                          className="h-4 w-4 rounded border border-[var(--rule-base)] accent-[var(--color-primary)]"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          )}
    </>
  );
}