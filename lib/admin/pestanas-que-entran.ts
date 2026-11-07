/**
 * Qué pestañas entran en UNA fila y cuáles pasan al botón «Más» (patrón
 * priority+). Brandon 19-10, «Más espacio arriba»: a 1280 px diez secciones
 * bajaban sus pestañas a una segunda fila bajo el título (barra de 114-122 px
 * contra 66) y a 400 px 47 pestañas quedaban fuera de la pantalla, detrás de
 * un desliz que nadie descubre.
 *
 * Funciones puras: reciben anchos ya medidos (los mide
 * `hooks/use-pestanas-que-entran.ts`) y devuelven el reparto. Así se prueban
 * sin navegador y la barra del módulo y la de secciones deciden igual.
 */

export interface RepartoDePestanas<T extends string = string> {
  /** En el orden en que se dibujan. La activa siempre está. */
  visibles: T[];
  /** En el orden de la barra: lo que lista el menú «Más». */
  escondidas: T[];
}

export interface EntradaReparto<T extends string> {
  /** Todas, en el orden de la barra. */
  ids: readonly T[];
  /** Ancho natural de cada pestaña (px). */
  anchos: Readonly<Partial<Record<T, number>>>;
  /** Ancho libre para las pestañas y el «Más» (px). */
  disponible: number;
  /** Ancho del botón «Más» con su separación (px). */
  anchoMas: number;
  /** Separación entre pestañas (px). */
  separacion: number;
  activa: T | null;
  /** Van al «Más» aunque entren (las que no abres hace 30 días). La activa nunca. */
  aMas?: readonly T[];
  /** El «Más» se dibuja aunque todo entre (lleva otras opciones): se le reserva lugar. */
  conMas?: boolean;
}

/** Medio píxel: los anchos fraccionarios del zoom no deben esconder una pestaña que entra. */
const TOLERANCIA = 0.5;

export function repartirPestanas<T extends string>(e: EntradaReparto<T>): RepartoDePestanas<T> {
  const forzadas = new Set<T>(e.aMas ?? []);
  if (e.activa != null) forzadas.delete(e.activa);
  const candidatas = e.ids.filter((id) => !forzadas.has(id));
  const ancho = (id: T) => e.anchos[id] ?? 0;
  const total = (lista: readonly T[]) =>
    lista.reduce((suma, id) => suma + ancho(id), 0) + e.separacion * Math.max(0, lista.length - 1);

  if (!e.conMas && forzadas.size === 0 && total(candidatas) <= e.disponible + TOLERANCIA) {
    return { visibles: candidatas, escondidas: [] };
  }

  const limite = e.disponible - e.anchoMas;
  const visibles: T[] = [];
  for (const id of candidatas) {
    if (total([...visibles, id]) > limite + TOLERANCIA) break;
    visibles.push(id);
  }
  /* La activa cayó al «Más»: ocupa el lugar de la última que se ve (y de las
     que haga falta si es más ancha), nunca se queda escondida. */
  const activa = e.activa != null && candidatas.includes(e.activa) ? e.activa : null;
  if (activa && !visibles.includes(activa)) {
    while (visibles.length > 0 && total([...visibles, activa]) > limite + TOLERANCIA) visibles.pop();
    visibles.push(activa);
  }
  /* Ni una entra (pantalla muy angosta): al menos la primera, el resto al «Más». */
  if (visibles.length === 0 && candidatas.length > 0) visibles.push(candidatas[0]);

  const enVista = new Set(visibles);
  return { visibles, escondidas: e.ids.filter((id) => !enVista.has(id)) };
}

/** Un lugar donde pueden ir las pestañas (al lado del título, en su fila…). */
export interface LugarDePestanas {
  /** Ancho libre para pestañas + «Más» en ese lugar (px). */
  ancho: number;
  /** Cuántas tienen que verse como mínimo para elegir este lugar (si no entran todas). */
  minimo: number;
}

/**
 * Prueba los lugares en orden y se queda con el primero donde entran todas o
 * se ven al menos `minimo`; si ninguno cumple, el último. `lugar` = índice.
 */
export function elegirLugar<T extends string>(
  lugares: readonly LugarDePestanas[],
  base: Omit<EntradaReparto<T>, "disponible">,
): RepartoDePestanas<T> & { lugar: number } {
  let ultimo: (RepartoDePestanas<T> & { lugar: number }) | null = null;
  for (let i = 0; i < lugares.length; i += 1) {
    const reparto = repartirPestanas({ ...base, disponible: lugares[i].ancho });
    ultimo = { ...reparto, lugar: i };
    if (reparto.escondidas.length === 0 || reparto.visibles.length >= lugares[i].minimo) return ultimo;
  }
  return ultimo ?? { visibles: [...base.ids], escondidas: [], lugar: 0 };
}
