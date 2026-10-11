/**
 * Conciliación bancaria — cuadrar el extracto del banco con lo que anotó el sistema.
 *
 * Lee el extracto tal como lo baja el banco (BCP, Interbank, BBVA, Scotiabank:
 * con filas de título arriba, columnas en cualquier orden, `Monto` con signo o
 * `Cargo` / `Abono` aparte, fechas «15/10/2026») o el formato simple
 * `fecha,descripción,monto,referencia`, y lo cruza con los movimientos del
 * sistema en cuatro grupos: coinciden, con diferencia de monto, sólo en el banco
 * y sólo en el sistema.
 *
 * Puro: sin base ni red (lo prueba `__tests__/bank-reconciliation.test.ts`). La
 * ruta `/api/finanzas/conciliacion` lee el archivo, trae lo del sistema
 * (`ConciliacionBancariaDB`) y llama a `cuadrarConElBanco`. NO guarda nada.
 *
 * ANTES (hasta 2026-10-11): `parseBankCsv` tomaba las columnas por posición y
 * `new Date("15/10/2026")` daba inválido, así que con un extracto real ninguna
 * fila cruzaba por fecha; y el cruce por referencia daba «coincide» aunque los
 * montos fueran distintos.
 */

export interface BankRow {
  /** Día del movimiento, `YYYY-MM-DD`. */
  date: string;
  description: string;
  /** Con signo: abono (entra) positivo, cargo (sale) negativo. */
  amount: number;
  reference?: string;
}

export interface SystemPayment {
  id: string;
  /** Día en Lima, `YYYY-MM-DD`. */
  date: string;
  /** Con signo: lo que entra positivo, lo que sale negativo. */
  amount: number;
  reference?: string;
  /** De dónde sale: «Tesorería», «Venta · yape», «Caja · plin», «Pedido · yape». */
  method?: string;
  description?: string;
}

export interface ParCuadrado {
  banco: BankRow;
  sistema: SystemPayment;
}

export interface ParConDiferencia extends ParCuadrado {
  /** Banco − sistema, redondeado al céntimo. */
  diferencia: number;
}

export interface CuadreBanco {
  coinciden: ParCuadrado[];
  conDiferencia: ParConDiferencia[];
  soloBanco: BankRow[];
  soloSistema: SystemPayment[];
}

export interface ExtractoLeido {
  filas: BankRow[];
  /** Filas con algo escrito que no tenían fecha o monto legible (títulos, totales, saldos). */
  descartadas: number;
  /** `cabecera` = se reconocieron las columnas por su nombre; `posicional` = fecha, descripción, monto, referencia. */
  formato: "cabecera" | "posicional";
}

/** Un céntimo: dos montos a menos de esto son el mismo. */
export const TOLERANCIA_MONTO = 0.01;
/** El banco puede anotar el movimiento hasta 3 días antes o después (fin de semana, abono de tarjeta). */
export const TOLERANCIA_DIAS = 3;
/**
 * Hasta dónde dos montos parecidos se emparejan como «con diferencia»: la
 * comisión de la tarjeta (~4,5 %) o un redondeo. Más que eso son movimientos distintos.
 */
export const DIFERENCIA_RELATIVA = 0.05;
export const DIFERENCIA_MINIMA = 0.5;

const redondear = (n: number) => Math.round(n * 100) / 100;

// ── Leer el archivo ─────────────────────────────────────────────────────────

/** «Nro. de Operación» → «nro de operacion». */
function normalizarCabecera(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function celdaTexto(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return fechaDeDate(v) ?? "";
  return String(v).trim();
}

const MESES: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, set: 9, sep: 9, oct: 10, nov: 11, dic: 12,
  jan: 1, apr: 4, aug: 8, dec: 12,
};

