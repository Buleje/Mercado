/**
 * Geografía del predio (29-09-2026): el recuadro de trabajo, el lector de
 * Overpass (con la respuesta REAL de la zona de Blas guardada en fixtures) y
 * la grilla de altitud.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { LatLng } from "@/lib/forestal/loth-geo";
import { emptyCartografia } from "@/lib/forestal/loth-cartografia";
import {
  armarGrilla,
  consultaOverpass,
  dimensionGrilla,
  elevacionEn,
  etiquetaLinea,
  ladosM,
  lineasDeCartografia,
  normalizarGeografia,
  parsearOverpass,
  puntosDeGrilla,
  recortarLinea,
  recuadroDeTrabajo,
  simplificarLinea,
  type Bbox,
} from "@/lib/forestal/loth-geografia";

const FX = path.join(__dirname, "fixtures");
const blas = JSON.parse(readFileSync(path.join(FX, "loth-blas-arboles-2026-09-29.json"), "utf8")) as {
  parcela: LatLng[];
  arboles: { lat: number; lng: number }[];
};
const arbolesBlas = blas.arboles.map((a) => [a.lat, a.lng] as LatLng);
const overpassBlas = readFileSync(path.join(FX, "overpass-blas-2026-09-29.json"), "utf8");

const dentro = (p: LatLng, b: Bbox, eps = 1e-9) => p[0] >= b.sur - eps && p[0] <= b.norte + eps && p[1] >= b.oeste - eps && p[1] <= b.este + eps;

describe("recuadroDeTrabajo", () => {
  it("Blas: la parcela dibujada está a ~31 km de los árboles → manda la zona de los árboles y lo dice", () => {
    const r = recuadroDeTrabajo({ contorno: blas.parcela, contornoEs: "parcela", arboles: arbolesBlas });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.base).toBe("arboles");
    expect(r.avisos[0]).toMatch(/^Los árboles del censo están a 31\.\d km del área dibujada/);
    expect(arbolesBlas.every((p) => dentro(p, r.bbox))).toBe(true);
    const { anchoM, altoM } = ladosM(r.bbox);
    // 1,3 km de árboles + 500 m de margen a cada lado.
    expect(anchoM).toBeGreaterThan(1_500);
    expect(altoM).toBeLessThan(2_500);
  });

  it("sólo el contorno (sin árboles ubicados) → el contorno con margen", () => {
    const r = recuadroDeTrabajo({ contorno: blas.parcela, contornoEs: "parcela", arboles: [] });
    expect(r.ok && r.base).toBe("parcela");
    if (r.ok) expect(blas.parcela.every((p) => dentro(p, r.bbox))).toBe(true);
  });

  it("árboles dentro del contorno → base del contorno, sin aviso", () => {
    const r = recuadroDeTrabajo({ contorno: blas.parcela, contornoEs: "predio", arboles: [[-9.85, -75.08]] });
    expect(r.ok && r.base).toBe("predio");
    expect(r.ok && r.avisos).toEqual([]);
  });

  it("nada → no se puede, con el motivo", () => {
    const r = recuadroDeTrabajo({ contorno: [], arboles: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/dibuja el área/);
  });

  it("un contorno de 30 km → demasiado grande, con las medidas", () => {
    const r = recuadroDeTrabajo({ contorno: [[-9.8, -75.0], [-9.8, -74.73], [-9.55, -74.73]], arboles: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/demasiado grande \(\d+\.\d × \d+\.\d km\): el tope es 15 km/);
  });
});

describe("Overpass", () => {
  const b: Bbox = { sur: -9.7993, oeste: -74.8052, norte: -9.7815, este: -74.7877 };

  it("la consulta pide cauces y caminos del recuadro, en orden sur,oeste,norte,este", () => {
    const q = consultaOverpass(b);
    expect(q).toContain('way["waterway"~"^(river|stream|canal|ditch)$"](-9.799300,-74.805200,-9.781500,-74.787700)');
    expect(q).toContain('way["highway"]');
    expect(q).toContain("out tags geom;");
  });

  it("respuesta real de Blas: el río de 826 vértices y el camino quedan recortados al recuadro y simplificados", () => {
    const crudo = JSON.parse(overpassBlas) as { elements: { geometry: unknown[] }[] };
    const r = parsearOverpass(overpassBlas, b);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.rios.length).toBeGreaterThan(0);
    expect(r.rios.every((l) => l.tipo === "river" && l.origen === "osm")).toBe(true);
    expect(r.caminos).toHaveLength(1);
    expect(r.caminos[0]).toMatchObject({ tipo: "unclassified", vehicular: true, nombre: "" });
    const todos = [...r.rios, ...r.caminos].flatMap((l) => l.puntos);
    expect(todos.every((p) => dentro(p, b, 1e-7))).toBe(true);
    const vertices = todos.length;
    const originales = crudo.elements.reduce((s, e) => s + e.geometry.length, 0);
    expect(originales).toBe(1_171);
    expect(vertices).toBeLessThan(60);
  });

  it("HTML de «too busy», JSON con error o basura → null (no «no hay ríos»)", () => {
    const html = '<?xml version="1.0"?><html><body><p>The server is probably too busy to handle your request.</p></body></html>';
    expect(parsearOverpass(html, b)).toBeNull();
    expect(parsearOverpass(JSON.stringify({ elements: [], remark: "runtime error: Query timed out in \"query\" at line 1 after 26 seconds." }), b)).toBeNull();
    expect(parsearOverpass("", b)).toBeNull();
    expect(parsearOverpass(JSON.stringify({ version: 0.6 }), b)).toBeNull();
  });

  it("una respuesta buena sin nada → listas vacías (esa zona no tiene nada cargado)", () => {
    expect(parsearOverpass(JSON.stringify({ elements: [] }), b)).toEqual({ rios: [], caminos: [] });
  });

  it("una senda peatonal viene marcada como no vehicular", () => {
    const r = parsearOverpass(
      JSON.stringify({ elements: [{ type: "way", tags: { highway: "path", name: "Camino a la chacra" }, geometry: [{ lat: -9.79, lon: -74.80 }, { lat: -9.785, lon: -74.79 }] }] }),
      b,
    );
    expect(r?.caminos[0]).toMatchObject({ vehicular: false, nombre: "Camino a la chacra" });
  });
});

describe("geometría de las líneas", () => {
  const b: Bbox = { sur: 0, oeste: 0, norte: 1, este: 1 };

  it("una línea que sale y vuelve a entrar al recuadro da dos pedazos, cortados en el borde", () => {
    const piezas = recortarLinea([[0.5, -0.5], [0.5, 0.5], [0.5, 1.5], [0.2, 1.5], [0.2, 0.5]], b);
    expect(piezas).toHaveLength(2);
    expect(piezas[0][0]).toEqual([0.5, 0]);
    expect(piezas[0].at(-1)).toEqual([0.5, 1]);
    expect(piezas[1][0]).toEqual([0.2, 1]);
    expect(piezas[1].at(-1)).toEqual([0.2, 0.5]);
  });

  it("una línea que no toca el recuadro no deja nada", () => {
    expect(recortarLinea([[2, 2], [3, 3]], b)).toEqual([]);
  });

  it("simplificar saca los vértices alineados y deja los quiebres", () => {
    const recta: LatLng[] = Array.from({ length: 11 }, (_, i) => [-9.8, -74.8 + i * 0.0001]);
    expect(simplificarLinea(recta)).toHaveLength(2);
    const quiebre: LatLng[] = [[-9.8, -74.8], [-9.8, -74.799], [-9.799, -74.799]];
    expect(simplificarLinea(quiebre)).toHaveLength(3);
  });

  it("nombres: el tipo sin nombre, y el nombre sin repetir el tipo", () => {
    expect(etiquetaLinea({ nombre: "", tipo: "stream" })).toBe("Quebrada");
    expect(etiquetaLinea({ nombre: "Shimbillo", tipo: "stream" })).toBe("Quebrada Shimbillo");
    expect(etiquetaLinea({ nombre: "Río Pachitea", tipo: "river" })).toBe("Río Pachitea");
  });
});

describe("grilla de altitud", () => {
  it("~100 m por celda, entre 5 y 25 nodos por lado", () => {
    const chico: Bbox = { sur: -9.8, oeste: -74.8, norte: -9.799, este: -74.799 };
    expect(dimensionGrilla(chico)).toEqual({ nx: 5, ny: 5 });
    const blasB: Bbox = { sur: -9.79924, oeste: -74.80518, norte: -9.78155, este: -74.78779 };
    expect(dimensionGrilla(blasB)).toEqual({ nx: 21, ny: 21 });
    const grande: Bbox = { sur: -9.9, oeste: -74.9, norte: -9.8, este: -74.8 };
    expect(dimensionGrilla(grande)).toEqual({ nx: 25, ny: 25 });
  });

  it("los puntos van fila por fila desde el SUR, y la interpolación reproduce un plano inclinado", () => {
    const b: Bbox = { sur: -9.8, oeste: -74.8, norte: -9.79, este: -74.79 };
    const pts = puntosDeGrilla(b, 3, 3);
    expect(pts[0]).toEqual([b.sur, b.oeste]);
    expect(pts[2]).toEqual([b.sur, b.este]);
    expect(pts[8]).toEqual([b.norte, b.este]);
    // z = 100 + 1000·(lat − sur) + 2000·(lng − oeste): en los nodos da cifras
    // redondas (la grilla guarda al decímetro) y bilineal reproduce el plano.
    const z = (p: LatLng) => 100 + 1_000 * (p[0] - b.sur) + 2_000 * (p[1] - b.oeste);
    const g = armarGrilla(b, 3, 3, pts.map(z));
    expect(g).not.toBeNull();
    if (!g) return;
    const p: LatLng = [-9.7937, -74.7961];
    expect(elevacionEn(g, p) as number).toBeCloseTo(z(p), 6);
    expect(elevacionEn(g, [-9.81, -74.795])).toBeNull();
  });

  it("una esquina sin dato → sin altitud ahí (no se inventa)", () => {
    const b: Bbox = { sur: 0, oeste: 0, norte: 1, este: 1 };
    const g = armarGrilla(b, 3, 3, [1, 2, 3, 4, 5, null, 7, 8, 9]);
    expect(g).not.toBeNull();
    expect(g && elevacionEn(g, [0.25, 0.75])).toBeNull();
    expect(g && elevacionEn(g, [0.25, 0.25])).toBeCloseTo(3, 6);
  });

  it("si faltan casi todos los datos, no hay grilla", () => {
    expect(armarGrilla({ sur: 0, oeste: 0, norte: 1, este: 1 }, 2, 2, [1, null, null, null])).toBeNull();
    expect(armarGrilla({ sur: 0, oeste: 0, norte: 1, este: 1 }, 2, 2, [1, 2, 3])).toBeNull();
  });
});

describe("lo guardado y lo dibujado", () => {
  it("la caché ida y vuelta conserva todo; una rota da null", () => {
    const b: Bbox = { sur: -9.8, oeste: -74.8, norte: -9.79, este: -74.79 };
    const geo = {
      bbox: b,
      base: "arboles",
      rios: [{ nombre: "", tipo: "river", puntos: [[-9.795, -74.8], [-9.795, -74.79]], origen: "osm" }],
      caminos: [{ nombre: "", tipo: "track", puntos: [[-9.8, -74.795], [-9.79, -74.795]], origen: "osm", vehicular: true }],
      elevacion: { nx: 2, ny: 2, bbox: b, valores: [300, 310, 320, 330] },
      fuentes: { osm: "2026-09-29T14:00:00.000Z", elevacion: "2026-09-29T14:00:01.000Z" },
    };
    const n = normalizarGeografia(JSON.parse(JSON.stringify(geo)));
    expect(n).toMatchObject({ ...geo, avisos: [] });
    expect(normalizarGeografia({ bbox: { sur: 1, oeste: 0, norte: 0, este: 1 } })).toBeNull();
    expect(normalizarGeografia(null)).toBeNull();
  });

  it("de la cartografía: los ríos y accesos dibujados cuentan; las trochas y lo propuesto antes, no", () => {
    const c = {
      ...emptyCartografia(),
      vias: [
        { id: "via-1", nombre: "Quebrada Honda", tipo: "rio" as const, puntos: [[-9.8, -74.8], [-9.79, -74.8]] as LatLng[] },
        { id: "via-2", nombre: "Carretera", tipo: "acceso" as const, puntos: [[-9.8, -74.79], [-9.79, -74.79]] as LatLng[] },
        { id: "via-3", nombre: "Trocha vieja", tipo: "trocha" as const, puntos: [[-9.8, -74.795], [-9.79, -74.795]] as LatLng[] },
        { id: "prop-acceso-1", nombre: "Camino de salida (propuesta)", tipo: "acceso" as const, puntos: [[-9.8, -74.798], [-9.79, -74.798]] as LatLng[] },
      ],
    };
    const r = lineasDeCartografia(c);
    expect(r.rios.map((l) => l.nombre)).toEqual(["Quebrada Honda"]);
    expect(r.caminos.map((l) => l.nombre)).toEqual(["Carretera"]);
    expect(r.caminos[0]).toMatchObject({ origen: "dibujo", vehicular: true });
  });
});
