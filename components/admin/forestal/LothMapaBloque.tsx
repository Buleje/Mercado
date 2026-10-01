"use client";

/**
 * LothMapaBloque — un bloque de datos debajo del mapa del Libro TH que se
 * pliega, y se ACUERDA plegado o abierto en este navegador (una clave por
 * bloque, `useLocalStorage`: el mismo patrón que `LothSeccionKpis`).
 *
 * Plegado no esconde el dato: la cabecera sigue diciendo su resumen en una
 * línea («20 vértices · 5,82 ha») y su estado («10 de 13»). Lo que se pliega es
 * el detalle —la tabla, los campos, las listas— y las acciones de ese detalle.
 *
 * El título es un `CardTitle` de verdad (h3) con el botón ADENTRO, como pide el
 * patrón de acordeón de WAI-ARIA: el lector de pantalla anuncia «Cuadro de
 * coordenadas UTM, botón, contraído», y la navegación por títulos lo encuentra.
 */

import { useId, type ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronRight, type LucideIcon } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";

interface Props {
  /** Clave de localStorage (`loth:mapa:<bloque>-abierto`). */
  clave: string;
  titulo: string;
  icono: LucideIcon;
  /** Una línea con las cifras del bloque. Se ve plegado y abierto. */
  resumen?: ReactNode;
  /** Pastilla de estado a la derecha (lo que falta, el puntaje). */
  estado?: ReactNode;
  /** Botones del bloque. Sólo abierto: plegado, el bloque es una línea. */
  acciones?: ReactNode;
  children: ReactNode;
}

export default function LothMapaBloque({ clave, titulo, icono: Icono, resumen, estado, acciones, children }: Props) {
  const [abierto, setAbierto] = useLocalStorage<boolean>(clave, false);
  const id = useId();

  return (
    <section
      aria-labelledby={`${id}-titulo`}
      data-bloque={clave}
      className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
        <CardTitle as="h3" id={`${id}-titulo`} className="shrink-0">
          <button
            type="button"
            onClick={() => setAbierto(!abierto)}
            aria-expanded={abierto}
            aria-controls={`${id}-cuerpo`}
            title={abierto ? "Pliega el bloque. Se recuerda en este navegador." : "Muestra el detalle del bloque"}
            className="-mx-1.5 inline-flex min-h-10 items-center gap-2 rounded-lg px-1.5 text-left transition-colors hover:text-[var(--accent-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 dark:hover:text-[var(--accent)]"
          >
            <ChevronRight
              className={`h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${abierto ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
            <Icono className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden="true" />
            {titulo}
          </button>
        </CardTitle>
        {resumen && (
          <p className="min-w-0 flex-1 basis-[16rem] text-sm tabular-nums text-[var(--text-secondary)]">{resumen}</p>
        )}
        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
          {estado}
          {abierto && acciones}
        </div>
      </div>
      <div id={`${id}-cuerpo`} hidden={!abierto} className="border-t border-[var(--rule-soft)]">
        {children}
      </div>
    </section>
  );
}
