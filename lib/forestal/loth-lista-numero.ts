/**
 * loth-lista-numero — el N° de la LISTA DE TROZAS del casillero (35) tiene su
 * PROPIO correlativo, y una guía lleva varias hojas (Brandon 29-09-2026: «N° de
 * la lista de trozas automático»).
 *
 * Medido en las guías reales de SERFOR guardadas en la base (29-09-2026):
 *
 *   019-001-0000003 · 34 trozas → listas «5, 6»
 *   019-001-0000004 · 31 trozas → listas «7, 8»
 *
 * Tres cosas salen de ahí: (1) la lista NO lleva el N° de la guía —antes el
 * formulario decía «vacío = el mismo N° de la guía, lo habitual» y era falso—;
 * (2) la numeración sigue de una guía a la siguiente del mismo titular (5, 6 →
 * 7, 8); (3) una hoja lleva entre 17 y 30 filas (34 trozas en 2 hojas pide ≥17
 * por hoja; 31 en 2, menos de 31).
 *
 * PURO: lo usan el modal, el servidor (guarda lo que se imprimió) y la impresión.
 */

/**
 * Filas de trozas por hoja de la lista. 20 = lo que entra en UNA hoja A4 de la
 * lista impresa (`loth-guia-print.ts` + `htmlListaTrozas`, @page 10 mm) en el
 * peor caso: sello de borrador, resumen de 4 especies, observaciones y firmas.
 * Medido en Chromium imprimiendo a PDF con Arial real y con DejaVu (29-09-2026):
 *
 *   4 especies + borrador   20 filas → 1 página · 21 → 2
 *   4 especies, registrada  21 → 1 · 22 → 2
 *   1 especie, registrada   27 → 1 · 28 → 2
 *
 * Dentro del rango de SERFOR (17-30): 34 trozas → 20 + 14 (2 listas, como la
 * 019-001-0000003), 31 → 20 + 11 (como la 0000004). La impresión pagina con
 * este MISMO número: cada hoja es una lista con su N°.
 */
export const FILAS_POR_LISTA = 20;

/** Un rango «7 al 9» o «5-6» se expande sólo si es corto: «5-60» son dos números. */
const RANGO_MAX = 50;
/** Más dígitos que esto no es un N° de lista: es un N° de guía pegado ahí. */
const DIGITOS_MAX = 6;

/**
 * Los N° de lista escritos en un casillero (35): «5, 6», «5-6», «5 y 6»,
 * «7 al 9», «N° 8». Un N° de guía (`019-001-0000065`, lo que el formulario
 * viejo ponía cuando quedaba vacío) no son listas: devuelve `[]`.
 */
export function leerNumerosDeLista(texto: string | null | undefined): number[] {
  const t = String(texto ?? "").toLowerCase();
  if (!t.trim()) return [];
  if (/\d+\s*-\s*\d+\s*-\s*\d+/.test(t)) return [];
  /* Un CÓDIGO no son listas. SERFOR publica el (35) también así (base, 29-09):
     «10-000011» (la lista 11 de Huánuco) y «L-19-0300920» (Pasco); y un N° de
     guía de dos tramos («019-0000065») tampoco es un rango. Leídos como rango
     daban 10, 11 · 19, 300920 · 19…65, y el servidor guardaba «10» o «19» en
     el casillero. Se reconocen por el cero a la izquierda después del guion o
     por más dígitos de los que lleva un N° de lista: el texto se respeta. */
  if (/\d\s*[-–—]\s*0\d/.test(t) || (t.match(/\d+/g) ?? []).some((d) => d.length > DIGITOS_MAX)) return [];
  const numeros: number[] = [];
  const agregar = (n: number) => {
    if (Number.isSafeInteger(n) && n > 0 && !numeros.includes(n)) numeros.push(n);
  };
  const valido = (s: string) => s.replace(/^0+(?=\d)/, "").length <= DIGITOS_MAX;
  const sinRangos = t.replace(/(\d+)\s*(?:-|–|—|\bal\b|\ba\b|\bhasta\b)\s*(\d+)/g, (m, a: string, b: string) => {
    if (!valido(a) || !valido(b)) return " ";
    const [x, y] = [Number(a), Number(b)];
    if (y >= x && y - x <= RANGO_MAX) for (let n = x; n <= y; n++) agregar(n);
    else {
      agregar(x);
      agregar(y);
    }
    return " ";
  });
  for (const m of sinRangos.matchAll(/\d+/g)) if (valido(m[0])) agregar(Number(m[0]));
  return numeros;
}

