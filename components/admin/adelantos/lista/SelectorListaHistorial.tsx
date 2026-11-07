"use client";

/**
 * «Lista | Historial» (25-10): el Historial ya no es una pestaña aparte, es otra
 * mirada de los mismos adelantos. Dos botones de 40 px, el activo marcado.
 */

import { button } from "@/components/ui-system/button-variants";

export type SeccionAdelantos = "lista" | "historial";

export default function SelectorListaHistorial({
  valor,
  onCambio,
}: {
  valor: SeccionAdelantos;
  onCambio: (v: SeccionAdelantos) => void;
}) {
  return (
    <div role="group" aria-label="Ver adelantos como" className="inline-flex shrink-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-0.5">
      {(["lista", "historial"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={valor === v}
          onClick={() => onCambio(v)}
          className={button({
            variant: "ghost",
            size: "md",
            className: `h-10 rounded-[10px] px-4 font-bold ${
              valor === v ? "bg-[var(--surface-raised)] text-[var(--accent-ink)] shadow-sm dark:text-[var(--accent)]" : "text-[var(--text-secondary)]"
            }`,
          })}
        >
          {v === "lista" ? "Lista" : "Historial"}
        </button>
      ))}
    </div>
  );
}
