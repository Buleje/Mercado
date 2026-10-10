import { describe, expect, it } from "vitest";
import type { Camara } from "@/lib/camaras/camaras";
import {
  cajaIgnorada,
  configurarZonasIgnorar,
  filtrarCajasIgnoradas,
  MAX_ZONAS_IGNORAR,
  normalizarZonas,
  parteDentroDeZonas,
  zonasDeCamara,
  type ZonaIgnorada,
} from "@/lib/camaras/zonas-ignorar";

/** El poste de la entrada: franja angosta a la izquierda, de arriba abajo. */
const POSTE: ZonaIgnorada = { x: 0.1, y: 0, w: 0.1, h: 1 };
const caja = (x: number, y: number, ancho: number, alto: number) => ({ x, y, ancho, alto, confianza: 0.8 });

describe("zonas a ignorar del detector de personas", () => {
  it("dentro: una caja entera en la zona se ignora", () => {
    // Cuadro 640×360; la zona cubre x 64..128. Caja 70..120 = adentro.
    expect(parteDentroDeZonas(caja(70, 50, 50, 200), 640, 360, [POSTE])).toBeCloseTo(1);
    expect(cajaIgnorada(caja(70, 50, 50, 200), 640, 360, [POSTE])).toBe(true);
  });

  it("fuera: una caja que no toca la zona cuenta", () => {
    expect(parteDentroDeZonas(caja(300, 50, 60, 200), 640, 360, [POSTE])).toBe(0);
    expect(cajaIgnorada(caja(300, 50, 60, 200), 640, 360, [POSTE])).toBe(false);
  });

  it("persona más ancha que el poste, pasando por delante: NO se ignora (el centro sí cae adentro)", () => {
    // Caja 40..160 (120 px) con el centro en 100, dentro del poste (64..128): sólo 64/120 = 53 % adentro.
    const persona = caja(40, 40, 120, 300);
    expect(parteDentroDeZonas(persona, 640, 360, [POSTE])).toBeCloseTo(64 / 120, 5);
    expect(cajaIgnorada(persona, 640, 360, [POSTE])).toBe(false);
  });

  it("borde: exactamente 60 % adentro se ignora; apenas menos, no; tocar el lado no cuenta", () => {
    const zona: ZonaIgnorada = { x: 0, y: 0, w: 0.5, h: 1 };
    // Cuadro 1000×1000: caja 440..540 → 60 px de 100 adentro.
    expect(cajaIgnorada(caja(440, 0, 100, 100), 1000, 1000, [zona])).toBe(true);
    expect(cajaIgnorada(caja(441, 0, 100, 100), 1000, 1000, [zona])).toBe(false);
    // Pegada al lado de la zona (comparte el borde x = 500): 0 % adentro.
    expect(parteDentroDeZonas(caja(500, 0, 100, 100), 1000, 1000, [zona])).toBe(0);
  });

  it("varias zonas: se suman como unión (dos zonas pegadas tapan la caja) y no cuentan doble si se pisan", () => {
    const izq: ZonaIgnorada = { x: 0, y: 0, w: 0.5, h: 1 };
    const der: ZonaIgnorada = { x: 0.5, y: 0, w: 0.5, h: 1 };
    // Caja 400..600 de 1000: 50 % en cada una, ninguna sola llega a 60 %.
    const c = caja(400, 0, 200, 100);
    expect(cajaIgnorada(c, 1000, 1000, [izq])).toBe(false);
    expect(parteDentroDeZonas(c, 1000, 1000, [izq, der])).toBeCloseTo(1);
    expect(cajaIgnorada(c, 1000, 1000, [izq, der])).toBe(true);
    // Dos zonas iguales encimadas: sigue siendo 50 %, no 100 %.
    expect(parteDentroDeZonas(c, 1000, 1000, [izq, izq])).toBeCloseTo(0.5);
  });

  it("coordenadas relativas: la misma zona decide igual en un cuadro de 640 y en uno de 1920", () => {
    const zona: ZonaIgnorada = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    // La misma caja (en fracciones 0.3..0.5 × 0.3..0.6) medida en dos tamaños.
    const chico = caja(0.3 * 640, 0.3 * 360, 0.2 * 640, 0.3 * 360);
    const grande = caja(0.3 * 1920, 0.3 * 1080, 0.2 * 1920, 0.3 * 1080);
    expect(parteDentroDeZonas(chico, 640, 360, [zona])).toBeCloseTo(1);
    expect(parteDentroDeZonas(grande, 1920, 1080, [zona])).toBeCloseTo(1);
    // Y una que se sale a la mitad, igual en los dos tamaños.
    const mitadChico = caja(0.65 * 640, 0.3 * 360, 0.2 * 640, 0.2 * 360);
    const mitadGrande = caja(0.65 * 1920, 0.3 * 1080, 0.2 * 1920, 0.2 * 1080);
    expect(parteDentroDeZonas(mitadChico, 640, 360, [zona])).toBeCloseTo(0.5);
    expect(parteDentroDeZonas(mitadGrande, 1920, 1080, [zona])).toBeCloseTo(0.5);
  });

  it("lo que la caja tiene fuera del cuadro no cuenta; una caja sin área decide por su centro", () => {
    const zona: ZonaIgnorada = { x: 0, y: 0, w: 0.2, h: 1 };
    // Caja -100..100 en un cuadro de 1000: la parte visible (0..100) está entera en la zona.
    expect(parteDentroDeZonas(caja(-100, 0, 200, 100), 1000, 1000, [zona])).toBeCloseTo(1);
    expect(cajaIgnorada(caja(50, 50, 0, 100), 1000, 1000, [zona])).toBe(true);
    expect(cajaIgnorada(caja(500, 50, 0, 100), 1000, 1000, [zona])).toBe(false);
  });

  it("filtrar: separa las que cuentan de las ignoradas y sin zonas no toca nada", () => {
    const poste = caja(70, 50, 50, 200);
    const persona = caja(300, 50, 60, 200);
    expect(filtrarCajasIgnoradas([poste, persona], 640, 360, [POSTE])).toEqual({
      quedan: [persona],
      ignoradas: [poste],
    });
    expect(filtrarCajasIgnoradas([poste, persona], 640, 360, []).quedan).toHaveLength(2);
    // Cuadro sin tamaño (lienzo vacío): no se descarta nada.
    expect(filtrarCajasIgnoradas([poste], 0, 0, [POSTE]).quedan).toHaveLength(1);
  });

  it("normalizar: acota, redondea y rechaza más de 4, chicas o fuera del cuadro", () => {
    expect(normalizarZonas([{ x: 0.123456, y: 0, w: 0.5, h: 0.5 }])).toEqual([{ x: 0.1235, y: 0, w: 0.5, h: 0.5 }]);
    expect(normalizarZonas(Array.from({ length: MAX_ZONAS_IGNORAR + 1 }, () => POSTE))).toBeNull();
    expect(normalizarZonas([{ x: 0, y: 0, w: 0.005, h: 0.5 }])).toBeNull();
    expect(normalizarZonas([{ x: 0.8, y: 0, w: 0.5, h: 0.5 }])).toBeNull();
    expect(normalizarZonas([{ x: Number.NaN, y: 0, w: 0.5, h: 0.5 }])).toBeNull();
    expect(normalizarZonas([])).toEqual([]);
  });

  it("guardar en la cámara: `[]` deja null y lo que venga roto del KV se descarta al leer", () => {
    const camaras = [{ id: "c1", nombre: "Portón" } as Camara];
    const r = configurarZonasIgnorar(camaras, "c1", [POSTE]);
    expect(r.ok && r.camaras[0].zonasIgnorar).toEqual([POSTE]);
    const vacio = configurarZonasIgnorar(camaras, "c1", []);
    expect(vacio.ok && vacio.camaras[0].zonasIgnorar).toBeNull();
    expect(configurarZonasIgnorar(camaras, "otra", []).ok).toBe(false);
    expect(zonasDeCamara({ zonasIgnorar: [POSTE, { x: "a" }, null] })).toEqual([POSTE]);
    expect(zonasDeCamara({})).toEqual([]);
  });
});
