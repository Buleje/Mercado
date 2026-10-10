"use client";

/**
 * LothPlanoRequisitos — el checklist del plano del expediente, respondido con
 * lo que hay cargado (`loth-plano-checklist`): la misma lista que se lee en el
 * instructivo, pero contestada por el módulo y con el camino para resolver
 * cada faltante.
 *
 * Vivía arriba del formulario del predio, con el que compartía un título que
 * mezclaba las dos cosas («El predio y el plano del expediente»). Es su propio
 * bloque: lo que se mira ANTES de imprimir. El aviso de la carátula incompleta
 * vive acá porque es exactamente eso —un requisito del cajetín que falta— y se
 * completa en el mismo lugar.
 */

import type { ReactNode } from "react";
import { Check } from "@buleje/design-system/icons";
import type { ChecklistPlano } from "@/lib/forestal/loth-plano-checklist";

/** «10 de 13» + lo que falta, para la cabecera del bloque plegado. */
export function resumenPlano(check: ChecklistPlano): string {
  if (check.listo) return `Los ${check.total} requisitos del plano están cumplidos`;
  const faltan = check.requisitos.filter((r) => !r.cumple);
  const nombres = faltan.slice(0, 2).map((r) => r.label);
  const resto = faltan.length > 2 ? ` y ${faltan.length - 2} más` : "";
  return `${faltan.length === 1 ? "Falta" : `Faltan ${faltan.length}`}: ${nombres.join(" · ")}${resto}`;
}

export default function LothPlanoRequisitos({ check, children }: { check: ChecklistPlano; children?: ReactNode }) {
  return (
    <div className="space-y-3 p-4">
      {children}
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {check.requisitos.map((r) => (
          <li
            key={r.id}
            className={`flex items-start gap-2 rounded-xl px-2.5 py-2 ${
              r.cumple ? "bg-[var(--surface-sunken)]" : "bg-[var(--data-warning-500)]/10"
            }`}
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ${
                r.cumple
                  ? "bg-[var(--data-success-500)]/20 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                  : "bg-[var(--data-warning-500)]/25 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
              }`}
            >
              {r.cumple ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : <span className="text-xs font-bold leading-none">!</span>}
            </span>
            <span className="min-w-0">
              <span className="sr-only">{r.cumple ? "Cumplido: " : "Falta: "}</span>
              <span className="block text-sm font-medium text-[var(--text-primary)]">{r.label}</span>
              <span className="block text-xs text-[var(--text-tertiary)]">{r.detalle}</span>
              {!r.cumple && r.comoResolver && (
                <span className="mt-0.5 block text-xs font-medium text-[var(--text-secondary)]">{r.comoResolver}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
