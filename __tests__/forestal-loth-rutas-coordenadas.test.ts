/**
 * Rutas y puntos del mapa del Libro TH con sus coordenadas: largo, zona UTM
 * deducida de la longitud (Blas: 18 S), inicio/fin, vértices, pendiente sobre
 * la grilla del planificador y lo que se exporta (Excel, GeoJSON, KML).
 */
import { describe, expect, it } from "vitest";
import type { LothReferencia, LothVia } from "@/lib/forestal/loth-cartografia";
import type { GrillaElevacion } from "@/lib/forestal/loth-geografia";
import type { LatLng } from "@/lib/forestal/loth-geo";
import { distanceM, fromUtm } from "@/lib/forestal/loth-utm";
import {
  claveDePunto,
  claveDeRuta,
  coordDe,
  filasDePuntos,
  filasDeRutas,
  geoJsonDeRutas,
  hojasDeRutas,
  kmlDeRutas,
  pendienteMaxDeTraza,
  textoDePunto,
  textoDeRuta,
  textoLargo,
} from "@/lib/forestal/loth-rutas-coordenadas";

/** La «Trocha 1 (propuesta)» de Blas, recortada a sus 3 primeros vértices (29-09). */
const TROCHA_BLAS: LothVia = {
  id: "prop-trocha-1",
  nombre: "Trocha 1 (propuesta)",
  tipo: "trocha",
  puntos: [
    [-9.7883297, -74.7977489],
    [-9.7889, -74.7971],
    [-9.7896, -74.7963],
  ],
};

const PATIO_BLAS: LothReferencia = { id: "prop-acopio-1", nombre: "Patio de acopio (propuesta)", tipo: "acopio", lat: -9.7883297, lng: -74.7977489, nota: "" };

describe("coordDe — la zona sale de la longitud", () => {
  it("Blas (Ucayali, −74,80) cae en la 18 Sur y vuelve al mismo punto", () => {
    const c = coordDe([PATIO_BLAS.lat, PATIO_BLAS.lng]);
    expect(c.zone).toBe(18);
    expect(c.south).toBe(true);
    expect(c.zona).toBe("18S");
    // El censo de Blas va de E 521 865 a 522 772 y N 8 917 274 a 8 918 254: el patio está ahí.
    expect(c.este).toBeGreaterThan(521_000);
    expect(c.este).toBeLessThan(523_000);
    expect(c.norte).toBeGreaterThan(8_917_000);
    expect(c.norte).toBeLessThan(8_919_000);
    const [lat, lng] = fromUtm(c.este, c.norte, c.zone, c.south);
    expect(lat).toBeCloseTo(PATIO_BLAS.lat, 6);
    expect(lng).toBeCloseTo(PATIO_BLAS.lng, 6);
  });

  it("Piura (−80,6) es 17 y Madre de Dios (−70,0) es 19", () => {
    expect(coordDe([-5.2, -80.6]).zona).toBe("17S");
    expect(coordDe([-12.6, -70.0]).zona).toBe("19S");
  });
});

describe("filasDeRutas", () => {
  it("largo = suma de los tramos; inicio, fin y el acumulado de cada vértice", () => {
    const [f] = filasDeRutas([TROCHA_BLAS]);
    const t1 = distanceM(TROCHA_BLAS.puntos[0], TROCHA_BLAS.puntos[1]);
    const t2 = distanceM(TROCHA_BLAS.puntos[1], TROCHA_BLAS.puntos[2]);
    expect(f.largoM).toBeCloseTo(t1 + t2, 6);
    expect(f.vertices.map((v) => v.n)).toEqual([1, 2, 3]);
    expect(f.vertices[0].acumuladoM).toBe(0);
    expect(f.vertices[1].acumuladoM).toBeCloseTo(t1, 6);
    expect(f.inicio.lat).toBe(TROCHA_BLAS.puntos[0][0]);
    expect(f.fin.lng).toBe(TROCHA_BLAS.puntos[2][1]);
    expect(f.tipoLabel).toBe("Trocha de arrastre");
    expect(f.propuesta).toBe(true);
    expect(f.clave).toBe(claveDeRuta("prop-trocha-1"));
    expect(f.pendienteMaxPct).toBeNull(); // sin relieve no se inventa
  });

  it("una ruta que cruza el −78 va entera en la zona de la mayoría (no salta de huso)", () => {
    const via: LothVia = { id: "v", nombre: "Camino", tipo: "acceso", puntos: [[-6, -78.01], [-6, -77.99], [-6, -77.98]] };
    const [f] = filasDeRutas([via]);
    expect(new Set(f.vertices.map((v) => v.zona))).toEqual(new Set(["18S"]));
    // El primer vértice, forzado a la 18, queda al oeste del meridiano de borde: Este < 166 km del huso 18.
    expect(f.vertices[0].este).toBeLessThan(f.vertices[1].este);
  });

  it("una vía de un solo punto no es una ruta", () => {
    expect(filasDeRutas([{ id: "x", nombre: "x", tipo: "trocha", puntos: [[-9, -74]] }])).toEqual([]);
  });
});

