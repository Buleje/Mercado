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

/**
 * Cómo se ordena la tabla: tal cual se dictó, en bloques de especie, o con lo
 * último que se dictó ARRIBA (Brandon, 2026-09-23: «que los datos más
 * actualizados estén primero y los antiguos últimos, tipo invertido»).
 */
export type OrdenFilas = "dictado" | "especie" | "recientes";

export function esOrdenFilas(v: unknown): v is OrdenFilas {
  return v === "dictado" || v === "especie" || v === "recientes";
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

/**
 * «Más nuevas primero»: el orden de dictado dado vuelta.
 *
 * Es el MISMO orden que «como se dictó», leído de abajo hacia arriba: la pieza
 * que se acaba de dictar aparece arriba, a la vista, sin bajar hasta el final
 * de un lote de 300. Sale del id (como `ordenDeDictado`), así que es total y
 * no depende de cómo estaba la tabla antes.
 */
export function masNuevasPrimero<T extends { id: string }>(filas: readonly T[]): T[] {
  return ordenDeDictado(filas).reverse();
}

/** Aplica un orden a la tabla entera. */
export function ordenarFilas<T extends { id: string; especie?: string }>(filas: readonly T[], orden: OrdenFilas): T[] {
  if (orden === "especie") return agruparPorEspecie(filas);
  if (orden === "recientes") return masNuevasPrimero(filas);
  return ordenDeDictado(filas);
}

/**
 * Vuelve a acomodar la tabla después de un cambio (una pieza nueva, una
 * importación, una edición de especie).
 *
 *  - Por especie: la pieza nueva cae al final de SU bloque.
 *  - Más nuevas primero: la pieza nueva va ARRIBA.
 *  - Como se dictó: no se toca — ahí manda el orden actual (una duplicada queda
 *    debajo de su original), y es la misma lista que llegó.
 *
 * Idempotente en los tres: se puede llamar en cada cambio sin que la tabla tiemble.
 */
export function acomodarAlOrden<T extends { id: string; especie?: string }>(filas: T[], orden: OrdenFilas): T[] {
  if (orden === "especie") return agruparPorEspecie(filas);
  if (orden === "recientes") return masNuevasPrimero(filas);
  return filas;
}

/**
 * El N° que se muestra en la fila `indice` (0 = la de arriba).
 *
 * Con «más nuevas primero» cada pieza conserva el número con el que se dictó:
 * arriba va el más alto y abajo el 1, como una planilla ordenada de mayor a
 * menor. Si no, «la 12» nombraría otra pieza cada vez que se dicta una nueva, y
 * la de arriba siempre diría 1 —que es justo lo contrario de «la última»—. En
 * los otros dos órdenes el N° es la posición (lo que ya decía la tabla).
 *
 * `total` = filas de la tabla entera (no de lo filtrado).
 */
export function numeroDeFila(indice: number, total: number, orden: OrdenFilas): number {
  return orden === "recientes" ? total - indice : indice + 1;
}

/**
 * Lo que va al papel (PDF, Excel, CSV) y a quien pide el lote de afuera: con
 * «más nuevas primero», en el orden en que se dictó. Así el N° del papel (su
 * posición) es el MISMO que el N° de la pantalla, y el Anexo no sale dado
 * vuelta. En los otros órdenes, la tabla tal cual (lo que ya pasaba).
 */
export function enOrdenDelPapel<T extends { id: string }>(filas: T[], orden: OrdenFilas): T[] {
  return orden === "recientes" ? ordenDeDictado(filas) : filas;
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

/**
 * La que se acaba de anotar, en cualquier orden: la de abajo si la tabla va
 * como se dictó, la del id más nuevo si no (por especie queda al final de su
 * bloque; más nuevas primero, ARRIBA — la última de la tabla sería la primera
 * que se dictó, y «elimina el último» la borraría).
 */
export function ultimaAnotada<T extends { id: string }>(filas: readonly T[], orden: OrdenFilas): T | undefined {
  return orden === "dictado" ? filas[filas.length - 1] : ultimaDictada(filas);
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
 * ── Largo fijo al leer (Brandon, 2026-09-23) ──
 *
 * «Si el 7 de largo se repite continuamente, que diga la especie con largo fijo
 * de 7 pies y después sólo espesor y ancho.» Dentro de un tramo de la misma
 * especie, cuando empieza una racha LARGA de filas con el mismo largo se
 * anuncia una vez («largo fijo 7 pies») y esas filas se leen «2, 8».
 *
 * Por qué 5 filas y no 3 (medido sobre los 3 lotes guardados del tenant real,
 * 700 piezas, 2026-09-23): el anuncio son 4 palabras y cada fila con el largo
 * fijo ahorra una, así que recién se paga desde 5. Con 3, en los dos lotes de
 * largos mezclados la lectura salía MÁS larga (113 % y 112 % de las palabras)
 * por anuncios y excepciones; con 5 quedan igual (100 %) y el lote de largo
 * parejo baja a 70 %.
 */
export const MINIMO_RACHA_LARGO = 5;
/**
 * Filas SEGUIDAS fuera del largo fijo que lo sueltan («largo libre»). Una o
 * dos piezas de otro largo son una excepción —«2, 8, largo 8»— y el fijo
 * sigue; tres seguidas dicen que la pila cambió, y seguir anunciando
 * excepciones sería más largo que leer las tres medidas.
 */
export const FUERA_PARA_SOLTAR = 3;

/** Cómo se lee el largo de una fila. Lo da cada cubicador (pies en madera, metros en trozas). */
export interface LargoEnLectura<T> {
  largo: (f: T) => number;
  /** La unidad dicha, según el valor («pie»/«pies», «metro»/«metros»). */
  unidad: (f: T, valor: number) => string;
  /** Las medidas SIN el largo: lo que se lee mientras el largo está fijo. */
  sinLargo: (f: T) => string;
}

/** Qué pasa con el largo en una fila de la lectura. */
export interface EstadoLargoFijo {
  /** El largo fijo después de esta fila; `null` si no hay. */
  fijo: number | null;
  unidad: string;
  /** Lo que se anuncia EN esta fila: empieza un fijo, o se suelta. */
  anuncio: "fijo" | "libre" | null;
  /** Esta fila tiene otro largo y el fijo sigue: se lee «…, largo 8». */
  excepcion: boolean;
}

const SIN_LARGO_FIJO: EstadoLargoFijo = { fijo: null, unidad: "", anuncio: null, excepcion: false };

/**
 * El largo fijo en `lista[indice]`, mirando su tramo de especie EN EL ORDEN EN
 * QUE SE LEE (hacia atrás, el tramo empieza por abajo y las rachas también).
 *
 * Es una función de la posición, no de lo que ya sonó: arrancar o saltar a la
 * mitad de una racha da el mismo fijo que se habría oído leyendo desde arriba.
 * Cambio de especie —o fila sin especie— reinicia: el fijo es del tramo. Las
 * filas sin especie seguidas forman su propio tramo (un lote dictado sin
 * especie también se beneficia).
 */
export function largoFijoEn<T extends { especie?: string }>(
  lista: readonly T[],
  indice: number,
  haciaAtras: boolean,
  cfg: LargoEnLectura<T>,
): EstadoLargoFijo {
  const fila = lista[indice];
  if (!fila) return SIN_LARGO_FIJO;
  const paso = haciaAtras ? -1 : 1;
  const clave = claveEspecie(fila.especie);
  const delTramo = (k: number) => k >= 0 && k < lista.length && claveEspecie(lista[k].especie) === clave;
  let ini = indice;
  while (delTramo(ini - paso)) ini -= paso;
  let fin = indice;
  while (delTramo(fin + paso)) fin += paso;
  const n = Math.abs(fin - ini) + 1;
  if (n < MINIMO_RACHA_LARGO) return SIN_LARGO_FIJO;

  /* El tramo en el orden de la lectura, y la clave de largo de cada fila
     (valor + unidad: 7 pies y 7 metros no son el mismo largo). */
  const filas: T[] = [];
  for (let k = ini, c = 0; c < n; k += paso, c++) filas.push(lista[k]);
  const pos = Math.abs(indice - ini);
  const claveLargo = filas.map((f) => `${Math.round(cfg.largo(f) * 1000)}|${cfg.unidad(f, 2)}`);
  /* Cuántas filas seguidas comparten largo desde cada una, hacia adelante. */
  const racha = new Array<number>(n).fill(1);
  for (let k = n - 2; k >= 0; k--) if (claveLargo[k] === claveLargo[k + 1]) racha[k] = racha[k + 1] + 1;
  const empiezaRacha = (k: number) =>
    (k === 0 || claveLargo[k - 1] !== claveLargo[k]) && racha[k] >= MINIMO_RACHA_LARGO;

  let fijo: string | null = null;
  let filaDelFijo: T | null = null;
  let anuncio: EstadoLargoFijo["anuncio"] = null;
  let excepcion = false;
  for (let k = 0; k <= pos; k++) {
    anuncio = null;
    excepcion = false;
    if (empiezaRacha(k) && claveLargo[k] !== fijo) {
      fijo = claveLargo[k];
      filaDelFijo = filas[k];
      anuncio = "fijo";
      continue;
    }
    if (fijo === null || claveLargo[k] === fijo) continue;
    /* Otro largo con el fijo puesto: ¿excepción o la pila cambió? Se cuentan
       las filas seguidas fuera del fijo (sin pasar a una racha nueva, que
       cambiará el fijo por su cuenta). */
    let fuera = 0;
    for (let m = k; m < n && fuera < FUERA_PARA_SOLTAR && claveLargo[m] !== fijo && !(m > k && empiezaRacha(m)); m++) fuera++;
    if (fuera >= FUERA_PARA_SOLTAR) {
      fijo = null;
      filaDelFijo = null;
      anuncio = "libre";
    } else {
      excepcion = true;
    }
  }
  if (!filaDelFijo) return { ...SIN_LARGO_FIJO, anuncio };
  const valor = cfg.largo(filaDelFijo);
  return { fijo: valor, unidad: cfg.unidad(filaDelFijo, valor), anuncio, excepcion };
}

/** «Continúa con X» + «largo fijo 7 pies» en una sola frase, con mayúscula al inicio. */
function conCabeza(partes: readonly (string | null)[], cuerpo: string): string {
  const cabeza = partes.filter((p): p is string => !!p).join(", ");
  if (!cabeza) return cuerpo;
  return `${cabeza.charAt(0).toUpperCase()}${cabeza.slice(1)}. ${cuerpo}`;
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
 *
 * Con `largo` (el ajuste «Largo fijo al leer»), además (ver `largoFijoEn`):
 * - Empieza una racha de largo → «Continúa con Panguana, largo fijo 7 pies.
 *   2, 8» (o «Largo fijo 7 pies. 2, 8» si la especie ya venía sonando).
 * - Con el fijo puesto → «2, 8»; una pieza de otro largo → «2, 8, largo 8».
 * - Se suelta → «Largo libre. 2, 6, 5».
 * - La primera que suena tras arrancar/saltar/retomar dice el fijo vigente.
 */
export function textoPorTramos<T extends { especie?: string }>(
  fila: T,
  pos: PosicionEnLectura<T>,
  medida: (f: T) => string,
  largo?: LargoEnLectura<T>,
): string {
  const especie = fila.especie?.trim();
  const iAnterior = pos.indice + (pos.haciaAtras ? 1 : -1);
  const anterior = pos.lista[iAnterior];
  const est = largo ? largoFijoEn(pos.lista, pos.indice, pos.haciaAtras, largo) : SIN_LARGO_FIJO;
  const base = !largo || est.fijo === null
    ? medida(fila)
    : est.excepcion
      ? `${largo.sinLargo(fila)}, largo ${largo.largo(fila)}`
      : largo.sinLargo(fila);
  const fraseFijo = `largo fijo ${est.fijo} ${est.unidad}`;
  const dichoLargo = pos.primera
    ? (est.fijo !== null ? fraseFijo : null)
    : est.anuncio === "fijo" ? fraseFijo : est.anuncio === "libre" ? "largo libre" : null;
  if (!especie) {
    const saleDeUnTramo = !pos.primera && !!anterior && largoDelTramo(pos.lista, iAnterior) >= MINIMO_TRAMO;
    return conCabeza([saleDeUnTramo ? "Sin especie" : null, dichoLargo], base);
  }
  if (largoDelTramo(pos.lista, pos.indice) < MINIMO_TRAMO) return `${base}, ${especie}`;
  const entra = pos.primera || !anterior || claveEspecie(anterior.especie) !== claveEspecie(especie);
  return conCabeza([entra ? `Continúa con ${especie}` : null, dichoLargo], base);
}

/** Cómo se dice una unidad de largo, en singular o plural. */
export function unidadDeLargoEnVoz(unidad: "pulg" | "cm" | "pies" | "m" | undefined, valor: number): string {
  const uno = valor === 1;
  switch (unidad) {
    case "m": return uno ? "metro" : "metros";
    case "cm": return uno ? "centímetro" : "centímetros";
    case "pulg": return uno ? "pulgada" : "pulgadas";
    default: return uno ? "pie" : "pies";
  }
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
