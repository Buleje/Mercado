"use client";

/**
 * La tabla del tablero de trozas: las columnas que el usuario eligió, cada
 * cabecera ordena (asc → desc → sin orden).
 *
 * Merge 2026-10-04 (dos sesiones construyeron el Control del permiso): suma lo
 * de ADR-459 — la casilla de la tanda (sólo las del patio), la fila leída con
 * la pistola resaltada, la columna «Permiso» con «Todos» y los días en patio
 * en ámbar (≥ 15) / rojo (≥ 30). La casilla va DENTRO de la primera columna,
 * no en una propia: así las columnas siguen siendo las que el usuario eligió.
 *
 * A 400 px sigue siendo tabla (`hoja-grilla`, scroll propio en su caja): una
 * lista de patio de 80 trozas en tarjetas son metros de scroll. Cada `<th>`
 * lleva `data-label` con su nombre igual, para que el botón de orden no se
 * cuele en el rótulo si algún día vuelve a tarjetas.
 *
 * Con `filtros`, cada cabecera lleva su autofiltro compacto (embudo o lupa)
 * pegado al título (Brandon 07-10).
 */

import type { ReactNode } from "react";
import { DataTable } from "@buleje/design-system";
import { ArrowDown, ArrowUp, ArrowUpDown } from "@buleje/design-system/icons";
import { COLUMNAS_TABLERO, type ColumnaKey, type ColumnaTablero, type OrdenTablero } from "@/lib/forestal/loth-tablero-columnas";
import type { TrozaTablero } from "@/lib/forestal/loth-tablero-trozas";
import { FiltroEnCabecera, type FiltrosTabla } from "./filtros-tabla-forestal";
import { FILTRO_PERMISO } from "./loth-tablero-filtros";
import { celda } from "./loth-tablero-celdas";
import { HOJA_MOVIL } from "./loth-tablero-estilos";

export type NavTablero = {
  onVerCadena?: (code: string) => void;
  onVerGtf?: (gtf: string) => void;
  /** «Ir al Plan de manejo» del menú Opciones y del volumen del permiso. */
  onIrAlPlan?: () => void;
  /** «Árbol en el mapa» del escáner. Sin esto, navega por la URL (`?vista=mapa&arbol=`). */
  onVerArbol?: (treeCode: string) => void;
  /** «Registrar su despacho» del escáner. Sin esto, va a la sección Despacho por la URL. */
  onRegistrarDespacho?: (code: string) => void;
};

const TH = "px-3 py-2.5 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";
const TD = "px-3 py-2.5 align-middle";
const DERECHA = new Set(["numero", "m3", "metros", "dias"]);

const CASILLA = "h-5 w-5 shrink-0 cursor-pointer rounded accent-[var(--accent)]";

/** La tanda (ADR-459): sólo las trozas DISPONIBLES se eligen. */
export interface SeleccionTabla {
  elegidas: ReadonlySet<string>;
  onElegir: (code: string) => void;
  /** Casilla de la cabecera: todas las del patio que se ven. */
  todasVisibles: boolean;
  algunaVisible: boolean;
  hayElegibles: boolean;
  onElegirVisibles: (si: boolean) => void;
}

