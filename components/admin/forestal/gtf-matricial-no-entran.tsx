"use client";

/**
 * La línea debajo de la hoja del talonario que explica cómo salen los valores
 * (Brandon 16-10: «hay cosas amarillas tipo puntos marcados… pon para qué es
 * eso»; y después: «ajustar cada valor para que entre en su renglón»):
 *
 *   · en amarillo, cuántos no entran ni con la letra más chica (6 pt) o con
 *     «Encajar» apagado, cuáles (en el ⓘ) y un botón para elegirlos;
 *   · en gris, cuántos salen con la letra achicada para entrar (no es un
 *     error: es lo que hace «Encajar en su renglón»).
 *
 * Sin ninguno de los dos, no se dibuja.
 */

import { TriangleAlert } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { NoEntra } from "@/lib/forestal/gtf-matricial-pantalla";
import { Btn } from "./ctp-shared";
import { fmtMm } from "./gtf-matricial-controles";

export default function AvisoNoEntran({
  lista, achicados = [], onElegir,
}: { lista: NoEntra[]; achicados?: NoEntra[]; onElegir: (claves: string[]) => void }) {
  if (lista.length === 0 && achicados.length === 0) return null;
  const n = lista.length;
  const a = achicados.length;
  return (
    <div role="status" data-qa="talonario-no-entran" className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {n > 0 && (
        <>
          <span aria-hidden className="h-3 w-5 shrink-0 rounded-[2px] outline-2 outline-dashed outline-[var(--data-warning-500)]" />
          <TriangleAlert className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
          <span data-qa="talonario-no-entran-n" className="font-semibold text-[var(--data-warning-ink)]">
            {n} {n === 1 ? "no entra" : "no entran"} ni achicado{n === 1 ? "" : "s"}
          </span>
          <InfoTip
            title="Lo marcado en amarillo"
            what="Ni con la letra más chica (6 pt) entra en su renglón, o tiene «Encajar» apagado: al imprimir pisa al vecino."
            affects="Elígelo y ensánchalo en el bloque «Elegido» («Ensanchar lo justo»), o prende «Partir en varios renglones» si es un campo. El valor no se cambia acá: es el mismo de la hoja SERFOR."
            example={lista.map((x) => `${x.etiqueta}: «${x.texto}» (necesita ${fmtMm(x.necesitaMm)} mm)`).join(" · ")}
          />
          <Btn variant="ghost" onClick={() => onElegir(lista.map((x) => x.clave))}>
            {n === 1 ? "Elegirlo" : "Elegirlos"}
          </Btn>
        </>
      )}
      {a > 0 && (
        <>
          <span data-qa="talonario-achicados-n" className="text-[var(--text-secondary)]">
            {a} {a === 1 ? "achicado" : "achicados"} para entrar
          </span>
          <InfoTip
            title="Valores con la letra achicada"
            what="No entraban en su renglón a la letra del campo: salen con la letra justa para entrar, en la misma línea. Igual en pantalla, en la matricial y en el PDF."
            affects="Si prefieres la letra entera, ensancha el campo o apaga «Encajar en su renglón» en el bloque «Elegido»."
            example={achicados.map((x) => `${x.etiqueta}: «${x.texto}» a ${fmtMm(x.letraPt)} pt`).join(" · ")}
          />
        </>
      )}
    </div>
  );
}
