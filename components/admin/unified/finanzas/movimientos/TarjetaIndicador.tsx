"use client";

/**
 * Una tarjeta del panel «Indicadores» de Mi Plata › Movimientos (Gastos,
 * Proyección de caja). La cifra viene ya armada (`montoTexto`, `formatCurrency`):
 * acá no se suma nada. Misma forma que las de Ventas y caja
 * (`components/admin/caja/use-indicadores-caja.tsx`).
 */

import type { ReactNode } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";

export interface Indicador {
  rotulo: string;
  valor: string;
  /** Una línea debajo de la cifra («S4 · lunes 26/10»). */
  nota?: string;
  ayuda?: ReactNode;
  tono?: "neutro" | "rojo" | "destacado";
}

export function TarjetaIndicador({ rotulo, valor, nota, ayuda, tono = "neutro" }: Indicador) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-[var(--surface-raised)] p-3",
        tono === "destacado" ? "border-primary/40 ring-1 ring-primary/20" : tono === "rojo" ? "border-[var(--data-error-500)]/50" : "border-[var(--rule-base)]",
      )}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
        {ayuda && <InfoTip title={rotulo} what={ayuda} />}
      </div>
      <p
        className={cn(
          "text-lg font-extrabold tabular-nums",
          tono === "rojo" ? "text-[var(--data-error-ink)]" : "text-[var(--text-primary)]",
        )}
      >
        {valor}
      </p>
      {nota && <p className="text-sm text-[var(--text-secondary)]">{nota}</p>}
    </div>
  );
}

export const tarjetasDe = (xs: Indicador[]): ReactNode[] => xs.map((x) => <TarjetaIndicador key={x.rotulo} {...x} />);
