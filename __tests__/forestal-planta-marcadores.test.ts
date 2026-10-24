/**
 * Reparto de marcadores dentro de una zona de la planta.
 *
 * Lo que se blinda: que la madera aparezca DENTRO del polígono que le tocó. Un
 * marcador que cae fuera de su zona dice que la troza está en el patio de al
 * lado — en un mapa que se imprime para la ARFFS, eso es peor que no dibujarlo.
 * Y que nunca se pierda un ítem: si la grilla no encuentra lugar, se apila en el
 * centroide, no desaparece.
 */
import { describe, expect, it } from "vitest";
import { pointInPolygon, type LatLng } from "@/lib/forestal/loth-geo";
import {
  marcasDeZona,
  MAX_MARCAS_POR_ZONA,
  repartirEnPoligono,
} from "@/lib/forestal/planta-marcadores";

/** Cuadrado de ~100 m de lado cerca de Ciudad Constitución. */
const CUADRADO: LatLng[] = [
  [-9.8550, -75.0215],
  [-9.8550, -75.0205],
  [-9.8560, -75.0205],
  [-9.8560, -75.0215],
];

/** Polígono en «L»: la mitad de su rectángulo envolvente queda afuera. */
const ELE: LatLng[] = [
  [-9.8550, -75.0215],
  [-9.8550, -75.0205],
  [-9.8555, -75.0205],
  [-9.8555, -75.0210],
  [-9.8560, -75.0210],
  [-9.8560, -75.0215],
];

const todosDentro = (pts: LatLng[], poly: LatLng[]) => pts.every((p) => pointInPolygon(p, poly));

describe("repartir marcadores en un polígono", () => {
  it("uno solo va al centro", () => {
    const r = repartirEnPoligono(CUADRADO, 1);
    expect(r).toHaveLength(1);
    expect(pointInPolygon(r[0], CUADRADO)).toBe(true);
  });

  it("devuelve exactamente los que se piden", () => {
    for (const n of [1, 2, 3, 5, 9, 12, 20]) {
      expect(repartirEnPoligono(CUADRADO, n)).toHaveLength(n);
    }
  });

  it("todos caen DENTRO del polígono", () => {
    for (const n of [2, 4, 7, 12]) {
      expect(todosDentro(repartirEnPoligono(CUADRADO, n), CUADRADO)).toBe(true);
    }
  });

  it("no se repiten posiciones cuando hay lugar", () => {
    const r = repartirEnPoligono(CUADRADO, 9);
    expect(new Set(r.map((p) => p.join(","))).size).toBe(9);
  });

  it("un polígono en «L» tampoco deja marcadores afuera", () => {
    for (const n of [2, 4, 8]) {
      const r = repartirEnPoligono(ELE, n);
      expect(r).toHaveLength(n);
      expect(todosDentro(r, ELE)).toBe(true);
    }
  });

  it("es determinista: la misma zona reparte igual dos veces", () => {
    expect(repartirEnPoligono(ELE, 6)).toEqual(repartirEnPoligono(ELE, 6));
  });

  it("cero o un polígono inválido no devuelven nada", () => {
    expect(repartirEnPoligono(CUADRADO, 0)).toEqual([]);
    expect(repartirEnPoligono([[-9.85, -75.02]], 3)).toEqual([]);
    expect(repartirEnPoligono([], 3)).toEqual([]);
  });
});

describe("marcas de una zona", () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `i${i}` }));

  it("una marca por ítem, dentro de la zona", () => {
    const { marcas, sobran } = marcasDeZona(CUADRADO, null, items(5));
    expect(marcas).toHaveLength(5);
    expect(sobran).toBe(0);
    expect(todosDentro(marcas.map((m) => m.pos), CUADRADO)).toBe(true);
    expect(marcas.map((m) => m.item.id)).toEqual(["i0", "i1", "i2", "i3", "i4"]);
  });

  it("por encima del tope dibuja los primeros y CUENTA el resto", () => {
    const { marcas, sobran } = marcasDeZona(CUADRADO, null, items(20));
    expect(marcas).toHaveLength(MAX_MARCAS_POR_ZONA);
    expect(sobran).toBe(20 - MAX_MARCAS_POR_ZONA);
  });

  it("respeta un tope propio", () => {
    const { marcas, sobran } = marcasDeZona(CUADRADO, null, items(10), 3);
    expect(marcas).toHaveLength(3);
    expect(sobran).toBe(7);
  });

  it("una zona sin polígono apila todo en su punto", () => {
    const centro: LatLng = [-9.8555, -75.021];
    const { marcas, sobran } = marcasDeZona(null, centro, items(3));
    expect(marcas.map((m) => m.pos)).toEqual([centro, centro, centro]);
    expect(sobran).toBe(0);
  });

  it("sin polígono NI punto no inventa posiciones: las cuenta como sobrantes", () => {
    const { marcas, sobran } = marcasDeZona(null, null, items(4));
    expect(marcas).toEqual([]);
    expect(sobran).toBe(4);
  });

  it("sin ítems no hay nada que dibujar", () => {
    expect(marcasDeZona(CUADRADO, null, [])).toEqual({ marcas: [], sobran: 0 });
  });
});