/** Cuántas hojas (= listas) lleva una guía con tantas trozas. */
export function hojasDeLista(trozas: number, filasPorHoja = FILAS_POR_LISTA): number {
  return trozas > 0 ? Math.ceil(trozas / Math.max(1, filasPorHoja)) : 0;
}

/** Los N° como se escriben en el casillero: `[9, 10]` → «9, 10». */
export function textoListas(numeros: readonly number[]): string {
  return numeros.join(", ");
}

export interface PropuestaListas {
  /** Lo que va en el casillero (35): «9, 10». `null` = no hay de dónde seguir, o no hay trozas. */
  texto: string | null;
  /** El N° de la primera hoja. */
  primera: number | null;
  hojas: number;
  /** El N° más alto ya usado por este titular. */
  ultimo: number | null;
}

/**
 * Los N° de lista de la guía nueva: el más alto ya usado + 1, y uno por hoja.
 * Sin ninguno anterior no se inventa el 1: se pide el de la primera hoja.
 */
export function proponerListas(x: {
  usadas: readonly (string | null | undefined)[];
  trozas: number;
  filasPorHoja?: number;
}): PropuestaListas {
  const todos = x.usadas.flatMap((u) => leerNumerosDeLista(u));
  const ultimo = todos.length ? Math.max(...todos) : null;
  const hojas = hojasDeLista(x.trozas, x.filasPorHoja);
  if (ultimo == null || hojas === 0) return { texto: null, primera: null, hojas, ultimo };
  const primera = ultimo + 1;
  return { texto: textoListas(Array.from({ length: hojas }, (_, i) => primera + i)), primera, hojas, ultimo };
}

export interface ListasEfectivas {
  /** Un N° por hoja (vacío si no hay números). */
  numeros: number[];
  /** Lo que se imprime y se guarda en el (35). */
  texto: string;
  /** Algo que la persona tiene que saber (sobran números, no se entiende). */
  aviso: string | null;
}

/**
 * Lo escrito en el (35) llevado a UN N° por hoja: con sólo el de la primera
 * («9») las siguientes se numeran solas (9, 10); con de menos, se sigue desde
 * el último; con de más, se usan los primeros y se avisa. Un texto sin números
 * se respeta tal cual (una guía vieja), con aviso.
 */
export function listasEfectivas(texto: string | null | undefined, hojas: number): ListasEfectivas {
  const crudo = String(texto ?? "").trim();
  const leidos = leerNumerosDeLista(crudo);
  if (leidos.length === 0) {
    const aviso = !crudo
      ? null
      : /\d/.test(crudo)
        ? hojas > 1
          ? `Se imprime «${crudo}» tal cual en las ${hojas} hojas: escribe el N° de cada una (9, 10).`
          : null
        : "Escribe el N° de la lista con números (9, o 9, 10).";
    return { numeros: [], texto: crudo, aviso };
  }
  if (hojas <= 0) return { numeros: leidos, texto: textoListas(leidos), aviso: null };
  const numeros = leidos.slice(0, hojas);
  while (numeros.length < hojas) numeros.push(numeros[numeros.length - 1] + 1);
  const sobran = leidos.length - hojas;
  const aviso =
    sobran > 0
      ? `La lista sale en ${hojas} ${hojas === 1 ? "hoja" : "hojas"}: se usa${hojas === 1 ? "" : "n"} ${textoListas(numeros)} y sobra${sobran === 1 ? "" : "n"} ${textoListas(leidos.slice(hojas))}.`
      : null;
  return { numeros, texto: textoListas(numeros), aviso };
}

/** Parte las filas en hojas de `filasPorHoja` (la última, con las que quedan). */
export function partirEnHojas<T>(filas: readonly T[], filasPorHoja = FILAS_POR_LISTA): T[][] {
  const n = Math.max(1, filasPorHoja);
  const hojas: T[][] = [];
  for (let i = 0; i < filas.length; i += n) hojas.push(filas.slice(i, i + n));
  return hojas;
}
