"use client";

import type { ReactNode } from "react";
import { StatCard, type StatCardEmphasis } from "@buleje/design-system";
import {
  TrendingUp, TrendingDown, Target, Calculator, DollarSign, Percent, Truck, CreditCard,
} from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/currency";
import { SERIES, SERIE } from "@/components/admin/shared/chart-palette";
import type { Fiscal, MesResumen } from "./tipos";
import { leerIgv } from "./igv";
import AyudaIgv from "./AyudaIgv";

type KpiDef = { key: string; label: string; icon: typeof TrendingUp; color: string };
const KPI_DEFS: KpiDef[] = [
  { key: "ingresos", label: "Ingresos del mes", icon: TrendingUp, color: "var(--accent)" },
  { key: "gastos", label: "Gastos del mes", icon: TrendingDown, color: SERIE.gastos },
  { key: "utilidad", label: "Utilidad neta", icon: DollarSign, color: SERIE.utilidad },
  { key: "margen", label: "Margen %", icon: Percent, color: SERIES[3] },
  { key: "deuda", label: "Deuda proveedores", icon: Truck, color: SERIE.alerta },
  { key: "fiados", label: "Fiados pendientes", icon: CreditCard, color: SERIE.alerta },
  { key: "igv", label: "IGV a pagar", icon: Calculator, color: SERIE.gastos },
  { key: "puntoEq", label: "Punto equilibrio", icon: Target, color: "var(--color-primary)" },
];

/** Los ocho indicadores del mes. */
export default function KpisDelResumen({ kpis, monthlyData, fiscal }: { kpis: Record<string, number>; monthlyData: MesResumen[]; fiscal: Fiscal | null }) {
  const igv = leerIgv(fiscal?.igv ?? null);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {KPI_DEFS.map((def) => {
        const val = kpis[def.key] ?? 0;
        let display: string;
        let subValue: ReactNode;
        let emphasis: StatCardEmphasis = "neutral";
        // Delta REAL mes vs mes anterior desde monthlyData (antes Math.random).
        // Solo ingresos/gastos/utilidad tienen histórico fiable; el resto no muestra delta.
        const _lastM = monthlyData[monthlyData.length - 1];
        const _prevM = monthlyData[monthlyData.length - 2];
        let change: number | null = null;
        if (_lastM && _prevM) {
          const cur = def.key === "ingresos" ? _lastM.ingresos : def.key === "gastos" ? _lastM.gastos : def.key === "utilidad" ? _lastM.utilidad : null;
          const prv = def.key === "ingresos" ? _prevM.ingresos : def.key === "gastos" ? _prevM.gastos : def.key === "utilidad" ? _prevM.utilidad : null;
          if (cur !== null && prv !== null && prv !== 0) change = Math.round(((cur - prv) / Math.abs(prv)) * 100);
        }

        if (def.key === "margen") {
          display = `${val}%`;
          subValue = val > 25 ? "Excelente" : val >= 15 ? "Aceptable" : "Bajo";
          emphasis = val > 25 ? "success" : val >= 15 ? "warning" : "error";
        } else if (def.key === "utilidad") {
          display = `${val >= 0 ? "+" : "-"}${formatCurrency(Math.abs(val), { decimals: 0 })}`;
          emphasis = val >= 0 ? "success" : "error";
        } else if (def.key === "igv") {
          // Sólo el IGV registrado (comprobantes electrónicos y gastos con su
          // IGV). Antes: ingresos y gastos × 18/118, mostrado como si fuera el
          // dato. Sin registro, se dice.
          if (!igv) {
            display = "—";
            subValue = "No se pudo leer";
          } else if (igv.tipo === "sin_registro") {
            display = "Sin registrar";
            subValue = <span className="inline-flex items-center gap-1">Sin IGV registrado <AyudaIgv lectura={igv} /></span>;
          } else {
            display = formatCurrency(Math.abs(igv.neto), { decimals: 0 });
            subValue = <span className="inline-flex items-center gap-1">{igv.neto > 0 ? "A pagar" : "Saldo a favor"} <AyudaIgv lectura={igv} /></span>;
            emphasis = igv.neto > 0 ? "error" : "success";
          }
        } else if (def.key === "puntoEq") {
          display = formatCurrency(val, { decimals: 0 });
          subValue = "por día";
        } else {
          display = formatCurrency(val, { decimals: 0 });
        }
        // Nota: se retira el gris de "valor en cero" del hand-rolled original
        // (StatCardEmphasis no tiene un tono "neutral-tenue") — mismo criterio
        // que ya usa VentasDashboard.tsx con este primitivo.

        // Sparkline REAL desde la serie mensual (antes era val*0.7..0.95 fabricado).
        // Solo para Ingresos/Gastos/Utilidad, que existen en monthlyData.
        const sparkData = (monthlyData.length >= 2 && (def.key === "ingresos" || def.key === "gastos" || def.key === "utilidad"))
          ? monthlyData.map(m => m[def.key as "ingresos" | "gastos" | "utilidad"])
          : null;

        return (
          <StatCard
            key={def.key}
            label={def.label}
            value={display}
            subValue={subValue}
            icon={def.icon}
            emphasis={emphasis}
            delta={change ?? undefined}
            // Que el gasto suba es la mala noticia: rojo arriba.
            deltaPolarity={def.key === "gastos" ? "inverse" : "normal"}
            sparkline={sparkData ? { data: sparkData, color: def.color } : undefined}
          />
        );
      })}
    </div>
  );
}
