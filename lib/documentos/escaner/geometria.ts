/**
 * Geometría del recorte tipo CamScanner (puro, sin DOM → testeable en Node).
 *
 * El cuadrilátero se guarda en coordenadas NORMALIZADAS (0..1) relativas a la
 * imagen, así sobrevive a cualquier tamaño en pantalla y a rotar la foto.
 * El orden es SIEMPRE [arriba-izq, arriba-der, abajo-der, abajo-izq] (horario).
 */

export interface Punto {
  x: number;
  y: number;
}

/** Los 4 vértices en orden horario desde arriba-izquierda. */
export type Cuadrilatero = [Punto, Punto, Punto, Punto];

/** Índice de cada tirador: 0-3 esquinas, 4-7 puntos medios de cada lado. */
export const TIRADOR = {
  arribaIzq: 0,
  arribaDer: 1,
  abajoDer: 2,
  abajoIzq: 3,
  medioArriba: 4,
  medioDer: 5,
  medioAbajo: 6,
  medioIzq: 7,
} as const;

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

const punto = (x: number, y: number): Punto => ({ x: clamp01(x), y: clamp01(y) });

/** El cuadrilátero que cubre la imagen entera (botón «Todo»). */
export function cuadrilateroCompleto(): Cuadrilatero {
  return [punto(0, 0), punto(1, 0), punto(1, 1), punto(0, 1)];
}

/**
 * Ordena 4 puntos cualesquiera en [tl, tr, br, bl]. La esquina de arriba-izq
 * es la de menor (x+y); la de abajo-der la de mayor (x+y); arriba-der la de
 * menor (y−x); abajo-izq la de mayor (y−x). Método clásico y estable.
 */
export function ordenarEsquinas(pts: readonly Punto[]): Cuadrilatero {
  if (pts.length !== 4) return cuadrilateroCompleto();
  const porSuma = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const tl = porSuma[0];
  const br = porSuma[3];
  const resto = porSuma.slice(1, 3).sort((a, b) => a.y - a.x - (b.y - b.x));
  const tr = resto[0];
  const bl = resto[1];
  return [punto(tl.x, tl.y), punto(tr.x, tr.y), punto(br.x, br.y), punto(bl.x, bl.y)];
}

/** Punto medio de dos vértices. */
const medio = (a: Punto, b: Punto): Punto => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Las 8 posiciones de los tiradores (4 esquinas + 4 medios), en orden de TIRADOR. */
export function tiradores(q: Cuadrilatero): Punto[] {
  const [tl, tr, br, bl] = q;
  return [tl, tr, br, bl, medio(tl, tr), medio(tr, br), medio(br, bl), medio(bl, tl)];
}

/**
 * Mueve un tirador al destino (normalizado) y devuelve el cuadrilátero nuevo.
 * - Una ESQUINA (0-3) se mueve sola.
 * - Un tirador MEDIO (4-7) arrastra el lado entero: sus dos vértices se
 *   trasladan por el mismo delta (comportamiento CamScanner: el borde se
 *   empuja sin deformar las esquinas opuestas).
 */
export function moverTirador(q: Cuadrilatero, indice: number, destino: Punto): Cuadrilatero {
  const d = punto(destino.x, destino.y);
  const nuevo: Cuadrilatero = [...q] as Cuadrilatero;
  if (indice <= TIRADOR.abajoIzq) {
    nuevo[indice] = d;
    return nuevo;
  }
  // Lado = par de esquinas adyacentes al tirador medio.
  const lados: Record<number, [number, number]> = {
    [TIRADOR.medioArriba]: [TIRADOR.arribaIzq, TIRADOR.arribaDer],
    [TIRADOR.medioDer]: [TIRADOR.arribaDer, TIRADOR.abajoDer],
    [TIRADOR.medioAbajo]: [TIRADOR.abajoDer, TIRADOR.abajoIzq],
    [TIRADOR.medioIzq]: [TIRADOR.abajoIzq, TIRADOR.arribaIzq],
  };
  const [a, b] = lados[indice];
  const actual = medio(q[a], q[b]);
  const dx = d.x - actual.x;
  const dy = d.y - actual.y;
  nuevo[a] = punto(q[a].x + dx, q[a].y + dy);
  nuevo[b] = punto(q[b].x + dx, q[b].y + dy);
  return nuevo;
}

/** Caja que contiene al cuadrilátero (para el recorte rectangular de respaldo). */
export function cajaDe(q: Cuadrilatero): { x: number; y: number; ancho: number; alto: number } {
  const xs = q.map((p) => p.x);
  const ys = q.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, ancho: Math.max(...xs) - x, alto: Math.max(...ys) - y };
}

/** Largo de un lado en px, dados el cuadrilátero normalizado y el tamaño real. */
const dist = (a: Punto, b: Punto, w: number, h: number): number =>
  Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);

/**
 * Tamaño de salida del enderezado: promedia los lados opuestos para no deformar.
 * Devuelve enteros ≥ 1.
 */
export function tamanoEnderezado(q: Cuadrilatero, w: number, h: number): { ancho: number; alto: number } {
  const [tl, tr, br, bl] = q;
  const ancho = Math.max(dist(tl, tr, w, h), dist(bl, br, w, h));
  const alto = Math.max(dist(tl, bl, w, h), dist(tr, br, w, h));
  return { ancho: Math.max(1, Math.round(ancho)), alto: Math.max(1, Math.round(alto)) };
}

/** ¿El cuadrilátero cubre (casi) toda la imagen? Entonces no hace falta enderezar. */
export function esImagenCompleta(q: Cuadrilatero, tol = 0.01): boolean {
  const esquinas = cuadrilateroCompleto();
  return q.every((p, i) => Math.abs(p.x - esquinas[i].x) <= tol && Math.abs(p.y - esquinas[i].y) <= tol);
}
