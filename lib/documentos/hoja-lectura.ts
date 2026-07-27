/**
 * hoja-lectura — llevar cualquier planilla al MISMO modelo que el .xlsx.
 *
 * El drive abre tres cosas distintas: .xlsx (con formato), .csv (texto plano) y
 * .ods de LibreOffice (texto plano, leído aparte en `odf.ts`). Si cada una
 * tuviera su propia forma de dibujarse harían falta tres tablas y tres arreglos
 * para cada detalle. Acá el CSV y el ODS se convierten a `HojaFormato` —el
 * modelo del xlsx— y de ahí en adelante hay una sola vista y un solo camino.
 *
 * Lo que NO hace: inventar formato. Un CSV no tiene colores ni monedas, así que
 * sale sin estilo; lo único que se calcula es un ancho de columna razonable
 * para que el contenido no quede cortado.
 */

import { parsearCsv, type HojaDatos } from "./hoja-calculo";
import type { CeldaHoja, HojaFormato } from "./xlsx-formato";

/** Ancho de columna de un texto sin formato, acotado para que entre en pantalla. */
const ANCHO_MINIMO = 90;
const ANCHO_MAXIMO = 320;
/** Ancho aproximado de un carácter a 11 pt — alcanza para no cortar el texto. */
const PX_POR_CARACTER = 7.5;
const ALTO_FILA = 24;

function anchoDeColumna(filas: string[][], columna: number): number {
  let largo = 0;
  for (const fila of filas) largo = Math.max(largo, (fila[columna] ?? "").length);
  return Math.round(Math.min(ANCHO_MAXIMO, Math.max(ANCHO_MINIMO, largo * PX_POR_CARACTER + 16)));
}

/** Matriz de texto → hoja con el modelo del xlsx (sin estilos, con anchos útiles). */
export function hojaDesdeFilas(nombre: string, filas: string[][]): HojaFormato {
  const cols = Math.max(1, ...filas.map((f) => f.length));
  const cuerpo: CeldaHoja[][] = (filas.length > 0 ? filas : [[]]).map((f) =>
    Array.from({ length: cols }, (_, i) => ({ texto: f[i] ?? "", crudo: f[i] ?? "" })),
  );
  return {
    nombre,
    filas: cuerpo,
    anchos: Array.from({ length: cols }, (_, c) => anchoDeColumna(filas, c)),
    altos: new Array(cuerpo.length).fill(ALTO_FILA),
    columnasOcultas: new Array(cols).fill(false),
    filasOcultas: new Array(cuerpo.length).fill(false),
    congelado: { filas: 0, columnas: 0 },
    tieneFormulas: false,
    oculta: false,
  };
}

/** Texto de un .csv → hoja. */
export function hojaDesdeCsv(texto: string, nombre = "Hoja1"): HojaFormato {
  return hojaDesdeFilas(nombre, parsearCsv(texto));
}

/** Las hojas de texto que devuelve el lector de LibreOffice → modelo del xlsx. */
export function hojasDesdeDatos(hojas: HojaDatos[]): HojaFormato[] {
  return hojas.map((h) => {
    const hoja = hojaDesdeFilas(h.nombre, h.filas);
    return h.tieneFormulas ? { ...hoja, tieneFormulas: true } : hoja;
  });
}
