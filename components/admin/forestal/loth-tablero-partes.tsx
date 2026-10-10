"use client";

/**
 * Piezas del tablero de trozas que usan tanto la vista como su tabla: el color
 * de cada estado, el dato de la banda del permiso y el selector de columnas.
 */

import { useId } from "react";
import { Columns3, RotateCcw } from "@buleje/design-system/icons";
import { COLUMNAS_TABLERO, type ColumnaKey } from "@/lib/forestal/loth-tablero-columnas";
import type { EstadoTroza } from "@/lib/forestal/loth-tablero-trozas";

/** Cada estado con su color. Rojo = ya no está disponible (pedido de Brandon). */
export const TONO: Record<EstadoTroza, { chip: string; punto: string }> = {
  disponible: {
    chip: "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)]",
    punto: "bg-[var(--data-success-500)]",
  },
  despachada: {
    chip: "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)]",
    punto: "bg-[var(--data-error-500)]",
  },
  consumida: {
    chip: "border-[var(--data-warning-500)] bg-[var(--data-warning-100)] text-[var(--data-warning-700)]",
    punto: "bg-[var(--data-warning-500)]",
  },
  descartada: {
    chip: "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
    punto: "bg-[var(--text-tertiary)]",
  },
  fantasma: {
    chip: "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)]",
    punto: "bg-[var(--data-error-500)]",
  },
};

/** `YYYY-MM-DD…` → «21/07/26». Se corta el texto: la fecha del libro es date-only. */
export function fechaCelda(iso: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
}

export function DatoPermiso({ label, valor, mono }: { label: string; valor?: string | null; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <span className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {label}
      </span>
      <span className={`block truncate text-sm font-semibold text-[var(--text-primary)] ${mono ? "font-mono" : ""}`}>
        {valor?.trim() || "—"}
      </span>
    </div>
  );
}

/** Botón «Columnas (n)»: abre el panel de abajo, en línea (no flota). */
export function BotonColumnas({
  abierto,
  onToggle,
  n,
  panelId,
}: {
  abierto: boolean;
  onToggle: () => void;
  n: number;
  panelId: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={abierto}
      aria-controls={panelId}
      onClick={onToggle}
      className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors ${
        abierto
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
      }`}
    >
      <Columns3 className="h-4 w-4" aria-hidden="true" />
      Columnas <span className="font-mono tabular-nums text-[var(--text-tertiary)]">{n}</span>
    </button>
  );
}

/**
 * Casillas de las columnas. Se recuerdan por navegador; el Excel lleva todas
 * aunque acá estén apagadas.
 */
export function PanelColumnas({
  id,
  visibles,
  onAlternar,
  onRestablecer,
}: {
  id: string;
  visibles: readonly ColumnaKey[];
  onAlternar: (k: ColumnaKey) => void;
  onRestablecer: () => void;
}) {
  const tituloId = useId();
  return (
    <div
      id={id}
      role="group"
      aria-labelledby={tituloId}
      className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span id={tituloId} className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Columnas visibles
        </span>
        <button
          type="button"
          onClick={onRestablecer}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Las de siempre
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {COLUMNAS_TABLERO.map((c) => {
          const on = visibles.includes(c.key);
          return (
            <label
              key={c.key}
              className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-sm transition-colors ${
                on
                  ? "border-[var(--accent)] bg-[var(--surface-raised)] font-semibold text-[var(--text-primary)]"
                  : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={on && visibles.length === 1}
                onChange={() => onAlternar(c.key)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {c.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}