function armarFecha(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1) return null; // 31/02
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** ExcelJS entrega las fechas como `Date` a medianoche UTC. */
function fechaDeDate(d: Date): string | null {
  if (!Number.isFinite(d.getTime())) return null;
  return armarFecha(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** `15/10/2026`, `15-10-26`, `2026-10-15`, `15-oct-2026`, `15OCT2026`, número de serie de Excel o `Date`. */
export function normalizarFecha(v: unknown): string | null {
  if (v instanceof Date) return fechaDeDate(v);
  if (typeof v === "number") {
    // Número de serie de Excel (días desde 1899-12-30): 2000 ≈ 36 526, 2100 ≈ 73 051.
    if (v > 36000 && v < 74000) return fechaDeDate(new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000));
    return null;
  }
  const s = celdaTexto(v).toLowerCase();
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return armarFecha(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/.exec(s);
  // Día primero (Perú); si el «mes» pasa de 12 es un extracto en inglés (mm/dd).
  if (m) return armarFecha(+m[3], +m[2], +m[1]) ?? (+m[2] > 12 ? armarFecha(+m[3], +m[1], +m[2]) : null);
  m = /^(\d{1,2})[-/ ]?([a-z]{3})[a-z]*\.?[-/ ]?(\d{4}|\d{2})(?!\d)/.exec(s);
  if (m && MESES[m[2]]) return armarFecha(+m[3], MESES[m[2]], +m[1]);
  return null;
}

/**
 * `1,234.56`, `-1,234.56`, `1.234,56`, `S/ 50.00`, `(50.00)`, `50.00-` o un número.
 * `null` si no hay cifra.
 */
export function parseMonto(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? redondear(v) : null;
  let s = celdaTexto(v);
  if (!/\d/.test(s)) return null;
  const negativo = /^\(.*\)$/.test(s) || /^-|-\s*$|^[^\d]*-/.test(s);
  s = s.replace(/[^\d.,]/g, "");
  const ultimaComa = s.lastIndexOf(",");
  const ultimoPunto = s.lastIndexOf(".");
  if (ultimaComa > ultimoPunto) {
    // La coma es decimal sólo si le siguen 1 o 2 cifras («1.234,56»); con 3 es de miles («1,234»).
    const decimales = s.length - ultimaComa - 1;
    s = decimales > 0 && decimales <= 2 ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return redondear(negativo ? -n : n);
}

interface Columnas {
  fecha: number;
  descripcion: number;
  monto: number;
  cargo: number;
  abono: number;
  referencia: number;
}

/** Ubica las columnas por su nombre; `null` si la fila no es la cabecera. */
function ubicarColumnas(fila: unknown[]): Columnas | null {
  const h = fila.map(normalizarCabecera);
  const buscar = (re: RegExp, excluir?: RegExp, tomadas: number[] = []) =>
    h.findIndex((x, i) => x !== "" && re.test(x) && !excluir?.test(x) && !tomadas.includes(i));
  let fecha = buscar(/^(fecha|fec|f operacion|f oper|date)\b/, /valuta|valor|proceso|venc|hora/);
  if (fecha < 0) fecha = buscar(/^(fecha|fec|date)\b/);
  let descripcion = buscar(/descripcion|concepto|detalle|glosa|description/, undefined, [fecha]);
  if (descripcion < 0) descripcion = buscar(/movimiento|operacion/, /numero|nro|hora|fecha/, [fecha]);
  const monto = buscar(/\b(monto|importe|amount)\b/, /saldo/);
  const cargo = buscar(/\b(cargos?|debitos?|retiros?|debe)\b/, /saldo|fecha/, [descripcion]);
  const abono = buscar(/\b(abonos?|creditos?|depositos?|haber)\b/, /saldo|fecha/, [descripcion]);
  const referencia = buscar(
    /\b(n|no|nro|num|numero) (de )?(operacion|op|doc|documento|referencia)\b|\boperacion numero\b|\breferencia\b|\bn operacion\b/,
    /hora|fecha/,
    [fecha, descripcion],
  );
  if (fecha < 0 || (monto < 0 && (cargo < 0 || abono < 0))) return null;
  return { fecha, descripcion, monto, cargo, abono, referencia };
}

const tieneAlgo = (fila: unknown[]) => fila.some((c) => celdaTexto(c) !== "");

/**
 * Filas de la hoja (CSV ya partido o celdas de Excel) → movimientos del banco.
 * Busca la cabecera en las primeras 30 filas (el BCP pone el titular y la
 * cuenta arriba); sin cabecera, lee por posición: fecha, descripción, monto, referencia.
 */
export function leerExtracto(filas: unknown[][]): ExtractoLeido {
  let inicio = 0;
  let cols: Columnas | null = null;
  for (let i = 0; i < Math.min(filas.length, 30); i++) {
    cols = ubicarColumnas(filas[i] ?? []);
    if (cols) {
      inicio = i + 1;
      break;
    }
  }
  const formato: ExtractoLeido["formato"] = cols ? "cabecera" : "posicional";
  if (!cols) {
    // Formato simple; si la primera fila es una cabecera que no se reconoció, se salta.
    const primera = normalizarCabecera((filas[0] ?? []).join(" "));
    inicio = /fecha|date|monto|importe/.test(primera) ? 1 : 0;
    cols = { fecha: 0, descripcion: 1, monto: 2, cargo: -1, abono: -1, referencia: 3 };
  }

  const salida: BankRow[] = [];
  let descartadas = 0;
  for (const fila of filas.slice(inicio)) {
    if (!fila || !tieneAlgo(fila)) continue;
    const date = normalizarFecha(fila[cols.fecha]);
    let amount: number | null;
    if (cols.monto >= 0) {
      amount = parseMonto(fila[cols.monto]);
    } else {
      const cargo = parseMonto(fila[cols.cargo]);
      const abono = parseMonto(fila[cols.abono]);
      amount = cargo == null && abono == null ? null : redondear(Math.abs(abono ?? 0) - Math.abs(cargo ?? 0));
    }
    if (!date || amount == null || amount === 0) {
      descartadas++;
      continue;
    }
    const reference = cols.referencia >= 0 ? celdaTexto(fila[cols.referencia]) : "";
    salida.push({
      date,
      description: cols.descripcion >= 0 ? celdaTexto(fila[cols.descripcion]) : "",
      amount,
      ...(reference ? { reference } : {}),
    });
  }
  return { filas: salida, descartadas, formato };
}

/** Elige el separador que más aparece fuera de comillas en las primeras líneas. */
function separadorDe(texto: string): string {
  const muestra = texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 15);
  let mejor = ",";
  let max = -1;
  for (const sep of [";", ",", "\t", "|"]) {
    let n = 0;
    for (const linea of muestra) {
      let enComillas = false;
      for (const ch of linea) {
        if (ch === '"') enComillas = !enComillas;
        else if (ch === sep && !enComillas) n++;
      }
    }
    if (n > max) {
      max = n;
      mejor = sep;
    }
  }
  return mejor;
}

/** CSV → filas, con comillas (`"Pago, cliente"`) y comillas dobladas (`""`). */
export function leerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  const sep = separadorDe(t);
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let enComillas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (enComillas) {
      if (ch === '"' && t[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (ch === '"') enComillas = false;
      else celda += ch;
    } else if (ch === '"') enComillas = true;
    else if (ch === sep) {
      fila.push(celda.trim());
      celda = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      fila.push(celda.trim());
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += ch;
  }
  if (celda !== "" || fila.length > 0) {
    fila.push(celda.trim());
    filas.push(fila);
  }
  return filas;
}

/** Atajo: texto CSV → movimientos del banco. */
export function parseBankCsv(csv: string): BankRow[] {
  return leerExtracto(leerCsv(csv)).filas;
}

/** Primer y último día del extracto; `null` si no hay filas. */
export function periodoDelExtracto(filas: BankRow[]): { desde: string; hasta: string } | null {
  if (filas.length === 0) return null;
  let desde = filas[0].date;
  let hasta = filas[0].date;
  for (const f of filas) {
    if (f.date < desde) desde = f.date;
    if (f.date > hasta) hasta = f.date;
  }
  return { desde, hasta };
}

/** Suma `dias` a un `YYYY-MM-DD`. */
export function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00.000Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}

// ── Cruzar ──────────────────────────────────────────────────────────────────

function diasEntre(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00.000Z`);
  const db = Date.parse(`${b}T00:00:00.000Z`);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Number.POSITIVE_INFINITY;
  return Math.abs(da - db) / 86_400_000;
}

/** «000123456» y «123456» son la misma operación; las letras no distinguen mayúsculas. */
function claveReferencia(r: string | undefined): string {
  const s = (r ?? "").toUpperCase().replace(/\s+/g, "");
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, "") : s;
}

const mismoMonto = (a: number, b: number) => Math.abs(a - b) < TOLERANCIA_MONTO;
const mismoSigno = (a: number, b: number) => Math.sign(a) === Math.sign(b);
const diferenciaAdmitida = (monto: number) => Math.max(DIFERENCIA_MINIMA, Math.abs(monto) * DIFERENCIA_RELATIVA);

/**
 * Cruza el banco con el sistema, en tres pasadas (cada movimiento del sistema
 * se usa una sola vez):
 *  1. misma referencia (N° de operación) → coinciden si el monto es igual; si no, con diferencia;
 *  2. mismo monto, a ≤ 3 días → coinciden (con varios candidatos, el de fecha más cercana:
 *     cinco Yape de S/ 5 el mismo día cuadran de a uno, no quedan «ambiguos»);
 *  3. monto parecido (≤ 5 % o S/ 0,50) del mismo signo, a ≤ 3 días → con diferencia
 *     (la comisión de la tarjeta).
 * Lo que sobra queda «sólo en el banco» o «sólo en el sistema».
 */
export function cuadrarConElBanco(banco: BankRow[], sistema: SystemPayment[]): CuadreBanco {
  const usados = new Set<string>();
  const refDe = new Map(sistema.map((s) => [s.id, claveReferencia(s.reference)]));
  /** El libre que cumple `pide` con menor `costo`; empate = el primero (orden estable). */
  const elMejor = (pide: (x: SystemPayment) => boolean, costo: (x: SystemPayment) => number) => {
    let mejor: SystemPayment | null = null;
    let min = Number.POSITIVE_INFINITY;
    for (const x of sistema) {
      if (usados.has(x.id) || !pide(x)) continue;
      const c = costo(x);
      if (c < min) {
        min = c;
        mejor = x;
      }
    }
    return mejor;
  };
  const coinciden: ParCuadrado[] = [];
  const conDiferencia: ParConDiferencia[] = [];

  const sinReferencia: BankRow[] = [];
  for (const b of banco) {
    const ref = claveReferencia(b.reference);
    const s = ref ? elMejor((x) => refDe.get(x.id) === ref && mismoSigno(x.amount, b.amount), () => 0) : null;
    if (!s) {
      sinReferencia.push(b);
      continue;
    }
    usados.add(s.id);
    if (mismoMonto(s.amount, b.amount)) coinciden.push({ banco: b, sistema: s });
    else conDiferencia.push({ banco: b, sistema: s, diferencia: redondear(b.amount - s.amount) });
  }

  const sinMontoExacto: BankRow[] = [];
  for (const b of sinReferencia) {
    const s = elMejor(
      (x) => mismoMonto(x.amount, b.amount) && diasEntre(x.date, b.date) <= TOLERANCIA_DIAS,
      (x) => diasEntre(x.date, b.date),
    );
    if (!s) {
      sinMontoExacto.push(b);
      continue;
    }
    usados.add(s.id);
    coinciden.push({ banco: b, sistema: s });
  }

  const soloBanco: BankRow[] = [];
  for (const b of sinMontoExacto) {
    const tope = diferenciaAdmitida(b.amount);
    const s = elMejor(
      (x) =>
        mismoSigno(x.amount, b.amount) &&
        Math.abs(x.amount - b.amount) <= tope &&
        diasEntre(x.date, b.date) <= TOLERANCIA_DIAS,
      (x) => Math.abs(x.amount - b.amount) * 100 + diasEntre(x.date, b.date),
    );
    if (!s) {
      soloBanco.push(b);
      continue;
    }
    usados.add(s.id);
    conDiferencia.push({ banco: b, sistema: s, diferencia: redondear(b.amount - s.amount) });
  }

  return { coinciden, conDiferencia, soloBanco, soloSistema: sistema.filter((s) => !usados.has(s.id)) };
}

export interface GrupoResumido {
  cantidad: number;
  /** Suma con signo de lo que entra menos lo que sale. En «con diferencia», la suma de las diferencias. */
  monto: number;
}

/** Cuántos y cuánto por grupo: lo que la pantalla muestra en los cuatro chips. */
export function resumirCuadre(c: CuadreBanco): Record<keyof CuadreBanco, GrupoResumido> {
  const suma = (xs: number[]) => redondear(xs.reduce((a, b) => a + b, 0));
  return {
    coinciden: { cantidad: c.coinciden.length, monto: suma(c.coinciden.map((p) => p.banco.amount)) },
    conDiferencia: { cantidad: c.conDiferencia.length, monto: suma(c.conDiferencia.map((p) => p.diferencia)) },
    soloBanco: { cantidad: c.soloBanco.length, monto: suma(c.soloBanco.map((b) => b.amount)) },
    soloSistema: { cantidad: c.soloSistema.length, monto: suma(c.soloSistema.map((s) => s.amount)) },
  };
}
