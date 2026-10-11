/**
 * lib/finance/comparativo-periodos.ts — un mes contra otro (Mi Plata › Reportes
 * comparativos).
 *
 * Por qué existe (11-10): la pantalla leía `/api/admin/dashboard?from&to`, que
 * IGNORA el rango y devuelve listas (`orders`, `sales`…), no totales. Todas las
 * cifras salían S/ 0,00 y «Pedidos» salía `NaN` (`Number(json.orders)` de un
 * arreglo de 2+ pedidos). Medido en `main`: octubre tenía 1 venta del POS y la
 * pantalla decía S/ 0,00 y «NaN%».
 *
 * Las cifras salen de la MISMA regla de ingresos que el resto de Mi Plata
 * (`ingresos-del-periodo.ts`: ventas del POS + pedidos concretados, mes de
 * calendario de Lima). Este archivo es PURO: arma el período desde los
 * agregados que trae `ComparativoPeriodosDB` y calcula la variación. Ninguna
 * cifra puede salir `NaN`: lo que no se puede calcular es `null` («—»).
 */
import { mesesHasta } from "@/lib/finance/ingresos-del-periodo";

export type Contra = "mes_pasado" | "mismo_mes_anyo";

export const CONTRAS: readonly Contra[] = ["mes_pasado", "mismo_mes_anyo"];

/** Los agregados crudos de un mes (lo que devuelve la clase DB). */
export interface AgregadosDelMes {
  ventasPos: { total: number; cuantas: number; conCosto: number; costo: number };
  pedidos: { total: number; cuantos: number; conCosto: number; costo: number };
  clientesNuevos: number;
  fiado: { total: number; cuantos: number };
}

/** Un mes listo para mostrar. `null` = no se puede calcular (se muestra «—»). */
export interface PeriodoComparativo {
  mes: string;
  /** Ventas del POS + pedidos concretados: el «ingresos» de Mi Plata. */
  ventas: number;
  /** Cuántas ventas del POS + cuántos pedidos concretados. */
  transacciones: number;
  ticketPromedio: number | null;
  /** Margen bruto en %, sólo sobre lo que tiene costo guardado. */
  margen: number | null;
  clientesNuevos: number;
  /** Fiado dado en el mes (lo que se fió, no lo que queda por cobrar hoy). */
  fiadoDado: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const fin = (v: unknown) => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

export function armarPeriodo(mes: string, a: AgregadosDelMes): PeriodoComparativo {
  const ventas = r2(fin(a.ventasPos.total) + fin(a.pedidos.total));
  const transacciones = Math.max(0, Math.trunc(fin(a.ventasPos.cuantas) + fin(a.pedidos.cuantos)));
  const conCosto = fin(a.ventasPos.conCosto) + fin(a.pedidos.conCosto);
  const costo = fin(a.ventasPos.costo) + fin(a.pedidos.costo);
  return {
    mes,
    ventas,
    transacciones,
    ticketPromedio: transacciones > 0 ? r2(ventas / transacciones) : null,
    margen: conCosto > 0 ? Math.round(((conCosto - costo) / conCosto) * 1000) / 10 : null,
    clientesNuevos: Math.max(0, Math.trunc(fin(a.clientesNuevos))),
    fiadoDado: r2(fin(a.fiado.total)),
  };
}

/**
 * Variación en % de `actual` contra `base`. `null` cuando no hay base con qué
 * comparar (base 0 o algún lado sin dato): «+100 %» desde cero mentía.
 */
export function variacion(actual: number | null, base: number | null): number | null {
  if (actual == null || base == null || !Number.isFinite(actual) || !Number.isFinite(base) || base === 0) return null;
  const v = ((actual - base) / Math.abs(base)) * 100;
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
}

/** El mes contra el que se compara `mes` (`YYYY-MM`). */
export function mesDeComparacion(mes: string, contra: Contra): string {
  if (contra === "mes_pasado") return mesesHasta(mes, 2)[0];
  const [y, m] = mes.split("-");
  return `${Number(y) - 1}-${m}`;
}

export function esContra(v: string | null | undefined): v is Contra {
  return (CONTRAS as readonly string[]).includes(v ?? "");
}
