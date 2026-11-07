/**
 * El realce de la huella escaneada con la cámara (23-10), puro: gris + contraste
 * local; la nitidez (varianza del laplaciano) decide cuándo se toma sola; el
 * marco guía es el mismo que recorta.
 */
import { describe, expect, it } from "vitest";
import { CUADROS_PARA_TOMAR, NITIDEZ_BUENA, aGris, cajaGuia, debeTomar, nitidez, realzarHuella } from "@/lib/adelantos/huella-imagen";

function rgba(w: number, h: number, valor: (x: number, y: number) => number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = valor(x, y);
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  return d;
}
const media = (d: Uint8ClampedArray, w: number, x0: number, x1: number, y: number) => {
  let s = 0;
  for (let x = x0; x < x1; x++) s += d[(y * w + x) * 4];
  return s / (x1 - x0);
};

describe("realzarHuella", () => {
  /* Crestas de 4 px con ±5 de diferencia sobre una luz que va de 60 a 190: como una yema con la linterna de costado. */
  const w = 160;
  const h = 40;
  const crestas = (x: number) => 60 + (130 * x) / w + (Math.floor(x / 4) % 2 ? 5 : -5);

  it("las crestas tenues salen marcadas y la luz despareja se empareja", () => {
    const d = rgba(w, h, crestas);
    const crestaAntes = Math.abs(d[(20 * w + 40) * 4] - d[(20 * w + 44) * 4]);
    realzarHuella(d, w, h);
    const crestaDespues = Math.abs(d[(20 * w + 40) * 4] - d[(20 * w + 44) * 4]);
    expect(crestaAntes).toBeLessThan(15);
    expect(crestaDespues).toBeGreaterThan(crestaAntes * 3);
    /* Lo de la izquierda (oscuro) y lo de la derecha (claro) quedan con la misma media, ~128. */
    expect(Math.abs(media(d, w, 20, 60, 20) - media(d, w, 100, 140, 20))).toBeLessThan(12);
    expect(Math.abs(media(d, w, 20, 140, 20) - 128)).toBeLessThan(12);
  });

  it("una zona pareja (el fondo, la uña) queda gris: no infla el ruido", () => {
    const d = rgba(40, 40, () => 100);
    realzarHuella(d, 40, 40);
    for (let i = 0; i < d.length; i += 4) {
      expect(Math.abs(d[i] - 128)).toBeLessThanOrEqual(1);
      expect(d[i]).toBe(d[i + 1]);
      expect(d[i + 3]).toBe(255);
    }
  });
});

describe("nitidez y cuándo se toma sola", () => {
  it("lo nítido mide más que lo borroso; lo plano, 0", () => {
    const w = 60;
    const nitida = aGris(rgba(w, w, (x, y) => ((x >> 1) + (y >> 1)) % 2 ? 200 : 60), w, w);
    const borrosa = aGris(rgba(w, w, (x) => 130 + 20 * Math.sin(x / 6)), w, w);
    expect(nitidez(nitida, w, w)).toBeGreaterThan(NITIDEZ_BUENA);
    expect(nitidez(borrosa, w, w)).toBeLessThan(NITIDEZ_BUENA);
    expect(nitidez(aGris(rgba(w, w, () => 90), w, w), w, w)).toBe(0);
  });

  it(`pide ${CUADROS_PARA_TOMAR} cuadros nítidos y quietos seguidos`, () => {
    const b = NITIDEZ_BUENA;
    expect(debeTomar([b + 10, b + 12])).toBe(false);
    expect(debeTomar([b + 10, b + 12, b + 11])).toBe(true);
    expect(debeTomar([b - 30, b + 12, b + 11])).toBe(false); // uno borroso
    expect(debeTomar([b, b * 1.6, b * 1.1])).toBe(false); // se movía
    expect(debeTomar([5, 5, b, b, b])).toBe(true); // mira sólo los últimos
  });
});

describe("cajaGuia", () => {
  it("es un marco 3:4 centrado, dentro del cuadro, en horizontal y en vertical", () => {
    for (const [w, h] of [
      [1280, 720],
      [720, 1280],
    ]) {
      const c = cajaGuia(w, h);
      expect(c.alto / c.ancho).toBeCloseTo(4 / 3, 1);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.ancho).toBeLessThanOrEqual(w);
      expect(c.y + c.alto).toBeLessThanOrEqual(h);
      expect(Math.abs(c.x * 2 + c.ancho - w)).toBeLessThanOrEqual(1);
    }
  });
});
