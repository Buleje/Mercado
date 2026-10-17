"use client";

/**
 * useExcepcionesDeSaldos — «Qué revisar», con todo lo que antes vivía
 * escondido detrás de una pestaña.
 *
 * Al saldo (especies en negativo, stock despachado de más, valle, corridas sin
 * declarar, sin validar, por agotarse) se suman cuatro avisos de cómo está la
 * planta: origen incompleto, lotes vencidos o añejos, madera varada (60 días o
 * más) y m³ sin costo. Los dos últimos salen de la antigüedad por guía; si esa
 * lectura no llegó, no se afirma nada de ellos.
 */

import { useMemo } from "react";
import type { Concil, SaldosData } from "@/hooks/use-ctp-saldos";
import type { EspecieSinIngreso } from "@/lib/forestal/corrida-compra";
import type { ResumenAntiguedad } from "@/lib/forestal/antiguedad-por-guia";
import type { EstadoFuente } from "@/lib/forestal/capacidad-de-planta";
import { excepcionesDeSaldo, type Excepcion } from "@/lib/forestal/ctp-saldos-excepciones";
import { entradaDeExcepciones } from "@/lib/forestal/ctp-saldos-excepciones-entrada";
import type { ResumenOrigen } from "@/lib/forestal/origen-incompleto";
import type { LoteDeReporte } from "@/lib/forestal/saldos-reporte";
import type { CurvaSaldoData } from "../saldos/CurvaDeSaldo";

export function useExcepcionesDeSaldos({
  data,
  curva,
  concil,
  origen,
  lotes,
  estadoAntiguedad,
  antiguedad,
  especiesSinIngreso,
}: {
  data: SaldosData | null;
  curva: CurvaSaldoData | null;
  concil: Concil | null;
  origen: ResumenOrigen;
  lotes: readonly LoteDeReporte[];
  estadoAntiguedad: EstadoFuente;
  antiguedad: ResumenAntiguedad;
  /** ADR-485: especies aserradas sin ningún ingreso (todo el libro). `undefined` = no llegó. */
  especiesSinIngreso?: readonly EspecieSinIngreso[];
}): Excepcion[] {
  return useMemo(() => {
    if (!data) return [];
    /* La entrada se arma en `entradaDeExcepciones` (la misma que usa el
       superadmin): sin la antigüedad no se afirma nada de lo varado. */
    return excepcionesDeSaldo(
      entradaDeExcepciones({
        saldos: data,
        curva,
        concil,
        origen,
        lotes,
        antiguedad: estadoAntiguedad === "ok" ? antiguedad : null,
        especiesSinIngreso,
      }),
    );
  }, [data, curva, concil, origen, lotes, estadoAntiguedad, antiguedad, especiesSinIngreso]);
}
