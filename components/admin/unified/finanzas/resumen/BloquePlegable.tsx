"use client";

import { createContext, useContext, type ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronDown } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";

/** Prefijo de la preferencia «bloque abierto» de cada bloque del Resumen de Plata. */
export const PREFIJO_PLEGADO = "plata:resumen:abierto:";

/**
 * `true` = el bloque vive en una SECCIÓN del Resumen (`BarraDeSecciones`, ley 11
 * de la vista): se ve una sección a la vez, así que el bloque va abierto, con su
 * título y sus controles, sin el botón de plegar. Afuera (Rentabilidad del Libro
 * TH) sigue plegable como siempre.
 */
export const BloquesEnSeccion = createContext(false);

/**
 * Un bloque del Resumen de Plata que se pliega y recuerda cómo lo dejaste (ley
 * de la vista: plegables y recordados, patrón de `LothSeccionKpis`). Plegado
 * sigue diciendo su cifra en una línea: plegar no es esconder el dato.
 *
 * El título del bloque ES el botón: el bloque de adentro no repite su título.
 * Arranca plegado, para que el resumen entre en ≤2,5 pantallas (medía 5,26).
 */
export default function BloquePlegable({
  id,
  titulo,
  resumen,
  acciones,
  children,
  inicial = false,
}: {
  /** Clave del bloque: `plata:resumen:abierto:<id>` en localStorage. */
  id: string;
  titulo: ReactNode;
  /** La cifra del bloque en una línea; se ve con el bloque plegado. */
  resumen?: ReactNode;
  /** Controles del bloque (expandir, elegir meses, ⓘ): sólo con el bloque abierto. */
  acciones?: ReactNode;
  children: ReactNode;
  inicial?: boolean;
}) {
  const enSeccion = useContext(BloquesEnSeccion);
  const [guardado, setAbierto] = useLocalStorage<boolean>(`${PREFIJO_PLEGADO}${id}`, inicial);
  const abierto = enSeccion || guardado;
  const cuerpo = `plata-resumen-${id}`;
  if (enSeccion) {
    return (
      <section data-bloque-plegable={id} aria-labelledby={`${cuerpo}-titulo`} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-2 sm:px-6">
          <CardTitle id={`${cuerpo}-titulo`} className="min-w-0 text-sm font-bold">{titulo}</CardTitle>
          {acciones && <div className="ml-auto flex shrink-0 items-center gap-2">{acciones}</div>}
        </div>
        <div id={cuerpo} className="px-4 pb-4 pt-2 sm:px-6 sm:pb-6">
          {children}
        </div>
      </section>
    );
  }
  return (
    <section
      data-bloque-plegable={id}
      className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 sm:px-4">
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          aria-controls={cuerpo}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
        >
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform", !abierto && "-rotate-90")}
            aria-hidden
          />
          <span className="shrink-0 text-sm font-bold text-[var(--text-primary)]">{titulo}</span>
          {!abierto && resumen != null && (
            <span className="min-w-0 truncate text-sm tabular-nums text-[var(--text-tertiary)]">· {resumen}</span>
          )}
        </button>
        {abierto && acciones && <div className="flex shrink-0 items-center gap-2">{acciones}</div>}
      </div>
      {abierto && (
        <div id={cuerpo} className="px-4 pb-4 sm:px-6 sm:pb-6">
          {children}
        </div>
      )}
    </section>
  );
}
