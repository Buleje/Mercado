/**
 * seleccion-celdas — lo que Excel muestra abajo a la derecha cuando marcás un
 * rango: suma, recuento, promedio, mínimo y máximo.
 *
 * Es la operación que el aserradero hace todo el tiempo y que la tabla obligaba
 * a resolver con calculadora: «de estas ocho filas, ¿cuánto pie tablar me dan?».
 * El total del pie de tabla contesta por el lote entero o por el filtro, nunca
 * por una selección a dedo.
 *
 * Decisiones que no son obvias:
 *  · **El recuento distingue celdas de valores.** Excel muestra «Recuento» (no
 *    vacías) y «Cuenta numérica» por separado, y acá importa igual: seleccionar
 *    diez filas de las que dos no tienen especie no son diez especies.
 *  · **Las piezas se suman aparte del valor.** Una selección de la columna
 *    «Cant.» suma unidades; una de «Pie tablar» suma PT. Mezclarlas en un solo
 *    «total» daría un número sin unidad, que es el error que este módulo evita
 *    en todos lados.
 *
 * PURO y client-safe: sin React, sin DOM.
 */

/** Coordenada de una celda dentro de una grilla. */
export interface Celda {
  fila: number;
  col: number;
}

/** Un rectángulo de celdas, normalizado (inicio ≤ fin en ambos ejes). */
export interface Rango {
  filaIni: number;
  filaFin: number;
  colIni: number;
  colFin: number;
}

export interface Estadisticas {
  /** Celdas dentro del rango, tengan valor o no. */
  celdas: number;
  /** Cuántas traían un número. */
  numeros: number;
  suma: number;
  promedio: number | null;
  minimo: number | null;
  maximo: number | null;
}

/**
 * Normaliza dos esquinas en un rectángulo.
 *
 * Se arrastra en las cuatro direcciones: sin esto, seleccionar de abajo hacia
 * arriba daba un rango con `filaIni > filaFin` y el recorrido salía vacío —
 * la selección "no hacía nada" y parecía un bug del mouse.
 */
export function normalizarRango(a: Celda, b: Celda): Rango {
  return {
    filaIni: Math.min(a.fila, b.fila),
    filaFin: Math.max(a.fila, b.fila),
    colIni: Math.min(a.col, b.col),
    colFin: Math.max(a.col, b.col),
  };
}

export function dentroDelRango(r: Rango | null, c: Celda): boolean {
  if (!r) return false;
  return c.fila >= r.filaIni && c.fila <= r.filaFin && c.col >= r.colIni && c.col <= r.colFin;
}

/** Cuántas celdas abarca el rectángulo. */
export function tamañoRango(r: Rango): number {
  return (r.filaFin - r.filaIni + 1) * (r.colFin - r.colIni + 1);
}

/**
 * Las estadísticas de una lista de valores.
 *
 * `null` (no un 0) donde no se puede afirmar: el promedio de cero números no es
 * cero, y un mínimo de 0 sobre una selección vacía haría creer que hay una
 * pieza midiendo nada.
 */
export function estadisticas(valores: ReadonlyArray<number | null | undefined>): Estadisticas {
  const nums = valores.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const suma = nums.reduce((a, v) => a + v, 0);
  return {
    celdas: valores.length,
    numeros: nums.length,
    // Redondeo a 4 decimales: acumular 300 floats deja colas de 1e-13 que la
    // pantalla mostraba como "89,99999999999999".
    suma: Math.round(suma * 10000) / 10000,
    promedio: nums.length > 0 ? Math.round((suma / nums.length) * 10000) / 10000 : null,
    minimo: nums.length > 0 ? Math.min(...nums) : null,
    maximo: nums.length > 0 ? Math.max(...nums) : null,
  };
}

/**
 * Recorre el rectángulo pidiendo el valor de cada celda.
 *
 * `leer` devuelve `null` cuando la celda no tiene número (una especie, un
 * hueco): así el recuento total y el de números se distinguen sin que el
 * llamador tenga que contar por su cuenta.
 */
export function estadisticasDelRango(
  rango: Rango,
  leer: (fila: number, col: number) => number | null,
): Estadisticas {
  const valores: (number | null)[] = [];
  for (let f = rango.filaIni; f <= rango.filaFin; f++) {
    for (let c = rango.colIni; c <= rango.colFin; c++) valores.push(leer(f, c));
  }
  return estadisticas(valores);
}

/**
 * Las filas que un "arrastre de relleno" tiene que pisar.
 *
 * Excel rellena desde la celda de origen hasta donde se soltó, en cualquiera de
 * las dos direcciones. Se devuelve SIN el origen: es el que aporta el valor, y
 * volver a escribirlo sólo generaría un cambio de estado inútil.
 */
export function filasARellenar(origen: number, hasta: number): number[] {
  if (hasta === origen) return [];
  const paso = hasta > origen ? 1 : -1;
  const out: number[] = [];
  for (let f = origen + paso; paso > 0 ? f <= hasta : f >= hasta; f += paso) out.push(f);
  return out;
}

/** Texto del rango para el lector de pantalla y el tooltip ("8 filas × 2 columnas"). */
export function describirRango(r: Rango): string {
  const filas = r.filaFin - r.filaIni + 1;
  const cols = r.colFin - r.colIni + 1;
  const f = `${filas} ${filas === 1 ? "fila" : "filas"}`;
  return cols === 1 ? f : `${f} × ${cols} columnas`;
}

/**
 * El rango como TSV, para pegar en Excel.
 *
 * Tabulaciones y saltos de línea reales: es el formato que el portapapeles del
 * sistema entiende como celdas. Con `;` o `,` pegaría todo en una sola columna,
 * que es el mismo error que ya se corrigió en las plantillas descargables.
 */
export function rangoATsv(rango: Rango, leerTexto: (fila: number, col: number) => string): string {
  const lineas: string[] = [];
  for (let f = rango.filaIni; f <= rango.filaFin; f++) {
    const celdas: string[] = [];
    for (let c = rango.colIni; c <= rango.colFin; c++) celdas.push(leerTexto(f, c));
    lineas.push(celdas.join("\t"));
  }
  return lineas.join("\n");
}
