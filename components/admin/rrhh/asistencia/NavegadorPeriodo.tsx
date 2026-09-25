"use client";

/**
 * NavegadorPeriodo — ‹ etiqueta › para la hoja del día y la del mes.
 *
 * La etiqueta abre el selector nativo (`showPicker`): antes, corregir el 02/09
 * estando en el 14/09 eran doce clics en ‹, y no había forma de volver a hoy
 * sin contar clics hacia el otro lado.
 */

import { useRef } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { BOTON } from "../rrhh-form";

interface Props {
  etiqueta: string;
  /** Está parado en hoy / en el mes en curso. */
  esActual: boolean;
  /** «Hoy» / «Este mes» — chip junto a la etiqueta. */
  textoActual: string;
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

const CLASE_FLECHA = cn(BOTON.icono, "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]");

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
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={p.onAnterior} className={CLASE_FLECHA} aria-label={p.etiquetaAnterior}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="relative">
        <button
          type="button"
          onClick={abrirSelector}
          aria-label={`${p.etiqueta}. Elegir otra fecha`}
          className="inline-flex h-9 min-w-[11rem] items-center justify-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <CalendarDays className="h-4 w-4 text-[var(--text-tertiary)]" />
          <span className="first-letter:uppercase">{p.etiqueta}</span>
          {p.esActual && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">{p.textoActual}</span>
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
      <button type="button" onClick={p.onSiguiente} disabled={!p.puedeAvanzar} className={CLASE_FLECHA} aria-label={p.etiquetaSiguiente}>
        <ChevronRight className="h-4 w-4" />
      </button>
      {!p.esActual && (
        <button type="button" onClick={p.onVolver} className={BOTON.chicoFantasma}>
          {p.textoVolver}
        </button>
      )}
    </div>
  );
}
