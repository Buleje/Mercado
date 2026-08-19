/**
 * Cuánto debe una persona, de verdad.
 *
 * EL BUG QUE TAPA. El saldo por persona sumaba TODOS sus adelantos, incluidos
 * los CANCELADOS — que por definición ya no se cobran. Resultado medido en el
 * tenant real: la pestaña Adelantos decía «por recuperar S/ 3,933» y la de
 * Personas «S/ 34,805» para lo mismo, casi nueve veces más.
 *
 * Y no era sólo un número feo: a alguien con cuatro adelantos cancelados la
 * ficha le mostraba «Sin margen · debe S/ 9,250 de un tope de S/ 500», o sea
 * «no le fíes más» sobre una persona que no debe nada. Mientras tanto el guard
 * del backend —que sí filtra por ABIERTO— la dejaba pasar sin chistar: la
 * pantalla y la regla decían cosas distintas sobre la misma plata.
 *
 * Por eso `saldoPendiente` se define acá EXACTAMENTE como lo mide el guard de
 * `AdelantosDB.create`: la suma de los adelantos ABIERTOS. Una sola definición
 * para las dos puntas.
 */

/** Lo mínimo de un adelanto para sacar cuentas de su dueño. */
export type AdelantoDeLaPersona = {
  montoAdelantado: number;
  saldoPendiente: number;
  status: string;
  fechaAdelanto?: string | Date | null;
};

export type ResumenPersona = {
  /** Plata que se le entregó alguna vez, sin contar lo cancelado. */
  totalAdelantado: number;
  /** Lo que debe HOY: sólo adelantos abiertos. La cifra que gobierna el tope. */
  saldoPendiente: number;
  /** Lo que YA liquidó con entregas, sobre los adelantos vivos. */
  totalEntregado: number;
  /**
   * Lo que entregó DE MÁS (adelantos EXCEDIDO, de saldo negativo): plata a favor
   * de la persona. Va aparte y no restando el saldo, porque son dos deudas en
   * direcciones opuestas y sumarlas esconde las dos.
   */
  saldoAFavor: number;
  adelantosAbiertos: number;
  adelantosLiquidados: number;
  adelantosCancelados: number;
  /** Fecha del último adelanto vivo, o null si nunca sacó (o todo se canceló). */
  ultimoAdelanto: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

const aIso = (f: string | Date | null | undefined): string | null => {
  if (!f) return null;
  const d = f instanceof Date ? f : new Date(f);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export function resumirPersona(adelantos: readonly AdelantoDeLaPersona[]): ResumenPersona {
  const resumen: ResumenPersona = {
    totalAdelantado: 0,
    saldoPendiente: 0,
    totalEntregado: 0,
    saldoAFavor: 0,
    adelantosAbiertos: 0,
    adelantosLiquidados: 0,
    adelantosCancelados: 0,
    ultimoAdelanto: null,
  };

  for (const a of adelantos) {
    if (a.status === "CANCELADO") {
      resumen.adelantosCancelados += 1;
      /* Un adelanto cancelado no se cobra ni cuenta como plata entregada: se
         guarda por historial, no por contabilidad. */
      continue;
    }

    resumen.totalAdelantado += a.montoAdelantado;
    resumen.totalEntregado += Math.max(0, a.montoAdelantado - a.saldoPendiente);

    if (a.status === "ABIERTO") {
      resumen.adelantosAbiertos += 1;
      resumen.saldoPendiente += a.saldoPendiente;
    } else if (a.status === "LIQUIDADO") {
      resumen.adelantosLiquidados += 1;
    } else if (a.status === "EXCEDIDO") {
      resumen.saldoAFavor += Math.max(0, -a.saldoPendiente);
    }

    const iso = aIso(a.fechaAdelanto);
    if (iso && (!resumen.ultimoAdelanto || iso > resumen.ultimoAdelanto)) resumen.ultimoAdelanto = iso;
  }

  resumen.totalAdelantado = r2(resumen.totalAdelantado);
  resumen.saldoPendiente = r2(resumen.saldoPendiente);
  resumen.totalEntregado = r2(resumen.totalEntregado);
  resumen.saldoAFavor = r2(resumen.saldoAFavor);
  return resumen;
}

/**
 * Cómo se portó: de 0 a 100, cuánto de lo que sacó ya devolvió.
 *
 * Es el dato que decide si conviene volver a adelantarle y que hasta ahora
 * había que deducir mirando la lista. Sin historial no hay nota que dar —
 * inventarle un 100 a quien nunca sacó nada sería mentir a favor.
 */
export function cumplimientoDe(resumen: ResumenPersona): number | null {
  if (!(resumen.totalAdelantado > 0)) return null;
  return Math.min(100, Math.max(0, Math.round((resumen.totalEntregado / resumen.totalAdelantado) * 100)));
}
