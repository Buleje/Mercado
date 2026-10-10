"use client";

/**
 * CtpIngresosPaginacion — el pie de página de la tabla de Ingresos.
 *
 * Sale de la vista para que orqueste y no dibuje. Suma "Primera/Última": con
 * un histórico de varios cientos de guías, llegar al final a golpes de
 * "Siguiente" era el único camino.
 */

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "@buleje/design-system/icons";

const BTN =
  "inline-flex h-10 items-center gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-canvas)] disabled:opacity-40";

export default function CtpIngresosPaginacion({
  total,
  page,
  pageSize,
  loading,
  onPage,
  sustantivo = "registros",
  detalle,
}: {
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onPage: (p: number) => void;
  /** Qué se está paginando: «guías», «registros»… */
  sustantivo?: string;
  /** Aclaración a la derecha del total (los asientos que hay detrás). */
  detalle?: string;
}) {
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const rangeFrom = page * pageSize + 1;
  const rangeTo = Math.min((page + 1) * pageSize, total);

  /**
   * Con TODO en una sola página este pie no dice nada nuevo.
   *
   * Medido en pantalla con 3 guías: la tabla ya cierra con su propia fila de
   * total —«3 guías en pantalla · 3 asientos del libro», más los m³ y las
   * piezas—, y acá abajo aparecía «Mostrando 1–3 de 3 guías» diciendo el mismo
   * número por segunda vez, seguido de una botonera de cuatro flechas y un
   * «1 / 1» con todo deshabilitado. Un control que nunca se puede usar enseña
   * a no mirar los controles.
   *
   * Desde la segunda página vuelve entero: ahí «1–50 de 213» sí dice algo que
   * la tabla no puede saber.
   */
  if (total === 0 || lastPage === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm text-[var(--text-tertiary)]">
          Mostrando <strong className="text-[var(--text-secondary)]">{rangeFrom}–{rangeTo}</strong> de{" "}
          <strong className="text-[var(--text-secondary)]">{total}</strong> {sustantivo}
          {detalle ? <span className="text-[var(--text-tertiary)]"> · {detalle}</span> : null}
        </p>
        {/* La lista de atajos salió de acá: vivía como un renglón fijo bajo cada
            tabla y decía una vez lo que después ocupa siempre. Ahora está en el
            botón de teclado de la cabina, que abre la hoja completa —incluidos
            los de ESTA vista, que el shell ya registra. */}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page === 0 || loading}
          onClick={() => onPage(0)}
          title="Primera página"
          aria-label="Primera página"
          className={`${BTN} max-sm:hidden`}
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={page === 0 || loading}
          onClick={() => onPage(Math.max(0, page - 1))}
          className={BTN}
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </button>
        <span className="text-sm font-bold tabular-nums text-[var(--text-secondary)]">
          {page + 1} / {lastPage + 1}
        </span>
        <button
          type="button"
          disabled={page >= lastPage || loading}
          onClick={() => onPage(Math.min(lastPage, page + 1))}
          className={BTN}
        >
          Siguiente
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={page >= lastPage || loading}
          onClick={() => onPage(lastPage)}
          title="Última página"
          aria-label="Última página"
          className={`${BTN} max-sm:hidden`}
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
