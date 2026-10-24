/**
 * Cuánto pagar a SUNAT en un mes, con lo REGISTRADO (PURO, client-safe).
 *
 * Antes «Impuestos del mes» sacaba el IGV multiplicando por 18/118 los pedidos
 * web entregados o confirmados, dejaba afuera las ventas del POS e inventaba
 * boletas «B001-00000001». Medido en `main`, mayo 2026: 7 ventas del POS
 * (174,30) + 2 pedidos (54,90) → Impuestos decía «IGV a pagar S/ 8,37» y el
 * Resumen de Mi Plata, «sin IGV registrado» (0 comprobantes electrónicos).
 *
 * Ahora las dos pantallas leen la misma regla:
 *  - IGV = el de tus comprobantes electrónicos − el anotado en tus gastos
 *    (`/api/finanzas/igv-del-mes` + `leerIgv`). Sin registro, no se estima.
 *  - Renta (pago a cuenta) = tasa del régimen × ingresos netos del mes. Los
 *    ingresos son los de Mi Plata (`/api/finanzas/monthly-summary`: POS +
 *    pedidos concretados); netos = menos el IGV de tus comprobantes.
 */
import {
  rentaPagoACuentaRate,
  type RegimenTributario,
} from "@/lib/tax/obligaciones-peru";
import { leerIgv, type IgvDelMes, type LecturaIgv } from "@/components/admin/unified/finanzas/resumen/igv";

export interface EntradaImpuestos {
  regimen: RegimenTributario;
  /** `null` = no se pudo leer (no es «sin IGV»). */
  igv: IgvDelMes | null;
  /** Ingresos del mes (POS + pedidos concretados), como los muestra Mi Plata. */
  ingresosMes: number;
  /** Ingresos del año hasta este mes inclusive (umbral de 300 UIT del RMT). */
  ingresosAcumAnio: number;
}

export interface ImpuestosDelMes {
  lecturaIgv: LecturaIgv | null;
  /** IGV a pagar del mes (0 si hay saldo a favor o no hay registro). */
  igvAPagar: number;
  /** Crédito que pasa al mes siguiente. */
  saldoAFavor: number;
  /** Ingresos netos del mes: base del pago a cuenta. */
  baseRenta: number;
  tasaRenta: number;
  renta: number;
  /** El Régimen General usa el coeficiente del año anterior: el 1,5 % es piso. */
  rentaEstimada: boolean;
  esNrus: boolean;
  total: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function calcularImpuestosDelMes(e: EntradaImpuestos): ImpuestosDelMes {
  const lecturaIgv = leerIgv(e.igv);
  const neto = lecturaIgv?.tipo === "registrado" ? lecturaIgv.neto : 0;
  const debito = lecturaIgv?.tipo === "registrado" ? lecturaIgv.debito : 0;
  const igvAPagar = r2(Math.max(0, neto));
  const saldoAFavor = r2(Math.max(0, -neto));
  const esNrus = e.regimen === "nrus";
  const baseRenta = r2(Math.max(0, e.ingresosMes - debito));
  const tasaRenta = rentaPagoACuentaRate(e.regimen, e.ingresosAcumAnio);
  const renta = esNrus ? 0 : r2(baseRenta * tasaRenta);
  return {
    lecturaIgv,
    igvAPagar,
    saldoAFavor,
    baseRenta,
    tasaRenta,
    renta,
    rentaEstimada: e.regimen === "general",
    esNrus,
    total: r2(igvAPagar + renta),
  };
}

/** «1 %» / «1.5 %» — con punto decimal, como el resto del panel (es-PE). */
export function textoTasa(tasa: number): string {
  const pct = Math.round(tasa * 1000) / 10;
  return `${pct} %`;
}

/** Meses a mano (regla de la casa: `Intl` cambia con la versión de ICU). */
export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"] as const;

/** `2026-10` → «octubre 2026». */
export function nombreDelMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
}

/** `2026-10` → «noviembre»: el mes en que se declara y paga. */
export function mesDeVencimiento(mes: string): string {
  const m = Number(mes.split("-")[1]);
  return MESES[m % 12];
}
