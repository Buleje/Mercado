"use client";

/**
 * Una tarjeta del panel «Indicadores» de Mi Plata › Movimientos (Gastos,
 * Proyección de caja). La cifra viene ya armada (`montoTexto`, `formatCurrency`):
 * acá no se suma nada. Misma forma que las de Ventas y caja
 * (`components/admin/caja/use-indicadores-caja.tsx`).
 */

import type { ReactNode } from "react";
import { StatCard } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

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
    <StatCard
      density="compact"
      label={rotulo}
      value={valor}
      subValue={nota}
      emphasis={tono === "rojo" ? "error" : "neutral"}
      highlight={tono === "destacado"}
      info={ayuda ? <InfoTip title={rotulo} what={ayuda} /> : undefined}
    />
  );
}

export const tarjetasDe = (xs: Indicador[]): ReactNode[] => xs.map((x) => <TarjetaIndicador key={x.rotulo} {...x} />);
