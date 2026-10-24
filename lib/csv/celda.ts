/**
 * Una celda de CSV para abrir en Excel con configuración es-PE. Única fuente
 * (seguridad 17-10, punto 6): antes cada export tenía su copia y sólo la del
 * libro CTP frenaba las fórmulas.
 *
 * - Separador `;`: Excel en es-PE usa la coma como decimal, así que la coma NO
 *   entrecomilla (un «13,6500» entre comillas Excel lo lee como texto y no suma).
 * - Lo que trae `;`, comillas o saltos va entre comillas, con `"` duplicada.
 * - Un texto que empieza con `=`, `+`, `-`, `@` (o tab/CR) Excel lo ejecuta como
 *   fórmula al abrir el archivo: un motivo escrito «=HYPERLINK(…)» o un nombre
 *   pegado de otra planilla se vuelve código. Se antepone un apóstrofo, que
 *   Excel muestra como texto. Los NÚMEROS («-81,807», «-50.00», «+5») se dejan
 *   tal cual: son lo que el reporte tiene que sumar.
 *
 * Sin "use client" ni "server-only": la usan exports del navegador y rutas.
 */

const EMPIEZA_COMO_FORMULA = /^[=+\-@\t\r]/;
const ES_NUMERO = /^[-+]?\d+([.,]\d+)*$/;

/** El texto con el apóstrofo delante si Excel lo leería como fórmula. */
export function sinFormula(texto: string): string {
  return EMPIEZA_COMO_FORMULA.test(texto) && !ES_NUMERO.test(texto) ? `'${texto}` : texto;
}

export function celdaCsv(valor: unknown): string {
  const s = valor == null ? "" : sinFormula(String(valor));
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
