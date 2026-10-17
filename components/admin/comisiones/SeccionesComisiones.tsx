"use client";

/**
 * Las dos secciones de Comisiones —«Vendedores» y «Reglas»— con la misma piel
 * que las secciones de Caja (`caja/CajaSecciones.tsx`): pestañas de 48 px en un
 * carril hundido, ← → para pasar de una a otra. No se reusa aquélla porque sus
 * grupos son los de la caja; `SegmentedControl` del DS queda en 44 px y su
 * contador en 10 px.
 */
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export type SeccionComisiones = "vendedores" | "reglas";

export const ID_PANEL_COMISIONES = "comisiones-panel";
export const idPestanaComisiones = (s: SeccionComisiones) => `comisiones-pestana-${s}`;

export function SeccionesComisiones({ valor, onCambiar, reglas }: { valor: SeccionComisiones; onCambiar: (s: SeccionComisiones) => void; reglas: number }) {
  const pestanas: { clave: SeccionComisiones; rotulo: string }[] = [
    { clave: "vendedores", rotulo: "Vendedores" },
    { clave: "reglas", rotulo: reglas > 0 ? `Reglas · ${reglas}` : "Reglas" },
  ];

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const otra = pestanas.find((p) => p.clave !== valor);
    const destino = e.key === "Home" ? pestanas[0] : e.key === "End" ? pestanas[pestanas.length - 1] : otra;
    if (!destino || destino.clave === valor) return;
    onCambiar(destino.clave);
    requestAnimationFrame(() => document.getElementById(idPestanaComisiones(destino.clave))?.focus());
  };

  return (
    <div className="flex items-center gap-1 rounded-xl bg-[var(--surface-sunken)]" role="tablist" aria-label="Secciones de comisiones" onKeyDown={alTeclear}>
      {pestanas.map((p) => {
        const activa = p.clave === valor;
        return (
          <button
            key={p.clave}
            id={idPestanaComisiones(p.clave)}
            type="button"
            role="tab"
            aria-selected={activa}
            aria-controls={ID_PANEL_COMISIONES}
            tabIndex={activa ? 0 : -1}
            onClick={() => onCambiar(p.clave)}
            className={cn(
              "min-h-12 whitespace-nowrap rounded-xl px-4 text-sm font-semibold tabular-nums transition-colors",
              activa
                ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)] ring-1 ring-[var(--rule-base)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            {p.rotulo}
          </button>
        );
      })}
    </div>
  );
}
