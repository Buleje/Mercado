/**
 * La especie por bloques en los cubicadores (Brandon, 2026-09-22).
 *
 * Tres pedidos con la misma idea detrás —una pila de madera se arma y se
 * revisa especie por especie—:
 *
 *  1. **Ordenar la tabla en bloques de especie** al terminar de dictar, y poder
 *     volver al orden en que se dictó (`agruparPorEspecie` / `ordenDeDictado`).
 *  2. **Dictar por bloque**: decir sólo «panguana» cambia la especie de lo que
 *     sigue, sin el «especie …» delante; «panguana dos cuatro diez» la cambia y
 *     anota la pieza en una sola frase (`especieAlInicio`).
 *  3. **Leer por bloque**: al entrar a un tramo de 2 o más filas seguidas de la
 *     misma especie se anuncia «Continúa con panguana» UNA vez y después sólo
 *     las medidas; una fila suelta se lee como siempre, con su especie al final
 *     (`textoPorTramos`).
 *
 * El orden de dictado NO se guarda en un campo nuevo: ya está en el id
 * (`p-<milisegundo>-<n>` en la aserrada, `t-…` en trozas), que se crea al
 * anotar la pieza y no cambia al editarla. Así un lote guardado antes de esta
 * función también sabe volver a su orden.
 */
import { claveEspecie } from "./loth-constants";

/** Cómo se ordena la tabla: tal cual se dictó, o en bloques de especie. */
export type OrdenFilas = "dictado" | "especie";

export function esOrdenFilas(v: unknown): v is OrdenFilas {
  return v === "dictado" || v === "especie";
}

/** Un tramo empieza a anunciarse desde dos filas seguidas de la misma especie. */
export const MINIMO_TRAMO = 2;

/**
 * `[milisegundo, contador]` de un id que termina en `-<ms>-<n>`: `p-…` en la
 * aserrada, `t-…` en trozas, `imp-t-…`/`ocr-t-…` en las trozas importadas.
 * `null` si no tiene esa forma.
 */
export function claveDeDictado(id: string): readonly [number, number] | null {
  const m = /^[a-z][a-z-]*-(\d+)-(\d+)$/i.exec(id);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * Las filas en el orden en que se anotaron.
 *
 * Una fila DUPLICADA es una fila nueva: al volver a «como se dictó» queda al
 * final, no debajo de su original (se duplicó después de todo lo anterior).
 *
 * Un id sin la forma conocida (no debería haber: todos salen del mismo
 * generador) hereda la clave de la fila que tiene delante. Así el orden sigue
 * siendo total y esa fila no salta a la punta de la tabla.
 */
export function ordenDeDictado<T extends { id: string }>(filas: readonly T[]): T[] {
  let previa: readonly [number, number] = [-1, -1];
  return filas
    .map((f, i) => {
      const k = claveDeDictado(f.id) ?? previa;
      previa = k;
      return { f, i, k };
    })
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.i - b.i)
    .map((x) => x.f);
}

/**
 * Agrupa la tabla en bloques de especie.
 *
 *  - Los bloques salen en el orden en que cada especie se dictó por primera
 *    vez (con las especies de AHORA): corregir la especie de una fila del
 *    medio la manda a su bloque sin mover los demás; corregir la PRIMERA
 *    pieza de un bloque sí puede cambiar el lugar de ese bloque.
 *  - Adentro de un bloque manda el orden **actual** de la tabla: una pieza
 *    nueva cae al final de su bloque y una duplicada queda debajo de su
 *    original.
 *  - «Sin especie» va al final: es lo que queda por completar.
 *  - «TORNILLO» y «Tornillo» son el mismo bloque (`claveEspecie`).
 *
 * Es idempotente: agrupar lo ya agrupado no mueve nada, por eso se puede
 * aplicar después de cada cambio sin que la tabla tiemble.
 */
