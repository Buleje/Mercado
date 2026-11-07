"use client";

/**
 * Las pestañas internas del Plan de manejo: una por pregunta.
 *
 *   · «Avance y tala» — ¿llego con la vigencia? ¿qué tumbo para no perder saldo?
 *   · «Especies»      — ¿de qué especie queda saldo, cuánto es aprovechable por
 *                       DMC, y dónde corrijo lo que autorizó la resolución?
 *   · «Censo»         — el detalle árbol por árbol, en tabla y en el croquis.
 *   · «Papeles»       — lo que la norma pide para este tipo de plan
 *                       (resolución, título, acta de la comunidad, regente…)
 *                       y sus carpetas del Archivo: ¿qué falta o vence?
 *                       (ADR-467). La tienen los dos tipos de plan; su id
 *                       sigue siendo `documentos` (la pestaña recordada).
 *
 * Una PLANTACIÓN (ADR-459) tiene otras dos: «Registro y saldo» —sus especies y
 * m³ registrados, y dónde está hoy ese volumen— y «Árboles marcados», que es el
 * censo con el nombre que le corresponde: opcional, porque el saldo sale del
 * registro y no de los árboles.
 *
 * Antes eran nueve bloques en una sola tirada (4,8 pantallas) y tres tablas
 * seguidas hablaban de la misma especie sin estar juntas. La pestaña elegida
 * se recuerda en el navegador: quien entra siempre a mirar el censo no tiene
 * que volver a elegirlo.
 *
 * Tablist de verdad (flechas, Inicio/Fin, foco que sigue; Tab entra y sale del
 * grupo de una), como en Saldos del Libro CTP.
 *
 * PEGADA arriba (26-10, «mejor de navegar»): al bajar por el censo o el plan de
 * tala la barra queda debajo de la cabecera del panel, con sus cifras, y
 * cambiar de pestaña desde ahí vuelve al principio de la pestaña nueva — si no,
 * se caía a la mitad de un panel que nunca se vio. Mismo trato que las
 * secciones del cubicador (`cubicador-secciones`).
 */

import { useRef, type ReactNode } from "react";

export type PestanaPlan = "avance" | "especies" | "censo" | "registro" | "documentos";
/** Las de un plan de bosque natural (PO, PMFI, DEMA, PGMF). */
export const PESTANAS_PLAN: readonly PestanaPlan[] = ["avance", "especies", "censo", "documentos"];
/** Las de una plantación: el registro manda; los árboles marcados son opcionales. */
export const PESTANAS_PLANTACION: readonly PestanaPlan[] = ["registro", "censo", "documentos"];

export interface PestanaDef {
  id: PestanaPlan;
  label: string;
  /** Lo que entra a 400 px. «Árboles marcados (opcional)» al lado de otra
   *  pestaña se salía de la fila en el celular. */
  labelCorto?: string;
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
  const ancla = useRef<HTMLDivElement>(null);
  const cambiar = (p: PestanaPlan) => {
    onCambiar(p);
    const el = ancla.current;
    /* 64 px = la cabecera del panel: más arriba, la barra ya está pegada. */
    if (el && el.getBoundingClientRect().top < 64) el.scrollIntoView({ block: "start", behavior: "auto" });
  };
  return (
    <>
    <div ref={ancla} aria-hidden className="scroll-mt-16" />
    <div
      role="tablist"
      aria-label="Partes del plan de manejo"
      data-pestanas-plan
      className="sticky top-16 z-20 flex gap-1 overflow-x-auto max-sm:gap-0.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-1 shadow-[var(--shadow-sm)]"
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
            onClick={() => cambiar(p.id)}
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
              e.preventDefault();
              const i = ids.indexOf(activa);
              const destino =
                e.key === "Home" ? 0
                  : e.key === "End" ? ids.length - 1
                    : (i + (e.key === "ArrowRight" ? 1 : -1) + ids.length) % ids.length;
              cambiar(ids[destino]);
              document.getElementById(idTab(ids[destino]))?.focus({ preventScroll: true });
            }}
            className={`inline-flex min-h-10 min-w-max flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm max-sm:gap-1 max-sm:px-1.5 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
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
    </>
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
      {p.labelCorto ? (
        <>
          <span className="sm:hidden">{p.labelCorto}</span>
          <span className="max-sm:hidden">{p.label}</span>
        </>
      ) : (
        p.label
      )}
      {p.cuenta && (
        <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-tertiary)]">{p.cuenta}</span>
      )}
    </>
  );
}
