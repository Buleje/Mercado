/**
 * «Pago y entrega» de una cubicación guardada (Brandon 28-10): el adelanto se
 * anota como soles en texto («1500.00») y «por cobrar» es importe − adelanto.
 * Sólo se anota; nada de esto mueve plata. PURO y client-safe.
 */

/** Sólo dígitos y un punto (la coma se lee como punto): «1,500.5» → «1500.5». */
export function limpiarSoles(texto: string): string {
  const t = texto.replace(/,(?=\d{1,2}$)/, ".").replace(/[^\d.]/g, "");
  const i = t.indexOf(".");
  return i < 0 ? t : `${t.slice(0, i + 1)}${t.slice(i + 1).replace(/\./g, "").slice(0, 2)}`;
}

/** Al salir del campo: «1500» → «1500.00»; 0 o vacío → «». */
export function solesConDosDecimales(texto: string): string {
  const n = Number(limpiarSoles(texto));
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : "";
}

/** Importe − adelanto, en céntimos para no arrastrar decimales del float. `null` si falta alguno. */
export function porCobrar(importe: number | null | undefined, adelanto: string | undefined): number | null {
  const a = Number(adelanto);
  if (importe == null || !(importe > 0) || !adelanto?.trim() || !Number.isFinite(a) || a <= 0) return null;
  return (Math.round(importe * 100) - Math.round(a * 100)) / 100;
}
