/**
 * lib/sunat/boleta-dni.ts — el DNI del cliente en una boleta grande.
 *
 * Reglamento de Comprobantes de Pago (SUNAT), art. 8, num. 3.10: la boleta
 * lleva apellidos y nombres y el número de documento del cliente cuando el
 * importe total SUPERA S/ 700. Hasta S/ 700 sale a «consumidor final» (el
 * builder manda 00000000). Por debajo, ni para facturas ni tickets, nada cambia.
 *
 * Puro: lo usan el cobro del POS (no deja confirmar) y la emisión a SUNAT
 * (`/api/sunat/emit` responde 400 antes de gastar un correlativo).
 */

/** Desde aquí (sin incluir) la boleta pide el DNI. */
export const TOPE_BOLETA_SIN_DNI = 700;

export const AVISO_DNI_BOLETA = "La SUNAT pide el DNI del cliente en boletas de más de S/ 700.";

/** ¿Esta boleta tiene que llevar el DNI? Compara en céntimos: 700.004 no es «más de 700». */
export function boletaPideDni(tipo: string | null | undefined, total: number): boolean {
  return tipo === "boleta" && Math.round(total * 100) > TOPE_BOLETA_SIN_DNI * 100;
}

/** DNI peruano: 8 dígitos (el mismo formato que acepta el builder de la boleta). */
export function esDni(documento: string | null | undefined): boolean {
  return /^\d{8}$/.test(String(documento ?? "").trim());
}

/** El motivo por el que no se puede emitir, o `null` si está bien. */
export function faltaDniEnBoleta(tipo: string | null | undefined, total: number, documento: string | null | undefined): string | null {
  return boletaPideDni(tipo, total) && !esDni(documento) ? AVISO_DNI_BOLETA : null;
}
