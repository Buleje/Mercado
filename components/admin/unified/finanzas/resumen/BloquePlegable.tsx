"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";

/** Prefijo de la preferencia «bloque abierto» de cada bloque del Resumen de Plata. */
export const PREFIJO_PLEGADO = "plata:resumen:abierto:";

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
  const [abierto, setAbierto] = useLocalStorage<boolean>(`${PREFIJO_PLEGADO}${id}`, inicial);
  const cuerpo = `plata-resumen-${id}`;
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
