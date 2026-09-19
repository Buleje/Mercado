"use client";

/**
 * Las pestañas internas del Plan de manejo: una por pregunta.
 *
 *   · «Avance y tala» — ¿llego con la vigencia? ¿qué tumbo para no perder saldo?
 *   · «Especies»      — ¿de qué especie queda saldo, cuánto es aprovechable por
 *                       DMC, y dónde corrijo lo que autorizó la resolución?
 *   · «Censo»         — el detalle árbol por árbol, en tabla y en el croquis.
 *
 * Antes eran nueve bloques en una sola tirada (4,8 pantallas) y tres tablas
 * seguidas hablaban de la misma especie sin estar juntas. La pestaña elegida
 * se recuerda en el navegador: quien entra siempre a mirar el censo no tiene
 * que volver a elegirlo.
 *
 * Tablist de verdad (flechas, Inicio/Fin, foco que sigue; Tab entra y sale del
 * grupo de una), como en Saldos del Libro CTP.
 */

import type { ReactNode } from "react";

export type PestanaPlan = "avance" | "especies" | "censo";
export const PESTANAS_PLAN: readonly PestanaPlan[] = ["avance", "especies", "censo"];

export interface PestanaDef {
  id: PestanaPlan;
  label: string;
  /** Cifra al lado del nombre (especies, árboles). */
  cuenta?: string;
  /** Punto de color cuando la pestaña esconde algo que pide atención. */
  alerta?: "warn" | "danger";
  /** El porqué del punto, para el lector de pantalla y el tooltip. */
  alertaTexto?: string;
}

export const idTab = (p: PestanaPlan) => `loth-plan-tab-${p}`;
export const idPanel = (p: PestanaPlan) => `loth-plan-panel-${p}`;

const PUNTO = {
  warn: "bg-[var(--data-warning-500)]",
  danger: "bg-[var(--data-error-500)]",
} as const;

export default function LothPlanPestanas({ pestanas, activa, onCambiar }: {
  pestanas: PestanaDef[];
  activa: PestanaPlan;
  onCambiar: (p: PestanaPlan) => void;
}) {
  const ids = pestanas.map((p) => p.id);
  return (
    <div
      role="tablist"
      aria-label="Partes del plan de manejo"
      className="flex gap-1 overflow-x-auto rounded-xl bg-[var(--surface-sunken)] p-1"
    >
      {pestanas.map((p) => {
        const sel = p.id === activa;
        return (
          <button
            key={p.id}
            id={idTab(p.id)}
            type="button"
            role="tab"
            aria-selected={sel}
            aria-controls={idPanel(p.id)}
            tabIndex={sel ? 0 : -1}
            title={p.alertaTexto}
            onClick={() => onCambiar(p.id)}
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
              e.preventDefault();
              const i = ids.indexOf(activa);
              const destino =
                e.key === "Home" ? 0
                  : e.key === "End" ? ids.length - 1
                    : (i + (e.key === "ArrowRight" ? 1 : -1) + ids.length) % ids.length;
              onCambiar(ids[destino]);
              document.getElementById(idTab(ids[destino]))?.focus();
            }}
            className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
              sel
                ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Etiqueta p={p} />
          </button>
        );
      })}
    </div>
  );
}

function Etiqueta({ p }: { p: PestanaDef }): ReactNode {
  return (
    <>
      {p.alerta && (
        <>
          <span className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[p.alerta]}`} aria-hidden="true" />
          {p.alertaTexto && <span className="sr-only">{p.alertaTexto}: </span>}
        </>
      )}
      {p.label}
      {p.cuenta && (
        <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-tertiary)]">{p.cuenta}</span>
      )}
    </>
  );
}
