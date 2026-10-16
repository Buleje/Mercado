"use client";

/**
 * La línea debajo de la hoja del talonario que explica lo marcado en amarillo
 * (Brandon 16-10: «hay cosas amarillas tipo puntos marcados… pon para qué es
 * eso»): cuántos valores no entran en su renglón, cuáles (en el ⓘ) y un botón
 * para elegirlos de una y arreglarlos en el bloque «Elegido». Sin ninguno, no
 * se dibuja.
 */

import { TriangleAlert } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { NoEntra } from "@/lib/forestal/gtf-matricial-pantalla";
import { Btn } from "./ctp-shared";

export default function AvisoNoEntran({ lista, onElegir }: { lista: NoEntra[]; onElegir: (claves: string[]) => void }) {
  if (lista.length === 0) return null;
  const n = lista.length;
  return (
    <div role="status" data-qa="talonario-no-entran" className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span aria-hidden className="h-3 w-5 shrink-0 rounded-[2px] outline-2 outline-dashed outline-[var(--data-warning-500)]" />
      <TriangleAlert className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
      <span className="font-semibold text-[var(--data-warning-ink)]">
        {n} {n === 1 ? "valor no entra" : "valores no entran"} en su renglón
      </span>
      <InfoTip
        title="Lo marcado en amarillo"
        what="El valor es más ancho que su renglón: al imprimir se parte en dos renglones o pisa al vecino."
        affects="Elígelo y achica su letra o ensánchalo en el bloque «Elegido». El valor no se cambia acá: es el mismo de la hoja SERFOR."
        example={lista.map((x) => `${x.etiqueta}: «${x.texto}»`).join(" · ")}
      />
      <Btn variant="ghost" onClick={() => onElegir(lista.map((x) => x.clave))}>
        {n === 1 ? "Elegirlo" : "Elegirlos"}
      </Btn>
    </div>
  );
}
