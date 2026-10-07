"use client";

/**
 * El pie de la tabla de una sección: cuántas líneas hay de verdad (con los
 * filtros de columna, «N de M») y cómo llegar al resto. Un libro de
 * operaciones no puede ocultar renglones en silencio.
 */

import { formatNumber } from "@/lib/format";

const BOTON =
  "h-10 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40";

export default function LothSeccionPaginas({
  seccion,
  filtradas,
  total,
  pagina,
  paginas,
  porPagina,
  leyendoLibro,
  disabled,
  onPagina,
}: {
  /** El nombre de la sección, en minúsculas («trozado»). */
  seccion: string;
  /** Las que pasan los filtros de columna. */
  filtradas: number;
  /** Las que tiene la sección. */
  total: number;
  pagina: number;
  paginas: number;
  porPagina: number;
  /** Todavía se ve sólo la primera página de la API: el libro entero está llegando. */
  leyendoLibro: boolean;
  disabled: boolean;
  onPagina: (p: number) => void;
}) {
  if (total === 0) return null;
  const filtrado = filtradas !== total;
  const desde = pagina * porPagina + 1;
  const hasta = Math.min((pagina + 1) * porPagina, filtradas);
  const texto = leyendoLibro
    ? `Se ven las primeras ${filtradas} de ${formatNumber(total)} líneas: el resto llega en cuanto termine de leerse el libro.`
    : filtradas === 0
      ? `0 de ${formatNumber(total)} líneas en ${seccion}`
      : paginas <= 1
        ? filtrado
          ? `${formatNumber(filtradas)} de ${formatNumber(total)} líneas en ${seccion}`
          : `${formatNumber(total)} línea${total === 1 ? "" : "s"} en ${seccion}`
        : `Mostrando ${desde}–${hasta} de ${formatNumber(filtradas)}${filtrado ? ` (de ${formatNumber(total)} en la sección)` : ""}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2" data-seccion-paginas>
      <p className="text-sm font-semibold text-[var(--text-tertiary)]" aria-live="polite">
        {texto}
      </p>
      {paginas > 1 && !leyendoLibro && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onPagina(Math.max(0, pagina - 1))} disabled={pagina === 0 || disabled} className={BOTON}>
            Anterior
          </button>
          <span className="text-sm font-semibold tabular-nums text-[var(--text-tertiary)]">
            {pagina + 1} / {paginas}
          </span>
          <button
            type="button"
            onClick={() => onPagina(Math.min(paginas - 1, pagina + 1))}
            disabled={pagina >= paginas - 1 || disabled}
            className={BOTON}
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
