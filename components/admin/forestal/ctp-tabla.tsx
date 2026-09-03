"use client";

/**
 * El formato de tabla del Libro CTP y su paginación (ADR-344).
 *
 * Las tablas del módulo se habían escrito una por una: cada cabecera con su
 * tamaño, su color y su densidad, y ninguna con tope de filas. Con un patio de
 * mil trozas eso es un navegador pintando mil filas que nadie va a leer.
 *
 * Acá viven las tres cosas que todas comparten:
 *
 * · `TablaCtp` — el marco: cabecera **sticky**, filas con hover, líneas suaves,
 *   scroll horizontal propio (nunca el de la página) y alto máximo opcional.
 *   Mismo borde y radio que las dos tablas grandes del libro (Ingresos y
 *   Producción): tres marcos distintos en el mismo módulo se leen como tres
 *   componentes distintos aunque hagan lo mismo.
 * · `usePaginacion` — cuántas filas y en qué página, con la aritmética en
 *   `lib/forestal/tabla-paginacion` (pura, con tests).
 * · `CtpPaginacion` — la barra: el rango en palabras, el tamaño de página y los
 *   botones. Se dibuja **siempre** que haya filas: saber cuántas hay es parte de
 *   leer la tabla, aunque entren todas.
 */

import { useCallback, useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "@buleje/design-system/icons";
import {
  FILAS_POR_PAGINA,
  FILAS_POR_PAGINA_DEFAULT,
  etiquetaFilasPorPagina,
  numerosDePagina,
  rangoDePagina,
  rotuloRango,
  type RangoPagina,
} from "@/lib/forestal/tabla-paginacion";

/** Estado de paginación de una tabla. `filas` es la lista YA filtrada. */
export function usePaginacion<T>(filas: readonly T[], opciones: { porPaginaInicial?: number } = {}) {
  const [porPagina, setPorPaginaState] = useState(opciones.porPaginaInicial ?? FILAS_POR_PAGINA_DEFAULT);
  const [paginaPedida, setPagina] = useState(0);

  const rango = useMemo(
    () => rangoDePagina(filas.length, porPagina, paginaPedida),
    [filas.length, porPagina, paginaPedida],
  );
  const visibles = useMemo(() => filas.slice(rango.inicio, rango.fin), [filas, rango.inicio, rango.fin]);

  /* Cambiar el tamaño vuelve al principio: quedarse en la página 7 con páginas
     el triple de largas deja al operador en un lugar que no eligió. */
  const setPorPagina = useCallback((n: number) => {
    setPorPaginaState(n);
    setPagina(0);
  }, []);

  return { visibles, rango, porPagina, setPorPagina, ir: setPagina };
}

/** El marco de todas las tablas del libro. */
export function TablaCtp({
  children,
  altoMax,
  className = "",
}: {
  children: React.ReactNode;
  /** Ej. `max-h-[28rem]`. Sin esto la tabla crece y la página scrollea sola. */
  altoMax?: string;
  className?: string;
}) {
  return (
    <div className={`overflow-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] ${altoMax ?? ""} ${className}`}>
      <DataTable className="w-full text-sm">{children}</DataTable>
    </div>
  );
}

/** Cabecera estándar: sticky, en mayúsculas chicas, sobre el fondo hundido. */
export function TheadCtp({ children }: { children: React.ReactNode }) {
  return (
    /* `align-top`: las cabeceras llevan controles debajo del título (buscador,
       autofiltro) y sin esto las columnas sin control quedan centradas contra
       ellos, como si el título flotara. */
    <thead className="sticky top-0 z-10 bg-[var(--surface-sunken)] text-left align-top text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
      {children}
    </thead>
  );
}

/** Cuerpo estándar: líneas suaves entre filas. */
export function TbodyCtp({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-[var(--rule-soft)]">{children}</tbody>;
}

/** Fila vacía con su explicación, ocupando la tabla entera. */
export function FilaVacia({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-8 text-center text-sm text-[var(--text-tertiary)]">
        {children}
      </td>
    </tr>
  );
}

const BOTON =
  "grid h-9 min-w-9 place-items-center rounded-lg border-2 border-[var(--rule-base)] px-2 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] disabled:opacity-30 disabled:hover:border-[var(--rule-base)]";

export function CtpPaginacion({
  rango,
  porPagina,
  onPorPagina,
  onIr,
  sustantivo = "fila",
  plural,
  extra,
}: {
  rango: RangoPagina;
  porPagina: number;
  onPorPagina: (n: number) => void;
  onIr: (pagina: number) => void;
  /** Cómo se llama lo que hay en la tabla: «troza», «consumo», «pieza». */
  sustantivo?: string;
  plural?: string;
  /** Algo propio de la tabla a la izquierda (totales, avisos). */
  extra?: React.ReactNode;
}) {
  const numeros = useMemo(() => numerosDePagina(rango.paginas, rango.pagina), [rango.paginas, rango.pagina]);
  const primera = rango.pagina === 0;
  const ultima = rango.pagina >= rango.paginas - 1;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-1">
      <div className="min-w-0 text-sm text-[var(--text-tertiary)]">
        <span className="font-mono tabular-nums text-[var(--text-secondary)]">
          {rotuloRango(rango, sustantivo, plural)}
        </span>
        {extra && <span className="ml-2">{extra}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          <span className="sr-only sm:not-sr-only">Filas</span>
          <select
            value={porPagina}
            onChange={(e) => onPorPagina(Number(e.target.value))}
            aria-label="Cuántas filas por página"
            className="h-9 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            {FILAS_POR_PAGINA.map((n) => (
              <option key={n} value={n}>
                {etiquetaFilasPorPagina(n)}
              </option>
            ))}
          </select>
        </label>

        {/* Con una sola página los botones sobran: el rótulo ya lo dice todo. */}
        {rango.paginas > 1 && (
          <nav aria-label="Paginación" className="flex items-center gap-1">
            <button type="button" onClick={() => onIr(0)} disabled={primera} aria-label="Primera página" className={BOTON}>
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onIr(rango.pagina - 1)}
              disabled={primera}
              aria-label="Página anterior"
              className={BOTON}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {numeros.map((n, i) =>
              n == null ? (
                <span key={`gap-${i}`} className="px-1 text-sm text-[var(--text-tertiary)]">
                  …
                </span>
              ) : (
                <button
                  key={n}
                  type="button"
                  onClick={() => onIr(n)}
                  aria-label={`Página ${n + 1}`}
                  aria-current={n === rango.pagina ? "page" : undefined}
                  className={
                    n === rango.pagina
                      ? "grid h-9 min-w-9 place-items-center rounded-lg border-2 border-[var(--accent)] bg-primary/10 px-2 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : BOTON
                  }
                >
                  {n + 1}
                </button>
              ),
            )}
            <button
              type="button"
              onClick={() => onIr(rango.pagina + 1)}
              disabled={ultima}
              aria-label="Página siguiente"
              className={BOTON}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onIr(rango.paginas - 1)}
              disabled={ultima}
              aria-label="Última página"
              className={BOTON}
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
