"use client";

import type { ReactNode } from "react";
import { StatCard, type StatCardEmphasis } from "@buleje/design-system";
import {
  TrendingUp, TrendingDown, Target, Calculator, DollarSign, Percent, Truck, CreditCard,
} from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/currency";
import { SERIES, SERIE } from "@/components/admin/shared/chart-palette";
import type { Fiscal, MesResumen } from "./tipos";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { leerIgv, textoExoneradas } from "./igv";
import AyudaIgv from "./AyudaIgv";

type KpiDef = { key: string; label: string; icon: typeof TrendingUp; color: string };
const KPI_DEFS: KpiDef[] = [
  { key: "ingresos", label: "Ingresos del mes", icon: TrendingUp, color: "var(--accent)" },
  // «Costos» y no «Gastos»: el valor es `totalCostos` del Resultado (gastos
  // registrados + costo de lo vendido + fletes + planilla), no sólo los gastos.
  { key: "gastos", label: "Costos del mes", icon: TrendingDown, color: SERIE.gastos },
  { key: "utilidad", label: "Utilidad neta", icon: DollarSign, color: SERIE.utilidad },
  { key: "margen", label: "Margen %", icon: Percent, color: SERIES[3] },
  { key: "deuda", label: "Deuda proveedores", icon: Truck, color: SERIE.alerta },
  { key: "fiados", label: "Fiados pendientes", icon: CreditCard, color: SERIE.alerta },
  { key: "igv", label: "IGV a pagar", icon: Calculator, color: SERIE.gastos },
  { key: "puntoEq", label: "Punto equilibrio", icon: Target, color: "var(--color-primary)" },
];

/** Qué dice la tarjeta de gastos según de dónde salió la cifra. */
const SUB_GASTOS = {
  // Del Resultado del servidor: gastos + costo de lo vendido + aserrío + fletes + planilla.
  conCosto: "Con costo de venta",
  // Sin el Resultado (el rol no lo ve, o falló): sólo los gastos anotados.
  sinCosto: "Sólo gastos registrados",
  // Quien llama no dijo de dónde salió: una frase que vale en los dos casos.
  sinDato: "Se resta de tus ingresos",
} as const;

/**
 * Los ocho indicadores del mes. `conCostoDeVenta` = la cifra de gastos salió del
 * Resultado (`true`) o son sólo los gastos registrados (`false`); sin el dato,
 * la tarjeta no afirma ninguna de las dos.
 */
export default function KpisDelResumen({ kpis, monthlyData, fiscal, conCostoDeVenta }: {
  kpis: Record<string, number>; monthlyData: MesResumen[]; fiscal: Fiscal | null; conCostoDeVenta?: boolean;
}) {
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
          // Sin la clave no hay margen que decir (sin ingresos, o tan chicos que
          // pasa de ±999 %): «0 %» en rojo afirmaba un margen que nadie midió.
          if (kpis.margen == null) {
            display = "—";
            subValue = (
              <span className="inline-flex items-center gap-1">
                {(kpis.ingresos ?? 0) > 0 ? "Fuera de escala" : "Sin ingresos este mes"}
                <InfoTip
                  title="Margen %"
                  ariaLabel="Por qué no hay margen"
                  what="El margen es Utilidad neta ÷ Ingresos del mes. Sin ingresos no hay de qué sacar el porcentaje."
                  affects="Con ingresos muy chicos el porcentaje pasa de ±999 % y no dice nada: tampoco se muestra."
                  example="Ingresos S/ 0.10 y costos S/ 18.29 darían −18,190 %: aquí ves «—»."
                />
              </span>
            );
          } else {
            display = `${val}%`;
            subValue = val > 25 ? "Excelente" : val >= 15 ? "Aceptable" : "Bajo";
            emphasis = val > 25 ? "success" : val >= 15 ? "warning" : "error";
          }
        } else if (def.key === "gastos") {
          display = formatCurrency(val, { decimals: 0 });
          subValue = (
            <span className="inline-flex items-center gap-1">
              {conCostoDeVenta === true ? SUB_GASTOS.conCosto : conCostoDeVenta === false ? SUB_GASTOS.sinCosto : SUB_GASTOS.sinDato}
              <InfoTip
                title={conCostoDeVenta === false ? "Gastos del mes" : "Costos del mes"}
                ariaLabel="Qué suma Costos del mes"
                what="Tus gastos registrados más el costo de lo que vendiste (mercadería y madera), el aserrío, los fletes y la planilla. Es lo mismo que resta el Resultado."
                affects="Utilidad neta = Ingresos − Costos del mes. Si tu usuario no puede ver el Resultado, aquí van sólo tus gastos registrados."
                example="Vendiste mercadería que te costó S/ 700 y pagaste S/ 150 de luz: Costos del mes S/ 850."
              />
            </span>
          );
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
          } else if (igv.tipo === "exoneradas") {
            display = "Sin IGV";
            subValue = <span className="inline-flex items-center gap-1">{textoExoneradas(igv.facturas)} <AyudaIgv lectura={igv} /></span>;
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
            // Sin el Resultado la cifra no trae el costo de lo vendido: no son «Costos».
            label={def.key === "gastos" && conCostoDeVenta === false ? "Gastos del mes" : def.label}
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
