"use client";

/**
 * «Columnas n/m»: el botón que abre las casillas para ocultar y mostrar las
 * columnas de una tabla (estado en `useVisibilidadColumnas`). Genérico: no sabe
 * de qué tabla es.
 *
 * Accesible: el botón dice si está abierto (`aria-expanded`) y qué abre
 * (`aria-controls`); Escape cierra y devuelve el foco al botón; un clic fuera
 * también cierra. La última columna visible tiene su casilla bloqueada.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Columns3, RotateCcw } from "@buleje/design-system/icons";
import type { UseVisibilidadColumnasResult } from "./use-columnas-visibles";

export function BotonColumnasVisibles({
  vis,
  className = "h-11 rounded-xl",
}: {
  vis: UseVisibilidadColumnasResult;
  /** Alto/redondeo del botón, para que calce con la barra donde va. */
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const panelId = useId();
  const caja = useRef<HTMLDivElement | null>(null);
  const boton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);

  const total = vis.columnas.length;
  const todas = vis.cuantasVisibles === total;

  return (
    <div
      ref={caja}
      className="relative"
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !abierto) return;
        /* Que no cierre también el modal o el panel de atrás. */
        e.stopPropagation();
        setAbierto(false);
        boton.current?.focus();
      }}
    >
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls={panelId}
        title="Ocultar o mostrar columnas"
        className={`inline-flex items-center gap-1.5 border px-3 text-sm font-semibold transition-colors ${className} ${
          abierto || !todas
            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
            : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
        }`}
      >
        <Columns3 className="h-4 w-4" aria-hidden="true" />
        <span className="max-sm:sr-only">Columnas</span>
        <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
          {vis.cuantasVisibles}/{total}
        </span>
      </button>
      {abierto && (
        <div
          id={panelId}
          role="group"
          aria-label="Columnas visibles"
          className="absolute right-0 top-full z-50 mt-1 max-h-[70vh] w-[15rem] overflow-y-auto overscroll-contain rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-lg)]"
        >
          <p className="px-2 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Columnas visibles
          </p>
          {vis.columnas.map((c) => {
            const on = vis.esVisible(c.id);
            const ultima = on && vis.cuantasVisibles <= 1;
            return (
              <label
                key={c.id}
                title={ultima ? "Al menos una columna queda a la vista" : undefined}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--text-secondary)] ${
                  ultima ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-[var(--surface-sunken)]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={ultima}
                  onChange={() => vis.alternar(c.id)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {c.label}
              </label>
            );
          })}
          <div className="mt-1 flex gap-1 border-t border-[var(--rule-soft)] pt-1">
            <button
              type="button"
              onClick={vis.mostrarTodas}
              disabled={todas}
              className="h-9 flex-1 rounded-lg px-2 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-40"
            >
              Mostrar todas
            </button>
            {vis.cambiado && (
              <button
                type="button"
                onClick={vis.restablecer}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Las de siempre
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
