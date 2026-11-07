/**
 * hoja-metricas — cuánto mide de verdad el texto en esta máquina.
 *
 * EL PROBLEMA QUE RESUELVE: el ancho de columna de un .xlsx no está en
 * píxeles, está en "caracteres" de Calibri 11 pt — la fuente por defecto de
 * Excel, donde un dígito mide exactamente 7 px. Toda la conversión a píxeles
 * se apoya en ese 7.
 *
 * Pero Calibri es de Microsoft y en Linux (y en muchos navegadores) no está.
 * El texto termina dibujado con la fuente genérica del sistema, donde el mismo
 * dígito mide ~9,3 px: un 33% más. Resultado: cada columna queda un tercio más
 * angosta de lo que el texto necesita y la planilla entera se ve apretada,
 * cortada y descuadrada, aunque los píxeles sean "los del archivo".
 *
 * La salida es medir el dígito en la fuente que el navegador USA realmente y
 * escalar los anchos con esa proporción. Si algún día Calibri está instalada,
 * el factor da 1 y no cambia nada.
 */

/** Ancho de un dígito en Calibri 11 pt, la referencia de Excel. */
export const ANCHO_DIGITO_EXCEL = 7;

/** Fuentes a intentar, de la más fiel a la más disponible. */
export const FUENTE_HOJA = 'Calibri, Carlito, "Segoe UI", system-ui, sans-serif';

/** 11 pt en píxeles (72 pt = 96 px). */
export const TAMANO_BASE_PX = 11 * (96 / 72);

/** Puntos → píxeles, para los tamaños de letra que trae el archivo. */
export function ptAPx(pt: number): number {
  return pt * (96 / 72);
}

let cache: number | null = null;

/**
 * Cuánto hay que agrandar los anchos del archivo para esta fuente.
 *
 * @returns 1 si se está dibujando con las métricas de Calibri; ~1,33 con la
 *   fuente genérica de un Linux sin las fuentes de Microsoft.
 */
export function factorAncho(): number {
  if (cache !== null) return cache;
  if (typeof document === "undefined") return 1;

  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return 1;
    ctx.font = `${TAMANO_BASE_PX}px ${FUENTE_HOJA}`;
    // Diez dígitos y no uno: promedia el redondeo de subpíxeles.
    const digito = ctx.measureText("0000000000").width / 10;
    if (!Number.isFinite(digito) || digito <= 0) return 1;
    // Se acota: un factor disparatado (fuente rarísima) desarmaría la vista.
    cache = Math.min(2, Math.max(1, digito / ANCHO_DIGITO_EXCEL));
    return cache;
  } catch {
    return 1;
  }
}

/** Ancho del archivo (px según Excel) → ancho en pantalla. */
export function anchoEnPantalla(anchoExcelPx: number): number {
  return Math.round(anchoExcelPx * factorAncho());
}

/**
 * Ancho en pantalla → ancho para guardar en el archivo.
 *
 * Es la vuelta de `anchoEnPantalla`: cuando el usuario arrastra el borde de
 * una columna, lo que se guarda tiene que ser el ancho en las métricas de
 * Excel, no los píxeles de esta pantalla. Sin esto, abrir y guardar en una
 * máquina sin Calibri iría ensanchando el archivo un 33% cada vez.
 */
export function anchoParaArchivo(anchoPantallaPx: number): number {
  return Math.round(anchoPantallaPx / factorAncho());
}

/** Sólo para los tests: vuelve a medir la próxima vez. */
export function reiniciarMetricas(): void {
  cache = null;
}