describe("pendienteMaxDeTraza — la misma cuenta del planificador", () => {
  // Grilla de 3×3 en ~220 m de lado: sube 10 m por columna hacia el este → 10 m cada ~110 m.
  const sur = -9.79;
  const oeste = -74.8;
  const dLat = 0.002;
  const dLng = 0.002;
  const grilla: GrillaElevacion = {
    nx: 3,
    ny: 3,
    bbox: { sur, norte: sur + dLat, oeste, este: oeste + dLng },
    valores: [300, 310, 320, 300, 310, 320, 300, 310, 320],
  };
  const celdaEsteM = distanceM([sur, oeste], [sur, oeste + dLng / 2]);

  it("hacia el este: 10 m por celda", () => {
    const traza: LatLng[] = [
      [sur + dLat / 2, oeste + 0.0002],
      [sur + dLat / 2, oeste + dLng - 0.0002],
    ];
    expect(pendienteMaxDeTraza(traza, grilla)).toBeCloseTo((10 / celdaEsteM) * 100, 0);
  });

  it("hacia el norte (a lo largo de la curva de nivel): plano", () => {
    const traza: LatLng[] = [
      [sur + 0.0002, oeste + dLng / 2],
      [sur + dLat - 0.0002, oeste + dLng / 2],
    ];
    expect(pendienteMaxDeTraza(traza, grilla)).toBeCloseTo(0, 1);
  });

  it("fuera de la grilla o sin grilla: sin dato", () => {
    expect(pendienteMaxDeTraza([[-12, -70], [-12.001, -70]], grilla)).toBeNull();
    expect(pendienteMaxDeTraza(TROCHA_BLAS.puntos, null)).toBeNull();
  });

  it("filasDeRutas la usa cuando llega la grilla", () => {
    const via: LothVia = { id: "e", nombre: "Este", tipo: "trocha", puntos: [[sur + dLat / 2, oeste + 0.0002], [sur + dLat / 2, oeste + dLng - 0.0002]] };
    expect(filasDeRutas([via], grilla)[0].pendienteMaxPct).toBeGreaterThan(8);
  });
});

describe("lo que se copia y se exporta", () => {
  const rutas = filasDeRutas([TROCHA_BLAS]);
  const puntos = filasDePuntos([PATIO_BLAS]);

  it("el texto de una ruta dice inicio y fin en UTM y lat/lng; con vértices, uno por renglón", () => {
    const t = textoDeRuta(rutas[0]);
    expect(t).toMatch(/^Trocha 1 \(propuesta\) \(Trocha de arrastre\) · \d+ m/);
    expect(t).toContain("Inicio: 18S · E 522 180 · N 8 917 984 · -9.788330, -74.797749");
    expect(t).toContain("-9.788330, -74.797749");
    expect(t.split("\n")).toHaveLength(3);
    expect(textoDeRuta(rutas[0], true).split("\n")).toHaveLength(6);
  });

  it("el texto de un punto", () => {
    expect(puntos[0].clave).toBe(claveDePunto("prop-acopio-1"));
    expect(textoDePunto(puntos[0])).toBe("Patio de acopio (propuesta) (Punto de acopio): 18S · E 522 180 · N 8 917 984 · -9.788330, -74.797749");
  });

  it("largo en metros enteros con separador de miles", () => {
    expect(textoLargo(1234.4)).toBe("1,234 m");
  });

  it("Excel: una hoja por ruta, una por vértice, una por punto", () => {
    const [r, v, p] = hojasDeRutas(rutas, puntos);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]).toMatchObject({ Ruta: "Trocha 1 (propuesta)", Vértices: 3, Zona: "18S" });
    expect(v.filas).toHaveLength(3);
    expect(p.filas[0]).toMatchObject({ Punto: "Patio de acopio (propuesta)", Latitud: -9.7883297 });
  });

  it("GeoJSON en [lng, lat]: una línea y un punto", () => {
    const g = geoJsonDeRutas(rutas, puntos);
    expect(g.features.map((f) => f.geometry.type)).toEqual(["LineString", "Point"]);
    expect(g.features[1].geometry.coordinates).toEqual([-74.7977489, -9.7883297]);
  });

  it("KML: color del tipo en aabbggrr y nombres escapados", () => {
    const k = kmlDeRutas(filasDeRutas([{ ...TROCHA_BLAS, nombre: "Trocha <1> & río" }]), puntos);
    expect(k).toContain("<color>ff0953b4</color>"); // #b45309
    expect(k).toContain("Trocha &lt;1&gt; &amp; río");
    expect(k).toContain("<LineString>");
    expect(k).toContain("-74.7977489,-9.7883297,0");
  });
});
