"use client";

/**
 * Un bloque plegable de «Control del permiso» (saldo por especie, cuadre por
 * guía): título, ⓘ, una línea con sus cifras y el botón que lo abre.
 *
 * Ley de Brandon (ui-components §3): plegar no es esconder el dato — la línea
 * de cifras se ve siempre. La preferencia se RECUERDA por bloque en
 * localStorage (`useLocalStorage` ya envuelve lectura y escritura en
 * try/catch); mientras el usuario no haya elegido, el bloque arranca abierto
 * SÓLO si trae algo en rojo: lo que está bien no pide lugar, lo que está mal sí.
 */

import { useId, type ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronDown } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useLocalStorage } from "@/hooks/use-local-storage";

export interface SeccionPlegableProps {
  /** Clave de localStorage; `null` guardado = el usuario todavía no eligió. */
  clave: string;
  titulo: string;
  ayuda: { what: string; affects?: string; example?: string };
  /** Las cifras en una línea: se ven plegado o abierto. */
  resumen: ReactNode;
  /** Algo en rojo adentro: sin preferencia guardada, arranca abierto. */
  rojo: boolean;
  children: ReactNode;
}

export function SeccionPlegable({ clave, titulo, ayuda, resumen, rojo, children }: SeccionPlegableProps) {
  const id = useId();
  const [elegido, setElegido] = useLocalStorage<boolean | null>(clave, null);
  const abierto = elegido ?? rojo;

  return (
    <section
      aria-labelledby={`${id}-titulo`}
      className={`rounded-2xl border bg-[var(--surface-raised)] ${
        rojo ? "border-[var(--data-error-500)]/50" : "border-[var(--rule-base)]"
      }`}
      data-plegable={clave}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 sm:px-4">
        <div className="flex items-center gap-1">
          <CardTitle as="h3" id={`${id}-titulo`} className="text-sm font-bold text-[var(--text-primary)]">
            {titulo}
          </CardTitle>
          <InfoTip title={titulo} {...ayuda} />
        </div>
        <div className="min-w-0 flex-1 text-xs text-[var(--text-secondary)]" aria-live="polite">
          {resumen}
        </div>
        <button
          type="button"
          onClick={() => setElegido(!abierto)}
          aria-expanded={abierto}
          aria-controls={`${id}-panel`}
          aria-label={`${abierto ? "Ocultar" : "Ver"} ${titulo.toLowerCase()}`}
          className="ml-auto inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 sm:h-9"
        >
          {abierto ? "Ocultar" : "Ver"}
          <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </div>
      <div id={`${id}-panel`} hidden={!abierto} className="border-t border-[var(--rule-soft)] px-3 py-3 sm:px-4">
        {children}
      </div>
    </section>
  );
}
