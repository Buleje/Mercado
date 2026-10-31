/**
 * Faja marginal de protección y perfil de terreno.
 *
 * Lo que se blinda: la faja define dónde NO se tumba (protección de cauces) y el
 * perfil define por dónde se puede arrastrar. Si la geometría o las pendientes
 * salen mal, el sistema habilita a talar en la ribera o a planificar una trocha
 * imposible.
 */
import { describe, expect, it } from "vitest";
import { arbolesEnFaja, construirFaja, distanciaATraza, dentroDeFaja, FAJA_SUGERIDA } from "@/lib/forestal/loth-faja";
import {
  construirPerfil,
  muestrearTraza,
  perfilToSvgPath,
  PENDIENTE_CRITICA_PCT,
} from "@/lib/forestal/loth-elevacion";
import type { LatLng } from "@/lib/forestal/loth-geo";

/** Cauce recto de oeste a este, ~1,1 km en la latitud −9. */
const cauce: LatLng[] = [
  [-9, -75],
  [-9, -74.99],
];

describe("faja marginal de protección", () => {
  it("arma un corredor con un polígono por tramo", () => {
    const f = construirFaja(cauce, 50);
    expect(f.tramos).toHaveLength(1);
    expect(f.tramos[0]).toHaveLength(4);
    expect(f.largoM).toBeGreaterThan(1_090);
    // Largo × ancho total (50 m a cada lado = 100 m).
    expect(f.areaHaAprox).toBeCloseTo((f.largoM * 100) / 10_000, 2);
  });

  it("el ancho es real: los bordes quedan a la distancia pedida del eje", () => {
    const f = construirFaja(cauce, 50);
    const [arribaA, , abajoB] = f.tramos[0];
    expect(distanciaATraza(arribaA, cauce)).toBeCloseTo(50, 0);
    expect(distanciaATraza(abajoB, cauce)).toBeCloseTo(50, 0);
  });

  it("pone un disco en cada quiebre, no en los extremos", () => {
    const quebrada: LatLng[] = [
      [-9, -75],
      [-9, -74.99],
      [-8.99, -74.98],
    ];
    const f = construirFaja(quebrada, 30);
    expect(f.tramos).toHaveLength(2);
    expect(f.discos).toHaveLength(1); // solo el vértice del medio
    expect(f.discos[0].radioM).toBe(30);
  });

  it("no inventa geometría con datos insuficientes", () => {
    expect(construirFaja([[-9, -75]], 50).tramos).toHaveLength(0);
    expect(construirFaja(cauce, 0).tramos).toHaveLength(0);
    expect(construirFaja(cauce, Number.NaN).areaHaAprox).toBe(0);
  });

  it("mide la distancia perpendicular al cauce, no al vértice más cercano", () => {
    // Punto sobre el medio del cauce, 100 m al norte.
    const medio: LatLng = [-9 + 100 / 111_132, -74.995];
    expect(distanciaATraza(medio, cauce)).toBeCloseTo(100, 0);
    expect(dentroDeFaja(medio, cauce, 50)).toBe(false);
    expect(dentroDeFaja(medio, cauce, 150)).toBe(true);
  });

  it("detecta los árboles del censo que caen dentro de la faja", () => {
    const arboles = [
      { code: "cerca", lat: -9 + 20 / 111_132, lng: -74.995 }, // 20 m del cauce
      { code: "lejos", lat: -9 + 300 / 111_132, lng: -74.995 }, // 300 m
    ];
    const dentro = arbolesEnFaja(arboles, cauce, FAJA_SUGERIDA.rio);
    expect(dentro.map((a) => a.code)).toEqual(["cerca"]);
  });
});

describe("perfil de terreno", () => {
  const traza: LatLng[] = [
    [-9, -75],
    [-9, -74.99],
    [-9, -74.98],
  ];

  it("muestrea la traza en puntos equidistantes, extremos incluidos", () => {
    const m = muestrearTraza(traza, 5);
    expect(m).toHaveLength(5);
    expect(m[0]).toEqual(traza[0]);
    expect(m[4][1]).toBeCloseTo(-74.98, 5);
    // Equidistantes: el del medio cae en el vértice intermedio.
    expect(m[2][1]).toBeCloseTo(-74.99, 4);
  });

  it("respeta el tope de muestras del servicio", () => {
    expect(muestrearTraza(traza, 500).length).toBeLessThanOrEqual(100);
    expect(muestrearTraza([], 10)).toHaveLength(0);
  });

  it("calcula desnivel, ascenso, descenso y pendientes", () => {
    const m = muestrearTraza(traza, 3);
    const p = construirPerfil(m, [100, 150, 120]);
    expect(p.puntos).toHaveLength(3);
    expect(p.elevMinM).toBe(100);
    expect(p.elevMaxM).toBe(150);
    expect(p.desnivelM).toBe(50);
    expect(p.ascensoM).toBe(50);
    expect(p.descensoM).toBe(30);
    expect(p.puntos[1].pendientePct).toBeGreaterThan(0); // sube
    expect(p.puntos[2].pendientePct).toBeLessThan(0); // baja
  });

  it("avisa de los tramos que superan la pendiente crítica del arrastre", () => {
    // 400 m de subida en 100 m de largo = 400%: imposible para un tractor.
    const corta: LatLng[] = [
      [-9, -75],
      [-9, -74.999],
    ];
    const p = construirPerfil(muestrearTraza(corta, 2), [100, 500]);
    expect(p.pendienteMaxPct).toBeGreaterThan(PENDIENTE_CRITICA_PCT);
    expect(p.largoCriticoM).toBeGreaterThan(0);
    expect(p.advertencia).toContain("arrastre mecanizado");
  });

  it("terreno plano: sin advertencia", () => {
    const p = construirPerfil(muestrearTraza(traza, 4), [180, 180, 181, 180]);
    expect(p.advertencia).toBeNull();
    expect(Math.abs(p.pendienteMediaPct)).toBeLessThan(1);
  });

  it("si el servicio devuelve menos elevaciones, corta al mínimo común", () => {
    const p = construirPerfil(muestrearTraza(traza, 5), [100, 110]);
    expect(p.puntos).toHaveLength(2);
  });

  it("sin datos no rompe ni dibuja", () => {
    const p = construirPerfil([], []);
    expect(p.puntos).toHaveLength(0);
    expect(perfilToSvgPath(p, 300, 80)).toBe("");
  });

  it("el path SVG queda dentro del lienzo", () => {
    const p = construirPerfil(muestrearTraza(traza, 4), [100, 120, 90, 110]);
    const d = perfilToSvgPath(p, 300, 80);
    expect(d.startsWith("M")).toBe(true);
    const coords = d.match(/-?\d+\.\d+/g)!.map(Number);
    for (let i = 0; i < coords.length; i += 2) {
      expect(coords[i]).toBeGreaterThanOrEqual(0);
      expect(coords[i]).toBeLessThanOrEqual(300);
      expect(coords[i + 1]).toBeGreaterThanOrEqual(0);
      expect(coords[i + 1]).toBeLessThanOrEqual(80);
    }
  });
});
