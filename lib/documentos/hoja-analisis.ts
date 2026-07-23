/**
 * hoja-analisis — lo que se hace con los datos una vez que están cargados:
 * mirar el resumen de una selección, ordenar por una columna y filtrar.
 *
 * Son las tres cosas que se piden apenas la planilla pasa de veinte filas.
 * Sin ellas, revisar un catálogo de cientos de líneas obliga a bajarlo y
 * abrirlo en Excel, que es justo lo que este editor vino a evitar.
 */

import type { CeldaHoja } from "./xlsx-formato";
import type { RangoNormal } from "./hoja-rango";

/** Resumen de la selección, como el que Excel muestra abajo a la derecha. */
export interface Resumen {
  celdas: number;
  /** Cuántas de esas celdas tienen algo escrito. */
  conDatos: number;
  numericas: number;
  suma: number;
  promedio: number;
  minimo: number;
  maximo: number;
}

/**
 * Interpreta lo que se ve en la celda como número.
 *
 * Se parte del texto mostrado porque es lo que el usuario tiene delante: si la
 * celda dice "S/ 1,250.00", ese es el importe que espera ver sumado. Se sacan
 * el símbolo de moneda y los separadores de miles antes de convertir.
 */
export function comoNumeroVisible(celda: CeldaHoja): number | null {
  const crudo = (celda.crudo ?? "").trim();
  // El valor crudo manda cuando existe: no pasó por el formato.
  const base = crudo !== "" && !celda.formula ? crudo : (celda.texto ?? "").trim();
  if (base === "") return null;

  const limpio = base
    .replace(/^[^\d\-+.,]+/, "")   // "S/ ", "$", "US$"
    .replace(/[^\d\-+.,]+$/, "")   // "%", " kg"
    .replace(/,/g, "");            // separador de miles
  if (limpio === "" || limpio === "-") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** Resumen de un rango de celdas. */
export function resumir(filas: CeldaHoja[][], rango: RangoNormal): Resumen {
  const numeros: number[] = [];
  let celdas = 0;
  let conDatos = 0;

  for (let f = rango.filaIni; f <= rango.filaFin; f++) {
    for (let c = rango.colIni; c <= rango.colFin; c++) {
      const celda = filas[f]?.[c];
      if (!celda || celda.tapada) continue;
      celdas++;
      if ((celda.texto ?? "") !== "" || (celda.crudo ?? "") !== "") conDatos++;
      const n = comoNumeroVisible(celda);
      if (n !== null) numeros.push(n);
    }
  }

  const suma = numeros.reduce((a, b) => a + b, 0);
  return {
    celdas,
    conDatos,
    numericas: numeros.length,
    suma,
    promedio: numeros.length ? suma / numeros.length : 0,
    minimo: numeros.length ? Math.min(...numeros) : 0,
    maximo: numeros.length ? Math.max(...numeros) : 0,
  };
}

export type Direccion = "asc" | "desc";

/**
 * Orden de las filas de un rango según una columna.
 *
 * Devuelve el ORDEN (qué fila original va en cada posición), no las filas
 * movidas: quien llama decide qué hacer con eso. Así se puede aplicar el mismo
 * orden a todas las columnas del rango sin recalcular.
 *
 * Los números se comparan como números y el texto con las reglas del español
 * (para que "Ñandú" y "Ángel" caigan donde corresponde). Las celdas vacías van
 * siempre al final, como en Excel: son ausencia de dato, no un valor mínimo.
 */
export function ordenDeFilas(
  filas: CeldaHoja[][],
  rango: RangoNormal,
  columna: number,
  direccion: Direccion,
): number[] {
  const indices: number[] = [];
  for (let f = rango.filaIni; f <= rango.filaFin; f++) indices.push(f);

  const clave = (f: number) => {
    const celda = filas[f]?.[columna];
    if (!celda) return { vacia: true, num: null as number | null, txt: "" };
    const txt = (celda.texto ?? celda.crudo ?? "").trim();
    return { vacia: txt === "", num: comoNumeroVisible(celda), txt };
  };

  const factor = direccion === "asc" ? 1 : -1;
  const colador = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

  return [...indices].sort((a, b) => {
    const ka = clave(a), kb = clave(b);
    if (ka.vacia && kb.vacia) return a - b;
    if (ka.vacia) return 1;      // los vacíos al fondo, sin importar la dirección
    if (kb.vacia) return -1;
    if (ka.num !== null && kb.num !== null) return (ka.num - kb.num) * factor;
    return colador.compare(ka.txt, kb.txt) * factor;
  });
}

/**
 * Los valores que hay en una columna, para armar el filtro.
 *
 * Se ordenan como los mostraría Excel y se cuentan las repeticiones: sirve
 * tanto para elegir qué dejar visible como para ver de un vistazo cuántas
 * veces aparece cada destino o cada especie.
 */
export function valoresDeColumna(
  filas: CeldaHoja[][],
  columna: number,
  desdeFila: number,
): { valor: string; cantidad: number }[] {
  const cuenta = new Map<string, number>();
  for (let f = desdeFila; f < filas.length; f++) {
    const celda = filas[f]?.[columna];
    if (!celda || celda.tapada) continue;
    const v = (celda.texto ?? "").trim();
    cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  }
  const colador = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
  return [...cuenta.entries()]
    .map(([valor, cantidad]) => ({ valor, cantidad }))
    .sort((a, b) => {
      if (a.valor === "") return 1;
      if (b.valor === "") return -1;
      return colador.compare(a.valor, b.valor);
    });
}

/**
 * Qué filas quedan ocultas por los filtros activos.
 *
 * Un filtro por columna es el conjunto de valores que SÍ se muestran; una
 * columna sin filtro no oculta nada. Las filas de encabezado nunca se ocultan.
 */
export function filasOcultasPorFiltro(
  filas: CeldaHoja[][],
  filtros: Map<number, Set<string>>,
  desdeFila: number,
): boolean[] {
  const ocultas = new Array(filas.length).fill(false);
  if (filtros.size === 0) return ocultas;

  for (let f = desdeFila; f < filas.length; f++) {
    for (const [columna, permitidos] of filtros) {
      const v = (filas[f]?.[columna]?.texto ?? "").trim();
      if (!permitidos.has(v)) { ocultas[f] = true; break; }
    }
  }
  return ocultas;
}
