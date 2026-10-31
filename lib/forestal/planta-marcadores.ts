/**
 * planta-marcadores — dónde se planta cada pila dentro de su zona.
 *
 * Cuando una troza se suelta en el patio, tiene que APARECER ahí: un icono
 * dentro del polígono, no un número en una etiqueta. Con seis trozas en el
 * mismo patio, seis iconos en el centroide serían un icono; hay que repartirlos
 * dentro de la forma real de la zona, que casi nunca es un rectángulo.
 *
 * La cuenta: se tiende una grilla sobre el rectángulo que envuelve al polígono,
 * se descartan los puntos que caen afuera y se reparten los que quedan. Es
 * deliberadamente simple —no es un packing óptimo— porque el objetivo es que se
 * vea dónde está la madera, no calcular su posición exacta en el patio.
 *
 * PURO y client-safe.
 */

import { pointInPolygon, type LatLng } from "./loth-geo";

/** Más marcadores que esto en una zona y se muestra una pila con el conteo. */
export const MAX_MARCAS_POR_ZONA = 12;

const centroide = (pts: readonly LatLng[]): LatLng => {
  const s = pts.reduce<[number, number]>((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
  return [s[0] / pts.length, s[1] / pts.length];
};

/**
 * `n` posiciones repartidas dentro del polígono.
 *
 * Devuelve siempre exactamente `n` puntos: si la grilla no encuentra lugares
 * suficientes (polígonos muy finos, en «L», o un `n` grande), completa con el
 * centroide antes que devolver de menos y perder marcadores.
 */
export function repartirEnPoligono(poligono: readonly LatLng[], n: number): LatLng[] {
  if (n <= 0) return [];
  if (poligono.length < 3) return [];
  const c = centroide(poligono);
  if (n === 1) return [c];

  const lats = poligono.map((p) => p[0]);
  const lngs = poligono.map((p) => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

  // La grilla se agranda hasta encontrar lugar: un polígono en «L» puede tener
  // la mitad de su rectángulo afuera, y con una grilla justa quedarían todos
  // apilados en el centroide.
  for (let lado = Math.ceil(Math.sqrt(n)); lado <= Math.ceil(Math.sqrt(n)) + 4; lado++) {
    const dentro: LatLng[] = [];
    for (let f = 0; f < lado; f++) {
      for (let col = 0; col < lado; col++) {
        // (i + 0.5) / lado deja margen contra el borde: un marcador pegado al
        // límite de la zona se lee como si estuviera en la de al lado.
        const lat = maxLat - ((f + 0.5) / lado) * (maxLat - minLat);
        const lng = minLng + ((col + 0.5) / lado) * (maxLng - minLng);
        const p: LatLng = [lat, lng];
        if (pointInPolygon(p, poligono as LatLng[])) dentro.push(p);
      }
    }
    if (dentro.length >= n) return dentro.slice(0, n);
    if (lado === Math.ceil(Math.sqrt(n)) + 4) {
      return [...dentro, ...Array.from({ length: n - dentro.length }, () => c)];
    }
  }
  return [c];
}

export interface MarcaUbicada<T> {
  item: T;
  pos: LatLng;
}

/**
 * Reparte los ítems de UNA zona. Si son más que el tope, devuelve los primeros
 * y cuántos quedaron sin dibujar: veinte iconos encimados no informan más que
 * doce y un «+8».
 */
export function marcasDeZona<T>(
  poligono: readonly LatLng[] | null,
  centro: LatLng | null,
  items: readonly T[],
  tope: number = MAX_MARCAS_POR_ZONA,
): { marcas: MarcaUbicada<T>[]; sobran: number } {
  if (items.length === 0) return { marcas: [], sobran: 0 };
  const visibles = items.slice(0, tope);
  const sobran = items.length - visibles.length;

  // Zona sin polígono (sólo marcador): todo va en su punto.
  if (!poligono || poligono.length < 3) {
    if (!centro) return { marcas: [], sobran: items.length };
    return { marcas: visibles.map((item) => ({ item, pos: centro })), sobran };
  }
  const pos = repartirEnPoligono(poligono, visibles.length);
  return { marcas: visibles.map((item, i) => ({ item, pos: pos[i] ?? pos[0] })), sobran };
}
