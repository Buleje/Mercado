/**
 * Mi Plata con UNA sola ganancia: cruza la carga rápida del Resumen (ventas y
 * gastos registrados) con el resultado del servidor (`/api/finanzas/resultado`).
 * Puro, sin React: lo usa `use-resumen-plata.ts` y lo prueba
 * `__tests__/inicio-avisos-overview.test.ts`.
 */

import { MESES, type HealthData } from "@/components/admin/finanzas/shared";
import { formatMonthYear } from "@/lib/format";
import { margenDelResultado } from "@/lib/admin/margen-del-resultado";
import type { RespuestaResultado } from "@/lib/finance/resultado-del-negocio";
import type { MesResumen, Proyeccion } from "@/components/admin/unified/finanzas/resumen/tipos";

/** Lo que trae la carga rápida; el resultado del servidor se cruza después. */
export interface BaseDelMes {
  mesActual: string;
  ingresos: number;
  gastos: number;
  deuda: number;
  fiados: number;
  puntoEq: number;
  diasTranscurridos: number;
  diasTotales: number;
  fiadosVencidos: number;
  payablesVencidos: number;
  meses: { clave: string; ingresos: number; gastos: number }[];
}

function etiquetasDeMes(clave: string): { mes: string; fullMonth: string } {
  const [yy, mm] = clave.split("-").map(Number);
  const d = new Date(yy, (mm ?? 1) - 1, 1);
  return { mes: MESES[d.getMonth()], fullMonth: formatMonthYear(d, { largo: true }) };
}

/**
 * Una sola ganancia en Mi Plata. Cuando el rol ve el resultado del servidor,
 * Ingresos, Gastos (= sus costos: incluye el costo de lo vendido), Utilidad,
 * Margen, la proyección y las barras salen TODOS de ahí. Antes sólo la
 * utilidad venía del servidor y el resto de la cuenta vieja: medido 09-10 en
 * main, octubre decía Ingresos S/ 0 · Gastos S/ 0 · Utilidad −S/ 18 · Margen
 * −18 190 %, y setiembre gastos 386 con utilidad −2 966.
 * Sin el resultado (403 o falla) queda ingresos − gastos registrados.
 */
export function derivarDelResultado(base: BaseDelMes | null, resultado: RespuestaResultado | null): {
  kpis: Record<string, number>;
  monthlyData: MesResumen[];
  projection: Proyeccion | null;
  healthData: Omit<HealthData, "efectivo"> | null;
} {
  if (!base) return { kpis: {}, monthlyData: [], projection: null, healthData: null };
  const delMes = resultado?.actual?.mes === base.mesActual ? resultado.actual : null;
  const ingresos = delMes ? delMes.totalIngresos : base.ingresos;
  const gastos = delMes ? delMes.totalCostos : base.gastos;
  const utilidad = delMes ? delMes.resultado : ingresos - gastos;
  const margen = margenDelResultado(utilidad, ingresos);

  const kpis: Record<string, number> = {
    ingresos: Math.round(ingresos), gastos: Math.round(gastos), utilidad: Math.round(utilidad),
    deuda: Math.round(base.deuda), fiados: Math.round(base.fiados), puntoEq: base.puntoEq,
  };
  // Sin margen que decir (sin ingresos o pasado ±999 %) la clave no va.
  if (margen != null) kpis.margen = Math.round(margen);

  const serie = resultado?.serie ?? [];
  const monthlyData: MesResumen[] = serie.length > 0
    ? serie.map((p) => ({ ...etiquetasDeMes(p.mes), ingresos: Math.round(p.ingresos), gastos: Math.round(p.costos), utilidad: Math.round(p.resultado) }))
    : base.meses.map((m) => ({ ...etiquetasDeMes(m.clave), ingresos: Math.round(m.ingresos), gastos: Math.round(m.gastos), utilidad: Math.round(m.ingresos - m.gastos) }));

  return {
    kpis,
    monthlyData,
    projection: { ventasMes: ingresos, gastosMes: gastos, diasTranscurridos: base.diasTranscurridos, diasTotales: base.diasTotales },
    healthData: { ingresos, gastos, gastosMensuales: gastos, fiadosVencidos: base.fiadosVencidos, payablesVencidos: base.payablesVencidos },
  };
}
