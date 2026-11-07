"use client";

/**
 * «Cómo se movió»: ¿sube o baja?, cómo se llegó al saldo y de qué está hecho.
 *
 * La foto del saldo no dice hacia dónde va, y es con lo que se decide comprar
 * madera. Sin cambios de contenido en el rediseño del 24-09.
 */

import type { Concil, SaldosData } from "@/hooks/use-ctp-saldos";
import { ctpPeriodShortLabel, type CtpPeriod } from "@/lib/forestal/ctp-period";
import CtpSaldosGraficos from "../CtpSaldosGraficos";
import CurvaDeSaldo, { type CurvaSaldoData } from "./CurvaDeSaldo";

export default function SeccionMovimiento({
  data,
  curva,
  period,
  concil,
  aperturaPendiente,
}: {
  data: SaldosData;
  curva: CurvaSaldoData | null;
  period: CtpPeriod;
  /** La conciliación: de ahí sale la existencia heredada del cierre anterior. */
  concil: Concil | null;
  aperturaPendiente: boolean;
}) {
  /* Existencia heredada: la cascada arranca donde terminó el mes pasado. Sin
     conciliación no se conoce, y `null` es distinto de 0. */
  const apertura = concil ? concil.materiaPrima.reduce((a, s) => a + s.apertura, 0) : null;
  return (
    <>
      {curva && <CurvaDeSaldo curva={curva} periodoLabel={ctpPeriodShortLabel(period)} />}
      <CtpSaldosGraficos
        materiaPrima={data.materiaPrima}
        porEspecie={data.porEspecie}
        apertura={apertura}
        aperturaPendiente={aperturaPendiente}
      />
    </>
  );
}