export default function LothTableroTrozasTabla({
  filas,
  hayTrozas,
  visibles,
  orden,
  onOrdenar,
  nav,
  seleccion,
  resaltada = null,
  permisoDe,
  filtros,
  vacio = "Todavía no hay trozas registradas en el libro.",
}: {
  filas: readonly TrozaTablero[];
  /** ¿Hay alguna troza en el libro? Distingue «vacío» de «el filtro no deja nada». */
  hayTrozas: boolean;
  visibles: readonly ColumnaKey[];
  orden: OrdenTablero | null;
  onOrdenar: (k: ColumnaKey) => void;
  nav?: NavTablero;
  /** Con esto, la primera columna lleva la casilla de la tanda. */
  seleccion?: SeleccionTabla;
  /** La troza que se acaba de leer con la pistola. */
  resaltada?: string | null;
  /** Con «Todos»: el nombre del permiso de cada troza (columna extra). */
  permisoDe?: (planId: string | null) => string;
  /** Lo que dice la tabla sin ninguna troza («en este permiso» / «en el libro»). */
  vacio?: string;
  /** El autofiltro de cada columna (`useLothTableroTabla`). */
  filtros?: FiltrosTabla<TrozaTablero>;
}) {
  const cols = COLUMNAS_TABLERO.filter((c) => visibles.includes(c.key));
  const conDiasAparte = !visibles.includes("diasPatio");
  const nCols = cols.length + (permisoDe ? 1 : 0);

  const casillaTodas = seleccion ? (
    <input
      type="checkbox"
      className={CASILLA}
      checked={seleccion.todasVisibles}
      ref={(el) => {
        if (el) el.indeterminate = seleccion.algunaVisible && !seleccion.todasVisibles;
      }}
      disabled={!seleccion.hayElegibles}
      onChange={(e) => seleccion.onElegirVisibles(e.target.checked)}
      aria-label="Elegir todas las trozas del patio que se ven"
      title="Elegir todas las del patio que se ven"
    />
  ) : null;

  return (
    <DataTable className={`w-full text-sm ${HOJA_MOVIL}`} wrapperClassName="max-w-full rounded-2xl bg-[var(--surface-raised)]">
      <thead className="bg-[var(--surface-sunken)]">
        <tr>
          {cols.map((c, i) => (
            <Cabecera
              key={c.key}
              col={c}
              orden={orden}
              onOrdenar={onOrdenar}
              antes={i === 0 ? casillaTodas : null}
              filtro={filtros && <FiltroEnCabecera id={c.key} f={filtros} compacto />}
            />
          ))}
          {permisoDe && (
            <th data-label="Permiso" className={TH}>
              <span className="whitespace-nowrap">
                Permiso
                {filtros && <FiltroEnCabecera id={FILTRO_PERMISO} f={filtros} compacto />}
              </span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {filas.length === 0 && (
          <tr>
            <td colSpan={nCols} className="px-3 py-8 text-center text-sm text-[var(--text-tertiary)]">
              {hayTrozas ? "Ninguna troza coincide con el filtro." : vacio}
            </td>
          </tr>
        )}
        {filas.map((f) => {
          const elegida = seleccion?.elegidas.has(f.code) ?? false;
          return (
            <tr
              key={f.code}
              data-troza={f.code}
              aria-selected={elegida || undefined}
              className={`border-t border-[var(--rule-soft)] ${
                resaltada === f.code
                  ? "bg-[var(--accent-soft)] outline outline-2 -outline-offset-2 outline-[var(--accent)]"
                  : elegida
                    ? "bg-[var(--accent-soft)]"
                    : "hover:bg-[var(--surface-sunken)]"
              }`}
            >
              {cols.map((c, i) => (
                <td key={c.key} className={`${TD} ${DERECHA.has(c.tipo) ? "text-right" : ""}`}>
                  {i === 0 && seleccion ? (
                    <span className="inline-flex items-center gap-2">
                      {f.estado === "disponible" ? (
                        <input
                          type="checkbox"
                          className={CASILLA}
                          checked={elegida}
                          onChange={() => seleccion.onElegir(f.code)}
                          aria-label={`Elegir la troza ${f.code}`}
                        />
                      ) : (
                        <span className="inline-block h-5 w-5 shrink-0" aria-hidden="true" />
                      )}
                      {celda(c.key, f, nav, conDiasAparte)}
                    </span>
                  ) : (
                    celda(c.key, f, nav, conDiasAparte)
                  )}
                </td>
              ))}
              {permisoDe && (
                <td className={`${TD} whitespace-nowrap text-xs text-[var(--text-secondary)]`}>{permisoDe(f.planId)}</td>
              )}
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}

function Cabecera({
  col,
  orden,
  onOrdenar,
  antes,
  filtro,
}: {
  col: ColumnaTablero;
  orden: OrdenTablero | null;
  onOrdenar: (k: ColumnaKey) => void;
  /** La casilla «elegir todas», si la tabla tiene tanda (va en la primera columna). */
  antes?: ReactNode;
  /** El autofiltro de la columna, pegado al título. */
  filtro?: ReactNode;
}) {
  const activa = orden?.key === col.key;
  const Icono = !activa ? ArrowUpDown : orden.dir === "asc" ? ArrowUp : ArrowDown;
  const boton = (
    <button
      type="button"
      onClick={() => onOrdenar(col.key)}
      title={`Ordenar por ${col.label.toLowerCase()}`}
      className={`inline-flex items-center gap-1 whitespace-nowrap uppercase hover:text-[var(--text-primary)] ${
        activa ? "text-[var(--text-primary)]" : ""
      }`}
    >
      {col.label}
      <Icono className={`h-3 w-3 ${activa ? "" : "opacity-40"}`} aria-hidden="true" />
    </button>
  );
  return (
    <th
      data-label={col.label}
      aria-sort={activa ? (orden.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`${TH} ${DERECHA.has(col.tipo) ? "text-right" : ""}`}
    >
      {antes ? (
        <span className="inline-flex items-center gap-2">
          {antes}
          {boton}
          {filtro}
        </span>
      ) : (
        <span className="inline-flex items-center whitespace-nowrap">
          {boton}
          {filtro}
        </span>
      )}
    </th>
  );
}
