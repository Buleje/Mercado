/**
 * Cronograma de cuotas de un préstamo — fuente única del cálculo.
 *
 * La tasa del préstamo (`Prestamo.tasaInteres`) es MENSUAL y en porcentaje:
 * `2` = 2 % al mes. Así la pide el formulario («Tasa mensual %»), así la
 * imprimen el contrato y el cronograma («2 % mensual») y así la traen los
 * bancos de referencia (BCP 1,5 % mensual ↔ TEA 19,56 % = 1,015¹² − 1).
 * Hasta el 11-10 el servidor la dividía entre 12 (la trataba como anual) y los
 * intereses salían 12 veces más bajos: S/ 1.000 al 2 % en 3 cuotas daba
 * S/ 334,45 por cuota en vez de S/ 346,75.
 *
 * Todo el cálculo va en céntimos enteros (sin deriva del float): cada interés
 * se redondea al céntimo y la última cuota cierra el capital exacto.
 * Sin `server-only`: es aritmética pura, la vista previa del panel puede usarla.
 */

export type SistemaAmortizacion = "FRANCES" | "ALEMAN" | "AMERICANO";

export type CuotaCalculada = {
  numeroCuota: number;
  /** Lo que se paga en la cuota (capital + interés), en soles. */
  monto: number;
  capital: number;
  interes: number;
  fechaVence: Date;
};

/** 2 (por ciento mensual) → 0,02. Negativo, NaN o 0 → 0 (préstamo sin interés). */
export function tasaMensualDecimal(tasaMensualPct: number): number {
  return Number.isFinite(tasaMensualPct) && tasaMensualPct > 0 ? tasaMensualPct / 100 : 0;
}

export function aCentimos(soles: number): number {
  return Math.round(soles * 100);
}

function aSoles(centimos: number): number {
  return centimos / 100;
}

/** Cuota fija del sistema francés, en céntimos: P·i / (1 − (1 + i)^−n). */
export function cuotaFijaFrancesCentimos(capitalCentimos: number, i: number, n: number): number {
  if (n <= 0 || capitalCentimos <= 0) return 0;
  if (i <= 0) return Math.round(capitalCentimos / n);
  return Math.round((capitalCentimos * i) / (1 - Math.pow(1 + i, -n)));
}

/**
 * `meses` después, el mismo día del mes; si ese mes es más corto, su último
 * día (31-01 → 28-02 → 31-03 → 30-04), nunca el 03-03 que daba `setMonth`.
 * En UTC: el mismo resultado en Vercel y en la PC (Lima), y el «2026-01-31»
 * del formulario llega como medianoche UTC.
 */
export function fechaDeCuota(inicio: Date, meses: number): Date {
  const anio = inicio.getUTCFullYear();
  const mes = inicio.getUTCMonth() + meses;
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  const f = new Date(inicio);
  f.setUTCFullYear(anio, mes, Math.min(inicio.getUTCDate(), ultimoDia));
  return f;
}

type Fila = { capital: number; interes: number };

function cuota(numeroCuota: number, f: Fila, inicio: Date): CuotaCalculada {
  return {
    numeroCuota,
    monto: aSoles(f.capital + f.interes),
    capital: aSoles(f.capital),
    interes: aSoles(f.interes),
    fechaVence: fechaDeCuota(inicio, numeroCuota),
  };
}

/** Meses de gracia: sólo interés sobre el capital entero. */
function filasDeGracia(capital: number, i: number, gracia: number): Fila[] {
  return Array.from({ length: Math.max(0, gracia) }, () => ({ capital: 0, interes: Math.round(capital * i) }));
}

function filasFrances(capital: number, i: number, n: number): Fila[] {
  const fija = cuotaFijaFrancesCentimos(capital, i, n);
  const filas: Fila[] = [];
  let saldo = capital;
  for (let k = 1; k <= n; k++) {
    const interes = Math.round(saldo * i);
    const amortiza = k === n ? saldo : Math.min(saldo, Math.max(0, fija - interes));
    saldo -= amortiza;
    filas.push({ capital: amortiza, interes });
  }
  return filas;
}

