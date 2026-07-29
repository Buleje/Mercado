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
  "inline-flex h-10 items-center gap-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-canvas)] disabled:opacity-40";

/** Tecla del atajo, con aspecto de tecla. */
function Tecla({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">
      {children}
    </kbd>
  );
}

export default function CtpIngresosPaginacion({
  total,
  page,
  pageSize,
  loading,
  onPage,
}: {
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onPage: (p: number) => void;
}) {
  if (total === 0) return null;

  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const rangeFrom = page * pageSize + 1;
  const rangeTo = Math.min((page + 1) * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm text-[var(--text-tertiary)]">
          Mostrando <strong className="text-[var(--text-secondary)]">{rangeFrom}–{rangeTo}</strong> de{" "}
          <strong className="text-[var(--text-secondary)]">{total}</strong> registros
        </p>
        {/* Un atajo que nadie ve no existe. Sólo en desktop: en el celular no
            hay teclado físico y ocuparía una línea al pedo. */}
        <p className="mt-1 hidden text-xs text-[var(--text-tertiary)] lg:block">
          Atajos: <Tecla>N</Tecla> nuevo · <Tecla>/</Tecla> buscar · <Tecla>V</Tecla> validar lo marcado ·{" "}
          <Tecla>R</Tecla> recargar
        </p>
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
