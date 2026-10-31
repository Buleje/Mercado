"use client";

/**
 * Los indicadores de Gastos, plegados en el botón de la cabecera: lo gastado
 * en el período elegido, lo gastado desde siempre, los fijos del catálogo (que
 * no suman hasta que se pagan). Arriba de las tarjetas, los últimos 6 meses y
 * el reparto por categoría (la que más pesa va primera: no lleva tarjeta aparte,
 * sería la misma cifra dos veces).
 *
 * Antes eran dos tarjetas grandes al lado del rango de fechas, una línea de
 * fijos y ocho tarjetas de categoría: la lista empezaba a 1,4 pantallas.
 */

import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { formatCurrency } from "@/lib/format";
import { diaConNombre } from "@/lib/gastos/lista-gastos";
import { tarjetasDe, type Indicador } from "@/components/admin/unified/finanzas/movimientos/TarjetaIndicador";
import ResumenDeGastos, { type CategoriaDeGasto, type MesDeGasto } from "./ResumenDeGastos";

interface Entrada {
  /** Lo gastado en el período (suma de la lista que mandó el servidor). */
  delPeriodo: number;
  cuantosDelPeriodo: number;
  desde: string;
  hasta: string;
  /** Por categoría, desde siempre (`/api/expenses/summary`). */
  categorias: CategoriaDeGasto[];
  /** Los fijos del catálogo: cuántos y cuánto suman pagados una vez cada uno. */
  fijos: { cuantos: number; monto: number };
  porMes: MesDeGasto[];
  cargando: boolean;
}

export function useIndicadoresGastos({ delPeriodo, cuantosDelPeriodo, desde, hasta, categorias, fijos, porMes, cargando }: Entrada) {
  const desdeSiempre = categorias.reduce((s, c) => s + c.total, 0);
  const cuantosSiempre = categorias.reduce((s, c) => s + c.count, 0);
  const tarjetas: Indicador[] = [
    {
      rotulo: "En el período",
      valor: formatCurrency(delPeriodo),
      nota: `${diaConNombre(desde)} al ${diaConNombre(hasta)} · ${cuantosDelPeriodo} ${cuantosDelPeriodo === 1 ? "gasto" : "gastos"}`,
      tono: "destacado",
    },
    { rotulo: "Desde siempre", valor: formatCurrency(desdeSiempre), nota: `${cuantosSiempre} ${cuantosSiempre === 1 ? "gasto" : "gastos"}` },
    ...(fijos.cuantos > 0
      ? [
          {
            rotulo: "Fijos del catálogo",
            valor: formatCurrency(fijos.monto),
            nota: `${fijos.cuantos} ${fijos.cuantos === 1 ? "fijo" : "fijos"}, pagados una vez cada uno`,
            ayuda: "Son el acuerdo de pagar (el alquiler, la luz), no plata que salió: no suman en los gastos hasta que registres el pago. Un fijo semanal se paga varias veces al mes.",
          },
        ]
      : []),
  ];
  return useKpisPlegables({
    claveMemoria: "plata-gastos",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: cargando,
    /* Corto: el titular del botón se corta a ~22 caracteres. */
    resumen: `Período ${formatCurrency(delPeriodo)}`,
    encabezado: <ResumenDeGastos porMes={porMes} categorias={categorias} total={desdeSiempre} />,
    tarjetas: tarjetasDe(tarjetas),
  });
}
