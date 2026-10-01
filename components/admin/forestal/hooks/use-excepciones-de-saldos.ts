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
import type { ResumenAntiguedad } from "@/lib/forestal/antiguedad-por-guia";
import type { EstadoFuente } from "@/lib/forestal/capacidad-de-planta";
import { excepcionesDeSaldo, type Excepcion } from "@/lib/forestal/ctp-saldos-excepciones";
import { DIAS_LOTE_ANEJO } from "@/lib/forestal/lotes-aserrio";
import type { ResumenOrigen } from "@/lib/forestal/origen-incompleto";
import { TRAMOS_DIAS_PATIO } from "@/lib/forestal/patio-resumen";
import type { LoteDeReporte } from "@/lib/forestal/saldos-reporte";
import type { CurvaSaldoData } from "../saldos/CurvaDeSaldo";

const anejo = (l: LoteDeReporte) =>
  !l.vencido && l.status === "abierto" && (l.diasParado ?? 0) > DIAS_LOTE_ANEJO;

export function useExcepcionesDeSaldos({
  data,
  curva,
  concil,
  origen,
  lotes,
  estadoAntiguedad,
  antiguedad,
}: {
  data: SaldosData | null;
  curva: CurvaSaldoData | null;
  concil: Concil | null;
  origen: ResumenOrigen;
  lotes: readonly LoteDeReporte[];
  estadoAntiguedad: EstadoFuente;
  antiguedad: ResumenAntiguedad;
}): Excepcion[] {
  return useMemo(() => {
    if (!data) return [];
    const conAntiguedad = estadoAntiguedad === "ok";
    return excepcionesDeSaldo({
      materiaPrima: data.materiaPrima,
      porEspecie: data.porEspecie,
      productos: data.productos,
      valleDelPeriodo: curva?.valle ?? null,
      /* La existencia FINAL manda sobre el movimiento: con stock heredado se
         puede consumir más de lo recibido sin que el libro esté mal. */
      existenciaFinal: concil?.materiaPrima.map((m) => ({ especie: m.especie, final: m.final })),
      origenIncompleto: { corridas: origen.corridas.length, m3: origen.m3SinCertificar },
      lotes: {
        vencidos: lotes.filter((l) => l.vencido).map((l) => l.code),
        anejos: lotes.filter(anejo).map((l) => l.code),
        diasAnejo: DIAS_LOTE_ANEJO,
      },
      guiasVaradas: conAntiguedad
        ? { ...antiguedad.varadas, dias: TRAMOS_DIAS_PATIO[2] }
        : undefined,
      sinCosto: conAntiguedad
        ? { m3: antiguedad.m3SinCosto, guias: antiguedad.guiasSinCosto }
        : undefined,
    });
  }, [data, curva, concil, origen, lotes, estadoAntiguedad, antiguedad]);
}
