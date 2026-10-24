"use client";

import { useId, type ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronDown } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

/** Se recuerda en este navegador para todas las fichas. */
export const CLAVE_MAS_DEL_CLIENTE = "cliente360:mas-abierto";

/**
 * «Más del cliente»: el análisis y lo que se mira de vez en cuando (compras por mes, productos,
 * cuándo compra, puntos, familia y documentos) en un bloque plegable y recordado, para que la
 * ficha entre en dos pantallas (ley de Brandon). Cerrado no monta a los hijos: tampoco pide
 * sus datos al servidor hasta que se abre.
 */
export default function FichaMas({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useLocalStorage<boolean>(CLAVE_MAS_DEL_CLIENTE, false);
  const id = useId();
  return (
    <section aria-labelledby={`${id}-titulo`} className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 sm:px-5">
        <CardTitle id={`${id}-titulo`} className="flex-1 text-sm font-bold text-[var(--text-primary)]">
          <button
            type="button"
            onClick={() => setAbierto(!abierto)}
            aria-expanded={abierto}
            aria-controls={`${id}-panel`}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          >
            Más del cliente
            <span className="hidden text-xs font-normal text-[var(--text-tertiary)] sm:inline">
              Compras por mes · productos · cuándo compra · puntos · familia · documentos
            </span>
            <ChevronDown
              className={`ml-auto h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${abierto ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
        </CardTitle>
        <InfoTip
          what="Lo que se mira de vez en cuando: compras de los últimos 6 meses, productos que más lleva, a qué hora y día compra, sus puntos, su cuenta familiar y los documentos vinculados."
          example="Ábrelo cuando quieras ofrecerle algo: ves qué compra y cuándo viene."
        />
      </div>
      <div id={`${id}-panel`} hidden={!abierto} className="space-y-4 sm:space-y-6">
        {abierto ? children : null}
      </div>
    </section>
  );
}