export function agruparPorEspecie<T extends { id: string; especie?: string }>(filas: readonly T[]): T[] {
  const rango = new Map<string, number>();
  for (const f of ordenDeDictado(filas)) {
    const c = claveEspecie(f.especie);
    if (c && !rango.has(c)) rango.set(c, rango.size);
  }
  return filas
    .map((f, i) => ({ f, i, r: rango.get(claveEspecie(f.especie)) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.f);
}

/** Aplica un orden a la tabla entera. */
export function ordenarFilas<T extends { id: string; especie?: string }>(filas: readonly T[], orden: OrdenFilas): T[] {
  return orden === "especie" ? agruparPorEspecie(filas) : ordenDeDictado(filas);
}

/**
 * La última fila ANOTADA. Con la tabla agrupada no es la última de la tabla:
 * «elimina el último» tiene que borrar lo que se acaba de dictar, no la última
 * fila del bloque de abajo.
 */
export function ultimaDictada<T extends { id: string }>(filas: readonly T[]): T | undefined {
  const orden = ordenDeDictado(filas);
  return orden[orden.length - 1];
}

/** ¿Esta fila es la primera de su bloque, mirando la de arriba? */
export function empiezaBloque<T extends { especie?: string }>(fila: T, anterior: T | undefined): boolean {
  return !!anterior && claveEspecie(anterior.especie) !== claveEspecie(fila.especie);
}

/** Cuántas filas seguidas comparten la especie de `lista[indice]`, contándola. Sin especie = 0. */
export function largoDelTramo<T extends { especie?: string }>(lista: readonly T[], indice: number): number {
  const c = claveEspecie(lista[indice]?.especie);
  if (!c) return 0;
  let desde = indice;
  let hasta = indice;
  while (desde > 0 && claveEspecie(lista[desde - 1].especie) === c) desde--;
  while (hasta < lista.length - 1 && claveEspecie(lista[hasta + 1].especie) === c) hasta++;
  return hasta - desde + 1;
}

/** Dónde está la lectura: lo que el hook de lectura le pasa a cada fila. */
export interface PosicionEnLectura<T> {
  indice: number;
  lista: readonly T[];
  haciaAtras: boolean;
  /** Primera fila que suena desde que se arrancó, se saltó o se retomó. */
  primera: boolean;
}

/**
 * El texto de una fila leída por tramos de especie.
 *
 * - Fila sin especie → sólo las medidas (como siempre), salvo que venga justo
 *   después de un tramo: ahí «Sin especie.» delante, porque dentro de un tramo
 *   las medidas peladas quieren decir «la misma especie» y la fila sonaría
 *   como una más del tramo (lo cazó el revisor, 2026-09-22).
 * - Fila suelta (su especie no se repite al lado) → medidas y especie al final
 *   (como siempre).
 * - Primera fila de un tramo de 2+ → «Continúa con Panguana.» y las medidas.
 * - Las demás del tramo → sólo las medidas.
 *
 * «Primera» se mira en el SENTIDO de la lectura: leyendo al revés, el tramo
 * empieza por abajo. Y se vuelve a anunciar al arrancar, al saltar a una fila
 * o al retomar una pausa: ahí no se escuchó la especie de lo que viene.
 */
export function textoPorTramos<T extends { especie?: string }>(
  fila: T,
  pos: PosicionEnLectura<T>,
  medida: (f: T) => string,
): string {
  const especie = fila.especie?.trim();
  const base = medida(fila);
  const iAnterior = pos.indice + (pos.haciaAtras ? 1 : -1);
  const anterior = pos.lista[iAnterior];
  if (!especie) {
    const saleDeUnTramo = !pos.primera && !!anterior && largoDelTramo(pos.lista, iAnterior) >= MINIMO_TRAMO;
    return saleDeUnTramo ? `Sin especie. ${base}` : base;
  }
  if (largoDelTramo(pos.lista, pos.indice) < MINIMO_TRAMO) return `${base}, ${especie}`;
  const entra = pos.primera || !anterior || claveEspecie(anterior.especie) !== claveEspecie(especie);
  return entra ? `Continúa con ${especie}. ${base}` : base;
}

/**
 * Si la frase dictada EMPIEZA con una especie del catálogo, la separa del
 * resto: «panguana» → especie y nada más; «Panguana dos cuatro diez» →
 * especie y «dos cuatro diez» para el lector de números.
 *
 * - Tiene que ser la palabra entera: «cedrón» no es «cedro».
 * - Si dos especies calzan, gana la de más palabras («cumala blanca» antes
 *   que «cumala»).
 * - El resto sale con el texto ORIGINAL (tildes incluidas), para que los
 *   números se lean igual que si no hubiera especie delante.
 */
export function especieAlInicio(texto: string, especies: readonly string[]): { especie: string; resto: string } | null {
  const palabras = texto.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return null;
  const claves = palabras.map((p) => claveEspecie(p.replace(/[.,;:!?¿¡«»"]+/g, "")));
  let mejor: { especie: string; n: number } | null = null;
  for (const especie of especies) {
    const partes = claveEspecie(especie).split(" ").filter(Boolean);
    if (partes.length === 0 || partes.join(" ").length < 3 || partes.length > claves.length) continue;
    if (!partes.every((p, i) => claves[i] === p)) continue;
    if (!mejor || partes.length > mejor.n) mejor = { especie, n: partes.length };
  }
  return mejor ? { especie: mejor.especie, resto: palabras.slice(mejor.n).join(" ") } : null;
}
