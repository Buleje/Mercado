"use client";

/**
 * NavegadorPeriodo — ‹ etiqueta › para la hoja del día, la semana y el mes.
 *
 * La etiqueta abre el selector nativo (`showPicker`): antes, corregir el 02/09
 * estando en el 14/09 eran doce clics en ‹, y no había forma de volver a hoy
 * sin contar clics hacia el otro lado.
 *
 * Compacto (Brandon 23-10: «en esa fila tiene que estar lo de abajo de cambiar
 * los días»): vive en la fila del título (`EncabezadoDeVista`, slot `periodo`),
 * así que es UNA caja de 48 px con ‹ · fecha · › adentro, sin huecos entre
 * piezas. Por debajo de 76rem del encabezado (`@container/enc`) usa la
 * etiqueta corta («vie 23/10») y calla el chip largo («Esta semana»).
 */

import { useRef } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Undo2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { BOTON } from "../rrhh-form";

interface Props {
  etiqueta: string;
  /** La misma etiqueta en corto, para el encabezado angosto («vie 23/10»). */
  etiquetaCorta?: string;
  /** Está parado en hoy / en el mes en curso. */
  esActual: boolean;
  /** «Hoy» / «Este mes» — chip junto a la etiqueta. */
  textoActual: string;
  /** Si el chip cabe también en el encabezado angosto (corto: «Hoy»). Sin esto, ahí se calla. */
  chipSiempre?: boolean;
  /** «Ir a hoy» / «Ir a este mes». */
  textoVolver: string;
  puedeAvanzar: boolean;
  etiquetaAnterior: string;
  etiquetaSiguiente: string;
  onAnterior: () => void;
  onSiguiente: () => void;
  onVolver: () => void;
  selector: { tipo: "date" | "month"; valor: string; max: string; onElegir: (valor: string) => void };
}

const CLASE_FLECHA =
  "inline-flex w-11 shrink-0 items-center justify-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

export default function NavegadorPeriodo(p: Props) {
  const selectorRef = useRef<HTMLInputElement>(null);

  const abrirSelector = () => {
    const el = selectorRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      // Navegadores sin `showPicker` para este tipo: al menos queda enfocado.
      el.focus();
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <div className="inline-flex h-12 items-stretch overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <button type="button" onClick={p.onAnterior} className={CLASE_FLECHA} aria-label={p.etiquetaAnterior} title={p.etiquetaAnterior}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <div className="relative flex border-x border-[var(--rule-soft)]">
          <button
            type="button"
            onClick={abrirSelector}
            aria-label={`${p.etiqueta}. Elegir otra fecha`}
            title="Elegir otra fecha"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
          >
            <CalendarDays className={cn("h-4 w-4 shrink-0 text-[var(--text-tertiary)]", p.etiquetaCorta && "hidden @min-[76rem]/enc:block")} aria-hidden />
            {p.etiquetaCorta ? (
              <>
                <span className="first-letter:uppercase @min-[76rem]/enc:hidden">{p.etiquetaCorta}</span>
                <span className="hidden first-letter:uppercase @min-[76rem]/enc:inline">{p.etiqueta}</span>
              </>
            ) : (
              <span className="first-letter:uppercase">{p.etiqueta}</span>
            )}
            {p.esActual && (
              <span className={cn("rounded-full bg-primary/10 px-2 py-0.5 text-sm font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]", !p.chipSiempre && "hidden @min-[76rem]/enc:inline")}>
                {p.textoActual}
              </span>
            )}
          </button>
          <input
            ref={selectorRef}
            type={p.selector.tipo}
            value={p.selector.valor}
            max={p.selector.max}
            onChange={(e) => {
              if (e.target.value) p.selector.onElegir(e.target.value);
            }}
            tabIndex={-1}
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 h-px w-full opacity-0"
          />
        </div>
        <button type="button" onClick={p.onSiguiente} disabled={!p.puedeAvanzar} className={CLASE_FLECHA} aria-label={p.etiquetaSiguiente} title={p.etiquetaSiguiente}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {!p.esActual && (
        <button type="button" onClick={p.onVolver} className={BOTON.chicoFantasma} aria-label={p.textoVolver} title={p.textoVolver}>
          <Undo2 className={cn("h-4 w-4", p.chipSiempre && "hidden")} aria-hidden />
          {/* Día: «Hoy» siempre (corto). Semana y mes: el texto sólo si entra. */}
          <span className={cn(!p.chipSiempre && "hidden @min-[76rem]/enc:inline")}>{p.chipSiempre ? p.textoActual : p.textoVolver}</span>
        </button>
      )}
    </div>
  );
}
