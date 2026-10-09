/**
 * Qué descuentos de planilla son de QUÉ período (RRHH › Lo ganado).
 *
 * «Queda por pagar» resta los adelantos ABIERTOS de hoy. Al descontar el
 * adelanto de la planilla, ese saldo baja a 0 y, sin restar también lo
 * descontado, la fila SUBÍA: ganó 1000 y debía 300 → 700; tras descontar
 * los 300 → 1000, y se le pagaba el sueldo entero (revisión del 09-10).
 *
 * El concepto de la entrega es la única marca del período (sin schema nuevo):
 * `conceptoDelPeriodo(periodo)` = «Descuento por planilla · octubre de 2026» o
 * «… · del 01/10 al 07/10/2026». Por eso se lee el período DEL CONCEPTO, no la
 * fecha de la entrega: la planilla de setiembre se paga el 2 de octubre, y por
 * fecha caería en octubre (dos veces restada) y no en setiembre (ninguna).
 * Sólo un concepto escrito a mano, que no nombra un período, cae por fecha.
 *
 * PURO: sin Prisma, React ni fetch.
 */

import { formatMonthYear } from "@/lib/format";
import { CONCEPTO_PLANILLA } from "@/lib/adelantos/planilla-lote";
import { diasDelMes, esFechaKey, NOMBRES_MES } from "./fechas";
import type { FechaKey } from "./tipos";

/**
 * El «período» del concepto del descuento. Un mes entero se escribe igual que
 * el modal cuando lo abres desde Adelantos («octubre de 2026»), así el
 * concepto sale igual venga de donde venga; una semana o un rango, con fechas.
 */
export function periodoDelDescuento(desde: string, hasta: string): string {
  const mismoMes = desde.slice(0, 7) === hasta.slice(0, 7);
  if (mismoMes && desde.endsWith("-01") && Number(hasta.slice(8, 10)) === diasDelMes(desde)) {
    const [y, m] = desde.split("-").map(Number);
    // Mediodía del día 15: ninguna zona horaria lo corre al mes vecino.
    return formatMonthYear(new Date(Date.UTC(y, m - 1, 15, 12)), { largo: true });
  }
  const dm = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
  const mismoAnio = desde.slice(0, 4) === hasta.slice(0, 4);
  return mismoAnio
    ? `del ${dm(desde)} al ${dm(hasta)}/${hasta.slice(0, 4)}`
    : `del ${dm(desde)}/${desde.slice(0, 4)} al ${dm(hasta)}/${hasta.slice(0, 4)}`;
}

const RANGO_RE = /^del (\d{2})\/(\d{2})(?:\/(\d{4}))? al (\d{2})\/(\d{2})\/(\d{4})$/i;
const MES_RE = /^(\p{L}+) de (\d{4})$/iu;
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * El rango de días que nombra un período escrito por `periodoDelDescuento`
 * (o por el modal de Adelantos). `null` si es texto libre.
 */
export function rangoDelPeriodo(periodo: string): { desde: FechaKey; hasta: FechaKey } | null {
  const p = periodo.trim();
  const r = RANGO_RE.exec(p);
  if (r) {
    const desde = `${r[3] ?? r[6]}-${r[2]}-${r[1]}`;
    const hasta = `${r[6]}-${r[5]}-${r[4]}`;
    return esFechaKey(desde) && esFechaKey(hasta) && desde <= hasta ? { desde, hasta } : null;
  }
  const m = MES_RE.exec(p);
  if (!m) return null;
  const nombre = m[1].toLocaleLowerCase("es");
  // ICU de es-PE escribe «setiembre»; aceptar también «septiembre» escrito a mano.
  const i = nombre === "septiembre" ? 8 : NOMBRES_MES.indexOf(nombre as (typeof NOMBRES_MES)[number]);
  if (i < 0) return null;
  const desde = `${m[2]}-${pad(i + 1)}-01`;
  return { desde, hasta: `${m[2]}-${pad(i + 1)}-${pad(diasDelMes(desde))}` };
}

/**
 * ¿Esta entrega es un descuento de planilla del período `[desde, hasta]`?
 *
 * - El concepto nombra un período (mes o rango) → sí, si cae ENTERO dentro:
 *   la semana del 01/10 al 07/10 entra en octubre; octubre no entra en esa semana.
 * - Concepto a mano → por el día (Lima) en que se anotó.
 */
export function descuentoEsDelPeriodo(
  entrega: { descripcion: string | null; dia: FechaKey },
  desde: FechaKey,
  hasta: FechaKey,
): boolean {
  const texto = (entrega.descripcion ?? "").trim();
  if (!texto.startsWith(CONCEPTO_PLANILLA)) return false;
  const periodo = texto.slice(CONCEPTO_PLANILLA.length).replace(/^\s*·\s*/, "");
  const rango = rangoDelPeriodo(periodo);
  if (rango) return rango.desde >= desde && rango.hasta <= hasta;
  return entrega.dia >= desde && entrega.dia <= hasta;
}
