/**
 * Los trazos de una firma a mano (dedo en el celular, mouse en la PC).
 *
 * Se guardan como VECTOR y no como píxeles: el mismo dibujo se pinta en la
 * pantalla con el color del tema (claro u oscuro) y se exporta en tinta negra
 * sobre blanco para el papel, a la resolución que pida cada salida (la hoja que
 * se guarda, el PDF). Con píxeles, el oscuro exportaba tinta clara sobre negro.
 *
 * Coordenadas en «anchos del lienzo»: `x` va de 0 a 1 y `y` de 0 a
 * 1/RELACION_LIENZO. Así una distancia mide lo mismo en las dos direcciones, y
 * girar el celular (el lienzo cambia de tamaño) no deforma la firma.
 */

export interface Punto {
  x: number;
  y: number;
}
export type Trazo = Punto[];

/** Ancho ÷ alto del lienzo: 2:1 entra a lo ancho de un celular de 400 px. */
export const RELACION_LIENZO = 2;

/**
 * Tinta mínima para que cuente como firma, en anchos de lienzo. Un toque
 * suelto o una rayita de 2 cm no es una firma: sin esto, rozar el lienzo al
 * pasar el dedo habilitaba «Guardar».
 */
export const TINTA_MINIMA = 0.2;

/** Largo total dibujado, en anchos de lienzo. */
export function largoDeTrazos(trazos: readonly Trazo[]): number {
  let total = 0;
  for (const t of trazos) {
    for (let i = 1; i < t.length; i++) total += Math.hypot(t[i].x - t[i - 1].x, t[i].y - t[i - 1].y);
  }
  return total;
}

export function esFirmaSuficiente(trazos: readonly Trazo[]): boolean {
  return largoDeTrazos(trazos) >= TINTA_MINIMA;
}

export interface Caja {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** El rectángulo que ocupa la tinta; `null` sin trazos. */
export function cajaDeTrazos(trazos: readonly Trazo[]): Caja | null {
  let caja: Caja | null = null;
  for (const t of trazos) {
    for (const p of t) {
      if (!caja) caja = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      else {
        caja.x0 = Math.min(caja.x0, p.x);
        caja.y0 = Math.min(caja.y0, p.y);
        caja.x1 = Math.max(caja.x1, p.x);
        caja.y1 = Math.max(caja.y1, p.y);
      }
    }
  }
  return caja;
}

export interface Encuadre {
  escala: number;
  dx: number;
  dy: number;
}

/**
 * Cómo llevar la tinta a un rectángulo de `ancho × alto` píxeles, centrada y
 * sin deformar, con `margen` libre alrededor. Para exportar: la firma ocupa el
 * espacio de la hoja aunque se haya dibujado en una esquina del lienzo.
 */
export function encuadrar(caja: Caja, ancho: number, alto: number, margen: number): Encuadre {
  const w = Math.max(caja.x1 - caja.x0, 1e-6);
  const h = Math.max(caja.y1 - caja.y0, 1e-6);
  const escala = Math.min((ancho - 2 * margen) / w, (alto - 2 * margen) / h);
  return {
    escala,
    dx: (ancho - w * escala) / 2 - caja.x0 * escala,
    dy: (alto - h * escala) / 2 - caja.y0 * escala,
  };
}

/** Lo mínimo del contexto 2D que se usa: así se prueba sin navegador. */
export interface Pincel {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  stroke(): void;
  fill(): void;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
}

/**
 * Pinta los trazos con curvas por los puntos medios (sin esto la firma del
 * dedo sale en serrucho). Un toque suelto se pinta como punto: es la tilde de
 * una «í» o el punto final de muchas firmas.
 */
export function pintarTrazos(
  ctx: Pincel,
  trazos: readonly Trazo[],
  { encuadre, tinta, grosor }: { encuadre: Encuadre; tinta: string; grosor: number },
): void {
  const { escala, dx, dy } = encuadre;
  const X = (p: Punto) => p.x * escala + dx;
  const Y = (p: Punto) => p.y * escala + dy;
  ctx.strokeStyle = tinta;
  ctx.fillStyle = tinta;
  ctx.lineWidth = grosor;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const t of trazos) {
    if (t.length === 0) continue;
    if (t.length === 1) {
      ctx.beginPath();
      ctx.arc(X(t[0]), Y(t[0]), grosor / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(X(t[0]), Y(t[0]));
    for (let i = 1; i < t.length - 1; i++) {
      const mx = (X(t[i]) + X(t[i + 1])) / 2;
      const my = (Y(t[i]) + Y(t[i + 1])) / 2;
      ctx.quadraticCurveTo(X(t[i]), Y(t[i]), mx, my);
    }
    ctx.lineTo(X(t[t.length - 1]), Y(t[t.length - 1]));
    ctx.stroke();
  }
}
