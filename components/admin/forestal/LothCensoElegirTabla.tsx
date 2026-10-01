"use client";

/**
 * La tabla del modal «Ver censo» de la tala: el censo entero con lo que el
 * libro ya hizo con cada árbol, para decidir cuál tumbar.
 *
 * El botón «Elegir» va en la última columna, FIJA a la derecha: dentro de un
 * modal la tabla no se vuelve tarjetas en el celular (el portal queda fuera
 * del shell del panel) y a 400 px scrollea de costado — sin fijarla, la acción
 * quedaba fuera de la pantalla.
 *
 * Con `marcados` (la tala de varios, 28-09) cada árbol disponible lleva su
 * casilla junto al código, y la cabecera marca todos los de la lista.
 */

import type { ReactNode } from "react";
import { DataTable } from "@buleje/design-system";
import { ArrowDown, ArrowUp, ArrowUpDown, Ban, TreePine } from "@buleje/design-system/icons";
import type { ArbolParaElegir, ColumnaCenso } from "@/lib/forestal/loth-censo-uso";
import { formatDistance } from "@/lib/forestal/loth-utm";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { CategoriaTag, CitesPill, Mono } from "./loth-plan-ui";

export interface OrdenCenso {
  columna: ColumnaCenso;
  dir: "asc" | "desc";
}

const TH = "whitespace-nowrap px-2 py-2 text-left text-xs font-bold text-[var(--text-primary)]";
const FIJA = "sticky right-0 z-[1] bg-[var(--surface-raised)] shadow-[-8px_0_8px_-8px_var(--rule-strong)]";

const dec = (v: number | null, min: number, max: number) => (v == null ? "—" : formatNumber(v, { min, max }));

function Cabecera({ col, label, orden, onOrdenar, derecha, antes }: {
  col: ColumnaCenso;
  label: string;
  orden: OrdenCenso;
  onOrdenar: (c: ColumnaCenso) => void;
  derecha?: boolean;
  /** Lo que va antes del botón de orden (la casilla de «marcar todos»). */
  antes?: ReactNode;
}) {
  const activo = orden.columna === col;
  const Icono = !activo ? ArrowUpDown : orden.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={activo ? (orden.dir === "asc" ? "ascending" : "descending") : "none"} className={`${TH} ${derecha ? "text-right" : ""}`}>
      {antes}
      <button
        type="button"
        onClick={() => onOrdenar(col)}
        className={`inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)] ${activo ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : ""}`}
      >
        {label}
        <Icono className={`h-3.5 w-3.5 ${activo ? "" : "opacity-40"}`} aria-hidden="true" />
      </button>
    </th>
  );
}

