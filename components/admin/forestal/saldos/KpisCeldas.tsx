"use client";

/**
 * Las celdas de los indicadores de existencias: un sumando del saldo
 * (`Movimiento`) y un derivado de planta (`Derivado`).
 *
 * Cada celda es un `div > dt + dd (+ dd)`: el pie va en un segundo `<dd>`, no
 * en un `<p>`. Un `<p>` suelto dentro de la lista de definiciones es HTML
 * inválido (axe `definition-list`, medido 24-09) y un lector de pantalla puede
 * saltarse el pie.
 *
 * Los tonos van en `-700` en claro y `-500` en oscuro: el `-600` del preset
 * daba 2.53-2.85:1 sobre blanco. El valor es texto grande (xl, extrabold), así
 * que el piso es 3:1.
 */

import type { Layers } from "@buleje/design-system/icons";

export const TONO_VALOR = {
  neutral: "text-[var(--text-primary)]",
  success: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  warning: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  error: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
} as const;

export type Tono = keyof typeof TONO_VALOR;

/** Para el valor de un derivado (lg = 18 px, NO es texto grande: piso 4.5:1). */
const TONO_CHICO: Record<Tono, string> = {
  neutral: "text-[var(--text-primary)]",
  success: "text-[var(--data-success-ink)]",
  warning: "text-[var(--data-warning-ink)]",
  error: "text-[var(--data-error-ink)]",
};

const DT = "text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";

/** Un sumando del saldo. Se declara: va con su ícono. */
export function Movimiento({
  icono: Icono,
  termino,
  valor,
  pie,
  tono = "neutral",
}: {
  icono: typeof Layers;
  termino: string;
  valor: string;
  pie: string;
  tono?: Tono;
}) {
  return (
    <div className="border-t border-[var(--rule-soft)] px-4 py-3 first:border-t-0 sm:border-t-0">
      <dt className={`flex items-center gap-1.5 ${DT}`}>
        <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden /> {termino}
      </dt>
      <dd className={`mt-0.5 text-xl font-extrabold tabular-nums ${TONO_VALOR[tono]}`}>{valor}</dd>
      <dd className="text-sm text-[var(--text-tertiary)]">{pie}</dd>
    </div>
  );
}

/**
 * Un derivado de planta. `valor` en `null` significa «no se puede afirmar»: en
 * vez del guión gigante —que se lee como dato que no cargó— sube el motivo.
 */
export function Derivado({
  termino,
  valor,
  pie,
  tono = "neutral",
}: {
  termino: string;
  valor: string | null;
  pie: string;
  tono?: Tono;
}) {
  return (
    <div className="border-t border-[var(--rule-soft)] px-4 py-2.5 first:border-t-0 sm:border-t-0">
      <dt className={DT}>{termino}</dt>
      {valor != null ? (
        <>
          <dd className={`text-lg font-extrabold tabular-nums ${TONO_CHICO[tono]}`}>{valor}</dd>
          <dd className="text-sm text-[var(--text-tertiary)]">{pie}</dd>
        </>
      ) : (
        <dd className="mt-0.5 text-sm text-[var(--text-secondary)]">Sin dato: {pie}.</dd>
      )}
    </div>
  );
}
