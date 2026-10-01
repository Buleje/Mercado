/**
 * Cartografía del bloque de plantación (ADR-380) — vértices UTM → mapa/superficie.
 *
 * Reusa `loth-utm.ts`/`loth-geo.ts` sin reinventar la matemática; lo que se
 * testea acá es la ADAPTACIÓN a la forma del bloque (vértices con `orden`,
 * huecos de 0-1-2 puntos que todavía no forman polígono).
 */
import { describe, expect, it } from "vitest";
import {
  centroideConjunto,
  geometriaBloque,
  puntoAVertice,
  tablaVertices,
  verticesToRing,
  type VerticeBloque,
} from "@/lib/forestal/plantacion-cartografia";

// Un cuadrado ~ chico en Ucayali (18S), orden mezclado a propósito para probar el sort.
const CUADRADO: VerticeBloque[] = [
  { orden: 2, este: 500_100, norte: 9_000_100, zonaUtm: "18S" },
  { orden: 0, este: 500_000, norte: 9_000_000, zonaUtm: "18S" },
  { orden: 3, este: 500_000, norte: 9_000_100, zonaUtm: "18S" },
  { orden: 1, este: 500_100, norte: 9_000_000, zonaUtm: "18S" },
];

describe("verticesToRing / tablaVertices", () => {
  it("ordena por `orden`, no por el orden de llegada del array", () => {
    const tabla = tablaVertices(CUADRADO);
    expect(tabla.map((v) => v.este)).toEqual([500_000, 500_100, 500_100, 500_000]);
  });

  it("los códigos de vértice son C.001, C.002… en el orden correcto", () => {
    const tabla = tablaVertices(CUADRADO);
    expect(tabla.map((v) => v.codigo)).toEqual(["C.001", "C.002", "C.003", "C.004"]);
  });

  it("convierte a lat/lng — devuelve un punto por vértice", () => {
    const ring = verticesToRing(CUADRADO);
    expect(ring).toHaveLength(4);
    for (const [lat, lng] of ring) {
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lng)).toBe(true);
      // Perú: latitudes negativas (hemisferio sur), longitudes ~ -80 a -68.
      expect(lat).toBeLessThan(0);
      expect(lng).toBeLessThan(-60);
    }
  });
});

describe("geometriaBloque", () => {
  it("sin vértices, no hay geometría — nunca inventa un área", () => {
    const g = geometriaBloque([]);
    expect(g.areaCalculadaHa).toBeNull();
    expect(g.perimetroM).toBeNull();
  });

  it("con 1-2 vértices, todavía no es polígono (área null)", () => {
    const g = geometriaBloque(CUADRADO.slice(0, 2));
    expect(g.areaCalculadaHa).toBeNull();
  });

  it("con 3+ vértices, calcula área y perímetro > 0", () => {
    const g = geometriaBloque(CUADRADO);
    expect(g.areaCalculadaHa).not.toBeNull();
    expect(g.areaCalculadaHa!).toBeGreaterThan(0);
    expect(g.perimetroM).not.toBeNull();
    expect(g.perimetroM!).toBeGreaterThan(0);
    expect(g.centroide).not.toBeNull();
  });

  it("un cuadrado de 100×100 m da ~1 ha (tolerancia de la proyección, no del punto flotante)", () => {
    const g = geometriaBloque(CUADRADO);
    // 100m × 100m = 10 000 m² = 1 ha. Tolerancia amplia: es geodesia sobre una
    // proyección UTM sintética, no un cálculo exacto de escritorio.
    expect(g.areaCalculadaHa!).toBeGreaterThan(0.9);
    expect(g.areaCalculadaHa!).toBeLessThan(1.1);
  });
});

describe("puntoAVertice", () => {
  it("un punto de Ucayali da UTM zona 18, hemisferio sur, valores en rango real", () => {
    const v = puntoAVertice(-8.379, -74.553, 0); // Pucallpa aprox.
    expect(v.zonaUtm).toMatch(/^18S$/);
    expect(v.este).toBeGreaterThan(0);
    expect(v.norte).toBeGreaterThan(9_000_000); // hemisferio sur, falso origen 10 000 000
  });
});

describe("centroideConjunto", () => {
  it("promedia los centroides de varios bloques con geometría", () => {
    const g1 = geometriaBloque(CUADRADO);
    const g2 = geometriaBloque(CUADRADO.map((v) => ({ ...v, este: v.este + 1000 })));
    const c = centroideConjunto([g1, g2]);
    expect(c).not.toBeNull();
  });

  it("ignora bloques sin geometría (sin vértices) en vez de romper", () => {
    const g1 = geometriaBloque(CUADRADO);
    const gVacio = geometriaBloque([]);
    expect(centroideConjunto([g1, gVacio])).not.toBeNull();
    expect(centroideConjunto([gVacio])).toBeNull();
  });
});