/** Lo que el libro dice del árbol: en pie, o talado con su línea y lo que salió. */
function EnElLibro({ a }: { a: ArbolParaElegir }) {
  if (a.disponibilidad === "disponible") {
    return <span className="rounded-full bg-[var(--data-success-100)] px-2 py-0.5 text-xs font-bold text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]">En pie</span>;
  }
  const u = a.uso;
  return (
    <div className="min-w-[8.5rem] max-w-[11rem]">
      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${a.disponibilidad === "talado" ? "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"}`}>
        {a.disponibilidad === "talado" ? "Talado" : "Descartado"}
      </span>
      <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">{a.motivoNoDisponible?.replace(/^Talado el /, "")}</span>
      {u && (u.trozas > 0 || u.despachadas > 0) && (
        <span className="block text-xs text-[var(--text-tertiary)]">
          {u.trozas} {u.trozas === 1 ? "troza" : "trozas"}
          {u.despachadas > 0 && ` · ${u.despachadas} despachada${u.despachadas === 1 ? "" : "s"}`}
          {u.consumidas > 0 && ` · ${u.consumidas} consumida${u.consumidas === 1 ? "" : "s"}`}
        </span>
      )}
      {a.desfase && <span className="block text-xs font-semibold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">El censo dice «en pie»</span>}
    </div>
  );
}

/**
 * Para qué se elige: en la tala, un árbol en pie; en el trozado, uno que ya
 * tiene su línea de tala (el que no la tiene no tiene qué trozar).
 */
export function sePuedeElegir(a: ArbolParaElegir, para: "tala" | "trozado"): boolean {
  return para === "trozado" ? a.uso?.tala != null : a.disponibilidad === "disponible";
}

/** La casilla de un árbol: del tamaño de un dedo, pegada al código. */
const CASILLA = "mr-2 h-5 w-5 shrink-0 cursor-pointer align-middle accent-[var(--accent-dark)]";

export default function LothCensoElegirTabla({ arboles, orden, onOrdenar, distancias, elegido, onElegir, vacio, para = "tala", marcados, onMarcar, enPlanilla }: {
  arboles: readonly ArbolParaElegir[];
  orden: OrdenCenso;
  onOrdenar: (c: ColumnaCenso) => void;
  /** Metros hasta cada árbol (por id); sin GPS, no hay columna. */
  distancias: ReadonlyMap<string, number> | null;
  /** Código del árbol que ya está en el formulario. */
  elegido: string;
  onElegir: (a: ArbolParaElegir) => void;
  vacio: ReactNode;
  para?: "tala" | "trozado";
  /** Tala de varios: los ids marcados. Sin esto, no hay casillas. */
  marcados?: ReadonlySet<string>;
  onMarcar?: (arboles: readonly ArbolParaElegir[], marcar: boolean) => void;
  /** Los que ya están en la planilla de la tala de varios: no se ofrecen otra vez. */
  enPlanilla?: ReadonlySet<string>;
}) {
  const conDistancia = distancias != null;
  const conCasillas = marcados != null && onMarcar != null;
  const yaEnPlanilla = (a: ArbolParaElegir) => enPlanilla?.has(a.id) ?? false;
  const marcables = conCasillas ? arboles.filter((a) => sePuedeElegir(a, para) && !yaEnPlanilla(a)) : [];
  const nMarcados = marcables.filter((a) => marcados?.has(a.id)).length;
  const todos = marcables.length > 0 && nMarcados === marcables.length;
  const columnas = 9 + (conDistancia ? 1 : 0);
  return (
    <DataTable className="w-full text-sm" stickyHeader wrapperClassName="max-h-[min(58vh,34rem)]">
      <thead className="bg-[var(--surface-sunken)]">
        <tr>
          <Cabecera
            col="codigo"
            label="Código"
            orden={orden}
            onOrdenar={onOrdenar}
            antes={
              conCasillas && (
                <input
                  type="checkbox"
                  checked={todos}
                  disabled={marcables.length === 0}
                  ref={(el) => {
                    if (el) el.indeterminate = nMarcados > 0 && !todos;
                  }}
                  onChange={() => onMarcar(marcables, !todos)}
                  aria-label={`Marcar los ${marcables.length} disponibles de la lista`}
                  className={CASILLA}
                />
              )
            }
          />
          {/* Pegada al código: ordenado por cercanía es la columna que manda, y
              al final quedaba tapada por «Elegir» a 1280 (medido 28-09). */}
          {conDistancia && <Cabecera col="distancia" label="Distancia" orden={orden} onOrdenar={onOrdenar} derecha />}
          <Cabecera col="especie" label="Especie" orden={orden} onOrdenar={onOrdenar} />
          <Cabecera col="dap" label="DAP (m)" orden={orden} onOrdenar={onOrdenar} derecha />
          <Cabecera col="hc" label="Hc (m)" orden={orden} onOrdenar={onOrdenar} derecha />
          <Cabecera col="vol" label="Vol. est. m³" orden={orden} onOrdenar={onOrdenar} derecha />
          <Cabecera col="condicion" label="Condición" orden={orden} onOrdenar={onOrdenar} />
          <Cabecera col="categoria" label="Categoría POA" orden={orden} onOrdenar={onOrdenar} />
          <Cabecera col="estado" label="En el libro" orden={orden} onOrdenar={onOrdenar} />
          <th scope="col" className={`${TH} ${FIJA} bg-[var(--surface-sunken)]`}><span className="sr-only">Elegir</span></th>
        </tr>
      </thead>
      <tbody>
        {arboles.map((a) => {
          const esElegido = elegido.trim() !== "" && a.treeCode === elegido.trim();
          const infraccion = a.reparo?.nivel === "infraccion";
          const segunda = [a.speciesScientific, a.speciesNative].filter(Boolean);
          const d = distancias?.get(a.id);
          const enLaPlanilla = yaEnPlanilla(a);
          const elegible = sePuedeElegir(a, para) && !enLaPlanilla;
          const marcado = conCasillas && elegible && marcados.has(a.id);
          const motivo = enLaPlanilla
            ? "ya está en la planilla"
            : para === "trozado"
              ? "sin tala en el libro, no hay qué trozar"
              : (a.motivoNoDisponible ?? "no disponible");
          return (
            <tr
              key={a.id}
              data-arbol={a.treeCode}
              className={`border-t border-[var(--rule-soft)] align-top ${esElegido || marcado ? "bg-[var(--accent)]/10" : infraccion && para === "tala" ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10" : ""} ${!elegible ? "text-[var(--text-secondary)]" : ""}`}
            >
              <td className="px-2 py-2">
                <span className="flex items-center whitespace-nowrap">
                  {conCasillas &&
                    (elegible ? (
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={(e) => onMarcar([a], e.target.checked)}
                        aria-label={`Marcar el árbol ${a.treeCode}`}
                        className={CASILLA}
                      />
                    ) : (
                      <span className="mr-2 inline-block h-5 w-5 shrink-0" aria-hidden="true" />
                    ))}
                  <Mono bold>{a.treeCode}</Mono>
                </span>
              </td>
              {conDistancia && <td className="px-2 py-2 text-right"><span className="whitespace-nowrap"><Mono>{d == null ? "—" : formatDistance(d)}</Mono></span></td>}
              <td className="px-2 py-2">
                <div className="min-w-[9rem]">
                  <span className="font-medium text-[var(--text-primary)]">{a.speciesCommon}</span>
                  {a.cites && <> <CitesPill /></>}
                  {segunda.length > 0 && (
                    <span className="mt-0.5 block max-w-[15rem] text-xs text-[var(--text-secondary)]">
                      {a.speciesScientific && <i>{a.speciesScientific}</i>}
                      {a.speciesScientific && a.speciesNative && " · "}
                      {a.speciesNative && <span title="Nombre en idioma nativo">{a.speciesNative}</span>}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-2 py-2 text-right"><Mono>{dec(a.dapM, 2, 3)}</Mono></td>
              <td className="px-2 py-2 text-right"><Mono>{dec(a.hcM, 0, 2)}</Mono></td>
              <td className="px-2 py-2 text-right"><Mono bold>{a.volM3 == null ? "—" : fmtM3(a.volM3)}</Mono></td>
              <td className="px-2 py-2">
                <span className="whitespace-nowrap text-[var(--text-primary)]">{a.condicion || "—"}</span>
                {a.notes && <span className="block max-w-[9rem] truncate text-xs text-[var(--text-tertiary)]" title={a.notes}>{a.notes}</span>}
              </td>
              <td className="px-2 py-2">
                <CategoriaTag categoria={a.categoria ?? undefined} />
                {a.reparo && (
                  <span className={`mt-0.5 block whitespace-nowrap text-xs font-semibold ${infraccion ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]"}`}>
                    {infraccion ? "No se tala" : "Consulta al regente"}
                  </span>
                )}
              </td>
              <td className="px-2 py-2"><EnElLibro a={a} /></td>
              <td className={`px-2 py-1.5 text-right ${FIJA} ${esElegido || marcado ? "bg-[var(--surface-sunken)]" : ""}`}>
                {elegible ? (
                  <button
                    type="button"
                    onClick={() => onElegir(a)}
                    aria-label={esElegido ? `Árbol ${a.treeCode} ya elegido` : `Elegir el árbol ${a.treeCode}`}
                    className={`inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold transition-colors ${
                      esElegido
                        ? "border border-[var(--accent)] text-[var(--accent-ink)] dark:text-[var(--accent)]"
                        : "bg-[var(--accent-dark)] text-white hover:opacity-90"
                    }`}
                  >
                    {esElegido ? "Elegido" : "Elegir"}
                  </button>
                ) : enLaPlanilla ? (
                  <span className="inline-flex h-9 items-center whitespace-nowrap px-1 text-xs font-semibold text-[var(--text-secondary)]">En la planilla</span>
                ) : (
                  /* El porqué ya está en «En el libro»; acá sólo que no se elige. */
                  <span
                    role="img"
                    aria-label={`No se puede elegir: ${motivo}`}
                    title={motivo}
                    className="inline-grid h-9 w-9 place-items-center text-[var(--text-tertiary)]"
                  >
                    <Ban className="h-4 w-4" aria-hidden="true" />
                  </span>
                )}
              </td>
            </tr>
          );
        })}
        {arboles.length === 0 && (
          <tr>
            <td colSpan={columnas} className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
              <TreePine className="mx-auto mb-2 h-8 w-8 opacity-30" aria-hidden="true" />
              {vacio}
            </td>
          </tr>
        )}
      </tbody>
    </DataTable>
  );
}
