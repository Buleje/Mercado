"use client";

/**
 * Un bloque plegable de «Rentabilidad y rendimiento»: título con su ⓘ, y la
 * preferencia (abierto/plegado) se RECUERDA por bloque en este navegador.
 * Plegado sigue diciendo su cifra en una línea: plegar no es esconder el dato
 * (ley de la vista, regla 3).
 */

import type { ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronDown } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useLocalStorage } from "@/hooks/use-local-storage";

export interface AyudaBloque {
  title: string;
  what: ReactNode;
  affects?: ReactNode;
  example?: ReactNode;
}

export default function BloquePlegable({
  clave,
  titulo,
  ayuda,
  resumen,
  abiertoPorDefecto = false,
  extra,
  children,
}: {
  /** Va en la clave de memoria: `loth:rentabilidad:bloque:<clave>`. */
  clave: string;
  titulo: string;
  ayuda: AyudaBloque;
  /** La cifra del bloque en una línea, visible con el bloque plegado. */
  resumen?: ReactNode;
  abiertoPorDefecto?: boolean;
  /** A la derecha del título, con el bloque abierto (un conmutador, un enlace). */
  extra?: ReactNode;
  children: ReactNode;
}) {
  const [guardado, setGuardado] = useLocalStorage<boolean | null>(`loth:rentabilidad:bloque:${clave}`, null);
  const abierto = guardado ?? abiertoPorDefecto;
  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]" data-bloque={clave}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
        <CardTitle as="h3" className="min-w-0 text-base text-[var(--text-primary)]">
          <button
            type="button"
            onClick={() => setGuardado(!abierto)}
            aria-expanded={abierto}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg text-left font-bold hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
          >
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${abierto ? "" : "-rotate-90"}`} aria-hidden />
            {titulo}
          </button>
        </CardTitle>
        <InfoTip {...ayuda} side="bottom" />
        {!abierto && resumen && (
          <span className="min-w-0 truncate font-mono text-sm tabular-nums text-[var(--text-secondary)]">{resumen}</span>
        )}
        {abierto && extra && <div className="ml-auto flex items-center gap-2">{extra}</div>}
      </header>
      {abierto && <div className="space-y-3 border-t border-[var(--rule-soft)] p-4">{children}</div>}
    </section>
  );
}
