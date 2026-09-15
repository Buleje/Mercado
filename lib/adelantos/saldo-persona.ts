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
  /** PEN si no viene — mismo default que el resto del módulo (shared.tsx). */
  moneda?: string | null;
  status: string;
  fechaAdelanto?: string | Date | null;
};

export type ResumenPersona = {
  /**
   * Cada total va agrupado por moneda — nunca un número solo. Una persona con
   * un adelanto en soles y otro en dólares mezclados en un solo `number`
   * mostraba "debe S/ 250" sumando 200 PEN + 50 USD como si fueran la misma
   * unidad (auditoría de esta sesión, mismo bug que ya se corrigió en
   * urgencia-cobranza.ts). Renderizar con `fmtMonedas` de shared.tsx.
   */
  /** Plata que se le entregó alguna vez, sin contar lo cancelado. */
  totalAdelantado: Record<string, number>;
  /** Lo que debe HOY: sólo adelantos abiertos. La cifra que gobierna el tope. */
  saldoPendiente: Record<string, number>;
  /** Lo que YA liquidó con entregas, sobre los adelantos vivos. */
  totalEntregado: Record<string, number>;
  /**
   * Lo que entregó DE MÁS (adelantos EXCEDIDO, de saldo negativo): plata a favor
   * de la persona. Va aparte y no restando el saldo, porque son dos deudas en
   * direcciones opuestas y sumarlas esconde las dos.
   */
  saldoAFavor: Record<string, number>;
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
  const totalAdelantado: Record<string, number> = {};
  const saldoPendiente: Record<string, number> = {};
  const totalEntregado: Record<string, number> = {};
  const saldoAFavor: Record<string, number> = {};
  let adelantosAbiertos = 0;
  let adelantosLiquidados = 0;
  let adelantosCancelados = 0;
  let ultimoAdelanto: string | null = null;

  const sumar = (map: Record<string, number>, moneda: string, monto: number) => {
    map[moneda] = (map[moneda] ?? 0) + monto;
  };

  for (const a of adelantos) {
    if (a.status === "CANCELADO") {
      adelantosCancelados += 1;
      /* Un adelanto cancelado no se cobra ni cuenta como plata entregada: se
         guarda por historial, no por contabilidad. */
      continue;
    }

    const moneda = a.moneda || "PEN";
    sumar(totalAdelantado, moneda, a.montoAdelantado);
    sumar(totalEntregado, moneda, Math.max(0, a.montoAdelantado - a.saldoPendiente));

    if (a.status === "ABIERTO") {
      adelantosAbiertos += 1;
      sumar(saldoPendiente, moneda, a.saldoPendiente);
    } else if (a.status === "LIQUIDADO") {
      adelantosLiquidados += 1;
    } else if (a.status === "EXCEDIDO") {
      sumar(saldoAFavor, moneda, Math.max(0, -a.saldoPendiente));
    }

    const iso = aIso(a.fechaAdelanto);
    if (iso && (!ultimoAdelanto || iso > ultimoAdelanto)) ultimoAdelanto = iso;
  }

  const redondear = (m: Record<string, number>): Record<string, number> =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, r2(v)]));

  return {
    totalAdelantado: redondear(totalAdelantado),
    saldoPendiente: redondear(saldoPendiente),
    totalEntregado: redondear(totalEntregado),
    saldoAFavor: redondear(saldoAFavor),
    adelantosAbiertos,
    adelantosLiquidados,
    adelantosCancelados,
    ultimoAdelanto,
  };
}

/**
 * Cómo se portó: de 0 a 100, cuánto de lo que sacó ya devolvió.
 *
 * Es el dato que decide si conviene volver a adelantarle y que hasta ahora
 * había que deducir mirando la lista. Sin historial no hay nota que dar —
 * inventarle un 100 a quien nunca sacó nada sería mentir a favor.
 */
export function cumplimientoDe(resumen: ResumenPersona): number | null {
  // Es una nota de comportamiento (0-100), no plata mostrada: sumar las
  // monedas para esta cuenta es la misma aproximación que ya se acepta en
  // "% de la cartera" de Cobranza — acá no hay tipo de cambio cargado.
  const adelantado = Object.values(resumen.totalAdelantado).reduce((s, v) => s + v, 0);
  const entregado = Object.values(resumen.totalEntregado).reduce((s, v) => s + v, 0);
  if (!(adelantado > 0)) return null;
  return Math.min(100, Math.max(0, Math.round((entregado / adelantado) * 100)));
}