function filasAleman(capital: number, i: number, n: number): Fila[] {
  const fijo = Math.round(capital / n);
  const filas: Fila[] = [];
  let saldo = capital;
  for (let k = 1; k <= n; k++) {
    const interes = Math.round(saldo * i);
    const amortiza = k === n ? saldo : Math.min(saldo, fijo);
    saldo -= amortiza;
    filas.push({ capital: amortiza, interes });
  }
  return filas;
}

/** Americano: interés todos los meses (gracia incluida) y el capital entero al final. */
function filasAmericano(capital: number, i: number, periodos: number): Fila[] {
  const interes = Math.round(capital * i);
  return Array.from({ length: periodos }, (_, k) => ({ capital: k === periodos - 1 ? capital : 0, interes }));
}

/**
 * Cuotas de un préstamo: `gracia` meses de sólo interés y después `n` cuotas
 * del sistema elegido. La cuota k vence k meses después de `inicio`.
 */
export function generarCuotas(
  monto: number,
  tasaMensualPct: number,
  n: number,
  sistema: SistemaAmortizacion,
  gracia: number,
  inicio: Date,
): CuotaCalculada[] {
  const capital = aCentimos(monto);
  const i = tasaMensualDecimal(tasaMensualPct);
  const cuotas = Math.max(1, Math.trunc(n));
  const mesesGracia = Math.max(0, Math.trunc(gracia));

  const filas =
    sistema === "AMERICANO"
      ? filasAmericano(capital, i, mesesGracia + cuotas)
      : [
          ...filasDeGracia(capital, i, mesesGracia),
          ...(sistema === "ALEMAN" ? filasAleman(capital, i, cuotas) : filasFrances(capital, i, cuotas)),
        ];

  return filas.map((f, k) => cuota(k + 1, f, inicio));
}

/**
 * Capital que falta devolver: lo que se refinancia. NO es la suma de las
 * cuotas pendientes (esas ya traen su interés; volver a cobrarle interés sería
 * interés sobre interés). Cuotas viejas sin desglose (capital e interés en 0)
 * cuentan su monto entero.
 */
export function capitalPendiente(
  cuotas: ReadonlyArray<{ monto: number; capital: number; interes: number; pagadoEn?: string | null | undefined }>,
): number {
  const centimos = cuotas
    .filter((c) => !c.pagadoEn)
    .reduce((s, c) => s + aCentimos(c.capital > 0 || c.interes > 0 ? c.capital : c.monto), 0);
  return aSoles(centimos);
}

export type FilaVistaPrevia = { num: number; cuota: number; interes: number; capital: number; saldo: number };

/**
 * La tabla que muestra la Calculadora del panel: las MISMAS cuotas que guarda
 * el servidor al crear (mismo céntimo), más el saldo de capital tras cada una.
 */
export function tablaDeAmortizacion(
  monto: number,
  tasaMensualPct: number,
  n: number,
  sistema: SistemaAmortizacion,
): FilaVistaPrevia[] {
  let saldo = aCentimos(monto);
  return generarCuotas(monto, tasaMensualPct, n, sistema, 0, new Date()).map((c) => {
    saldo -= aCentimos(c.capital);
    return { num: c.numeroCuota, cuota: c.monto, interes: c.interes, capital: c.capital, saldo: aSoles(saldo) };
  });
}

/**
 * Fecha del formulario («2026-01-31», sin hora) → mediodía UTC de ese día.
 * `new Date("2026-01-31")` es medianoche UTC = 30-01 a las 19:00 en Lima: el
 * panel mostraba cada cuota un día antes («27 feb.» para la del 28). Con
 * mediodía, el día es el mismo en Lima y en UTC. Con hora, se respeta.
 */
export function fechaDelFormulario(texto: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? new Date(`${texto}T12:00:00.000Z`) : new Date(texto);
}
