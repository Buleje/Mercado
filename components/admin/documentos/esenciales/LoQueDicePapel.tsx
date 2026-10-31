"use client";

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronDown } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { useLoQueDice } from "./use-lo-que-dice";

const CAJA = "rounded-xl bg-[var(--surface-sunken)] p-3 text-sm";

/**
 * «Lo que dice» del papel elegido: los datos clave que leyó la IA y, plegado,
 * el comienzo del texto leído. Se pide al elegir el papel (la lista no lo trae).
 */
export default function LoQueDicePapel({ id, editado }: { id: string; editado: string }) {
  const { leido, cargando, fallo } = useLoQueDice(id, editado);
  // Sin datos clave, el texto se ve de entrada; con datos, plegado (el padre lo monta por papel: vuelve a su inicio).
  const [abierto, setAbierto] = useState<boolean | null>(null);
  const verTexto = abierto ?? !leido?.datos.length;
  if (!cargando && !fallo && !leido?.texto && !leido?.datos.length) return null;

  return (
    <section className="space-y-2" aria-label="Lo que dice" aria-busy={cargando} data-qa="esencial-detalle-texto">
      <div className="flex items-center gap-1">
        <CardTitle>Lo que dice</CardTitle>
        <InfoTip
          title="Lo que dice"
          what={<span>Lo que el sistema leyó del papel, también de los escaneados y las fotos.</span>}
          affects={<span>Por esto lo encuentras buscando lo que dice, no sólo su nombre.</span>}
          example={<span>Buscas «Coronel Portillo» y sale la licencia aunque su nombre sea «foto-1.jpg».</span>}
        />
      </div>

      {cargando ? (
        <div role="status" className={`${CAJA} h-16 animate-pulse`} aria-label="Leyendo lo que dice…" />
      ) : fallo ? (
        <p className={`${CAJA} text-[var(--text-tertiary)]`}>No se pudo traer lo que dice. Ábrelo para verlo.</p>
      ) : (
        <>
          {!!leido?.datos.length && (
            <ul className={`${CAJA} list-disc space-y-1 pl-7 text-[var(--text-primary)]`} data-qa="esencial-detalle-datos">
              {leido.datos.map((d, i) => <li key={`${i}:${d}`} className="break-words">{d}</li>)}
            </ul>
          )}
          {leido?.texto && (
            <div>
              <button
                type="button"
                onClick={() => setAbierto(!verTexto)}
                aria-expanded={verTexto}
                data-qa="esencial-texto-leido"
                className="flex min-h-12 w-full items-center gap-2 text-left text-sm font-bold text-[var(--text-primary)]"
              >
                <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform", !verTexto && "-rotate-90")} aria-hidden />
                Texto leído{leido.largo > leido.texto.length ? " (el comienzo)" : ""}
              </button>
              {verTexto && (
                <p className={`${CAJA} max-h-48 overflow-y-auto whitespace-pre-line break-words text-[var(--text-secondary)]`}>
                  {leido.texto}{leido.largo > leido.texto.length ? "…" : ""}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
