"use client";

import { DashboardSection, type SectionKPI } from "../_shared";
import { useChartRegistration } from "@/lib/admin/charts-visibility";
import { hayTendencia, kpiSinDato } from "@/lib/admin/inicio/hay-datos";
import { COLOR_CONCEPTO, fechaConDia, soles } from "@/lib/admin/inicio/formato-tablero";
import { BarrasPorDia, type Serie } from "./graficos-resumen";

/**
 * «Cómo van tus días» — el ritmo de las ventas del período: la barra de cada
 * día (o tramo de 4 h si el rango es hoy) y cuatro cifras que la leen.
 *
 * Reemplaza (2026-10-09) a la «Meta del mes» y al gráfico «Ventas, pedidos y
 * clientes por día»:
 *  - la meta era lo vendido × 1,2 sobre el mismo promedio, así que el avance
 *    salía siempre ≈75 % y la proyección ≈83 %: una cifra que no informa;
 *  - pedidos y clientes por día NO eran datos: se repartían en proporción a la
 *    venta del día. Quedan los totales reales (arriba, en el hero).
 */

const SERIE: Serie[] = [{ key: "ventas", nombre: "Vendiste", color: COLOR_CONCEPTO.ventas }];

export interface DiaDeVenta {
  day: string;
  iso: string;
  ventas: number;
}

interface Props {
  dias: DiaDeVenta[];
  /** «este mes», «esta semana»… */
  rango: string;
  /** true si el rango es un solo día: los tramos son de 4 h, no días. */
  porHoras: boolean;
  /** «22:00» o null si no hay muestra suficiente. */
  horaPico: string | null;
}

function GraficoDias({
  dias,
  promedio,
  porHoras,
}: {
  dias: DiaDeVenta[];
  promedio: number;
  porHoras: boolean;
}) {
  const hasData = hayTendencia(dias, ["ventas"]);
  const { visible } = useChartRegistration("resumen.ventas-por-dia", {
    label: porHoras ? "Ventas por horario" : "Ventas por día",
    hasData,
  });
  if (!visible) return null;
  return (
    <BarrasPorDia
      data={dias}
      series={SERIE}
      formato="soles"
      alto={170}
      promedio={porHoras ? null : promedio}
    />
  );
}

export function RitmoDelPeriodo({ dias, rango, porHoras, horaPico }: Props) {
  const total = dias.reduce((s, d) => s + d.ventas, 0);
  const promedio = total / Math.max(1, dias.length);
  const conVenta = dias.filter((d) => d.ventas > 0).length;
  let mejor: DiaDeVenta | null = null;
  for (const d of dias) if (d.ventas > 0 && (!mejor || d.ventas > mejor.ventas)) mejor = d;

  const kpis: SectionKPI[] = [
    porHoras
      ? {
          label: "Mejor horario",
          value: mejor ? `${mejor.day.replace("h", ":00")}` : null,
          sub: mejor ? soles(mejor.ventas) : undefined,
          sinDatoHint: "Todavía no hay ventas hoy.",
        }
      : {
          label: "Promedio por día",
          value: soles(promedio),
          sinDato: kpiSinDato(promedio),
          sub: `en ${dias.length} días`,
          hint: "Lo vendido en el período ÷ los días del período (con venta o sin ella).",
        },
    porHoras
      ? {
          label: "Tramos con venta",
          value: `${conVenta} de ${dias.length}`,
          sinDato: conVenta === 0,
          hint: "Tramos de 4 horas del día con al menos una venta.",
        }
      : {
          label: "Mejor día",
          value: mejor ? fechaConDia(mejor.iso) : null,
          sub: mejor ? soles(mejor.ventas) : undefined,
          sinDatoHint: "Ningún día con ventas en el período.",
        },
    ...(porHoras
      ? []
      : [
          {
            label: "Días con venta",
            value: `${conVenta} de ${dias.length}`,
            sinDato: conVenta === 0,
            hint: "Días del período con al menos una venta.",
          } satisfies SectionKPI,
        ]),
    {
      label: "Hora pico",
      value: horaPico,
      sinDatoHint: "Hace falta al menos 5 ventas o pedidos para saber a qué hora te compran más.",
      hint: "La hora con más ventas y pedidos registrados.",
    },
  ];

  return (
    <DashboardSection kicker={`Ritmo · ${rango}`} title="Cómo van tus días" kpis={kpis}>
      <GraficoDias dias={dias} promedio={promedio} porHoras={porHoras} />
    </DashboardSection>
  );
}
