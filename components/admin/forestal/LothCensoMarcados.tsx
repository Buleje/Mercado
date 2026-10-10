"use client";

/**
 * Las piezas de «Ver censo»: el aviso que pide confirmar UN árbol que no se
 * debe tumbar, el que confirma juntos los marcados (talar varios) y los
 * botones del pie.
 */

import type { RefObject } from "react";
import { Axe, ShieldAlert } from "@buleje/design-system/icons";
import type { ArbolParaElegir, Reparo } from "@/lib/forestal/loth-censo-uso";

const SECUNDARIO =
  "inline-flex h-10 items-center rounded-xl px-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]";

/** «Árbol 106: el regente lo declaró semillero.» + Volver / Elegirlo igual. */
export function AvisoPendiente({
  arbol,
  reparo,
  confirmarRef,
  onVolver,
  onElegir,
}: {
  arbol: ArbolParaElegir;
  reparo: Reparo;
  confirmarRef: RefObject<HTMLButtonElement | null>;
  onVolver: () => void;
  onElegir: () => void;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-start gap-3 rounded-xl border-2 px-3 py-2.5 text-sm ${
        reparo.nivel === "infraccion"
          ? "border-[var(--data-error-500)]/60 bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"
          : "border-[var(--data-warning-500)]/60 bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]"
      }`}
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <b>Árbol {arbol.treeCode}: {reparo.titulo}.</b> {reparo.detalle}
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={onVolver} className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
          Volver
        </button>
        <button ref={confirmarRef} type="button" onClick={onElegir} className="inline-flex h-9 items-center rounded-lg border-2 border-current px-3 text-sm font-bold">
          Elegirlo igual
        </button>
      </div>
    </div>
  );
}

/** «2 de los marcados piden cuidado: 106 (el regente lo declaró semillero) · …». */
export function AvisoMarcados({
  conReparo,
  seguirRef,
  onDesmarcar,
  onSeguir,
}: {
  conReparo: readonly ArbolParaElegir[];
  seguirRef: RefObject<HTMLButtonElement | null>;
  onDesmarcar: () => void;
  onSeguir: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)]/60 bg-[var(--data-error-50)] px-3 py-2.5 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <b>{conReparo.length === 1 ? "Uno de los marcados pide cuidado" : `${conReparo.length} de los marcados piden cuidado`}:</b>{" "}
        {conReparo.map((a) => `${a.treeCode} (${a.reparo?.titulo.toLowerCase()})`).join(" · ")}.
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={onDesmarcar} className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
          Desmarcarlos
        </button>
        <button ref={seguirRef} type="button" onClick={onSeguir} className="inline-flex h-9 items-center rounded-lg border-2 border-current px-3 text-sm font-bold">
          Seguir con todos
        </button>
      </div>
    </div>
  );
}

/** Desmarcar · Cerrar · «Talar los N elegidos». */
export function BotonesMarcados({
  n,
  etiqueta,
  onDesmarcar,
  onCerrar,
  onElegir,
}: {
  /** `null` = sin casillas: sólo «Cerrar». */
  n: number | null;
  etiqueta: string;
  onDesmarcar: () => void;
  onCerrar: () => void;
  onElegir: () => void;
}) {
  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
      {n != null && n > 0 && (
        <button type="button" onClick={onDesmarcar} className={SECUNDARIO}>
          Desmarcar
        </button>
      )}
      <button type="button" onClick={onCerrar} className={SECUNDARIO}>
        Cerrar
      </button>
      {n != null && (
        <button
          type="button"
          onClick={onElegir}
          disabled={n === 0}
          title={n === 0 ? "Marca con las casillas los árboles que tumbaste" : undefined}
          className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl bg-[var(--accent-dark)] px-3.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Axe className="h-4 w-4" aria-hidden="true" />
          {etiqueta}
        </button>
      )}
    </div>
  );
}
