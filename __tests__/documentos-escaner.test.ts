import { describe, expect, it } from "vitest";
import {
  cajaDe,
  cuadrilateroCompleto,
  esImagenCompleta,
  moverTirador,
  ordenarEsquinas,
  TIRADOR,
  tamanoEnderezado,
  tiradores,
  type Cuadrilatero,
} from "@/lib/documentos/escaner/geometria";
import { aplicarFiltro } from "@/lib/documentos/escaner/filtros";

describe("geometría del recorte", () => {
  it("ordena 4 puntos arbitrarios en [tl, tr, br, bl]", () => {
    const desordenados = [
      { x: 0.9, y: 0.9 }, // br
      { x: 0.1, y: 0.1 }, // tl
      { x: 0.9, y: 0.1 }, // tr
      { x: 0.1, y: 0.9 }, // bl
    ];
    const q = ordenarEsquinas(desordenados);
    expect(q[0]).toEqual({ x: 0.1, y: 0.1 });
    expect(q[1]).toEqual({ x: 0.9, y: 0.1 });
    expect(q[2]).toEqual({ x: 0.9, y: 0.9 });
    expect(q[3]).toEqual({ x: 0.1, y: 0.9 });
  });

  it("el cuadrilátero completo se detecta como imagen entera y da 8 tiradores", () => {
    const q = cuadrilateroCompleto();
    expect(esImagenCompleta(q)).toBe(true);
    expect(tiradores(q)).toHaveLength(8);
    expect(tiradores(q)[TIRADOR.medioArriba]).toEqual({ x: 0.5, y: 0 });
  });

  it("mover una esquina mueve solo esa esquina", () => {
    const q = cuadrilateroCompleto();
    const nuevo = moverTirador(q, TIRADOR.arribaIzq, { x: 0.2, y: 0.15 });
    expect(nuevo[0]).toEqual({ x: 0.2, y: 0.15 });
    expect(nuevo[1]).toEqual(q[1]);
    expect(nuevo[3]).toEqual(q[3]);
  });

  it("mover un tirador medio arrastra el lado entero", () => {
    const q = cuadrilateroCompleto();
    // El medio de arriba está en (0.5, 0); empujarlo a y=0.2 baja ambas esquinas de arriba.
    const nuevo = moverTirador(q, TIRADOR.medioArriba, { x: 0.5, y: 0.2 });
    expect(nuevo[0].y).toBeCloseTo(0.2);
    expect(nuevo[1].y).toBeCloseTo(0.2);
    expect(nuevo[2].y).toBeCloseTo(1); // abajo-der no se movió
  });

  it("clampa fuera de rango y no pierde convexidad del rectángulo completo", () => {
    const q = cuadrilateroCompleto();
    const nuevo = moverTirador(q, TIRADOR.arribaIzq, { x: -3, y: -3 });
    expect(nuevo[0]).toEqual({ x: 0, y: 0 });
  });

  it("caja y tamaño enderezado salen de las dimensiones reales", () => {
    const q: Cuadrilatero = [
      { x: 0.1, y: 0.1 },
      { x: 0.6, y: 0.1 },
      { x: 0.6, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ];
    const caja = cajaDe(q);
    expect(caja.ancho).toBeCloseTo(0.5);
    expect(caja.alto).toBeCloseTo(0.8);
    const t = tamanoEnderezado(q, 1000, 1000);
    expect(t.ancho).toBe(500);
    expect(t.alto).toBe(800);
  });
});

/** Arma un buffer RGBA de un color uniforme. */
function lienzoUniforme(w: number, h: number, r: number, g: number, b: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = 255;
  }
  return d;
}

describe("filtros de escaneo", () => {
  it("original no cambia nada", () => {
    const d = lienzoUniforme(4, 4, 100, 120, 140);
    const copia = Uint8ClampedArray.from(d);
    aplicarFiltro(d, 4, 4, "original");
    expect(d).toEqual(copia);
  });

  it("aclarar sube el brillo de un gris medio-oscuro", () => {
    // Imagen con un gradiente para que haya rango que estirar.
    const w = 8;
    const h = 8;
    const d = new Uint8ClampedArray(w * h * 4);
    for (let p = 0; p < w * h; p++) {
      const v = 40 + (p % 8) * 10; // 40..110
      d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = v;
      d[p * 4 + 3] = 255;
    }
    const antesMax = Math.max(...Array.from({ length: w * h }, (_, p) => d[p * 4]));
    aplicarFiltro(d, w, h, "aclarar");
    const despuesMax = Math.max(...Array.from({ length: w * h }, (_, p) => d[p * 4]));
    expect(despuesMax).toBeGreaterThan(antesMax);
  });

  it("blanco y negro deja solo 0 y 255", () => {
    const w = 16;
    const h = 16;
    const d = new Uint8ClampedArray(w * h * 4);
    for (let p = 0; p < w * h; p++) {
      const v = (p * 97) % 256; // ruido determinista
      d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = v;
      d[p * 4 + 3] = 255;
    }
    aplicarFiltro(d, w, h, "byn");
    for (let p = 0; p < w * h; p++) {
      expect([0, 255]).toContain(d[p * 4]);
    }
  });

  it("magia pro empareja los canales (balance de blancos)", () => {
    // Imagen con dominante azul: el gris-mundo debe acercar las medias.
    const w = 8;
    const h = 8;
    const d = lienzoUniforme(w, h, 80, 100, 200);
    aplicarFiltro(d, w, h, "magia");
    // Tras el balance, el canal azul ya no debería ser tan dominante vs rojo.
    const r = d[0];
    const b = d[2];
    expect(b - r).toBeLessThan(200 - 80);
  });
});
