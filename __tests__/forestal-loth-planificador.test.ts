/**
 * Planificador de extracción del Libro TH (29-09-2026): patio, campamento,
 * trochas, camino de salida y orden de tala según la geografía.
 *
 * Dos clases de casos:
 *   · con la geometría REAL de Blas (61 árboles en pie del censo, su parcela
 *     dibujada, el río y el camino que devolvió OpenStreetMap y el relieve de
 *     Open-Meteo, todo leído el 29-09 y guardado en `__tests__/fixtures/`);
 *   · con terreno sintético, para aislar cada regla: faja, cruce de río,
 *     ladera, falta de datos, árbol fuera del predio, lista vacía, tope.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { LatLng } from "@/lib/forestal/loth-geo";
import { pointInPolygon } from "@/lib/forestal/loth-geo";
import { distanceM } from "@/lib/forestal/loth-utm";
import { distanciaATraza } from "@/lib/forestal/loth-faja";
import { emptyCartografia, normalizeCartografia, type LothCartografia } from "@/lib/forestal/loth-cartografia";
import { parsearOverpass, recuadroDeTrabajo, type GrillaElevacion, type LineaGeo } from "@/lib/forestal/loth-geografia";
import { aXY, crearPlano, IndiceSegmentos } from "@/lib/forestal/loth-planificador-terreno";
import {
  MAX_ARBOLES_PLAN,
  mezclarPropuestaEnCartografia,
  planificarExtraccion,
  propuestaAVias,
  type ArbolAExtraer,
  type EntradaPlan,
  type PropuestaPlan,
} from "@/lib/forestal/loth-planificador";

// ─── Terreno sintético en metros alrededor de un origen de la selva ──────────

const LAT0 = -9.8;
const LNG0 = -74.8;
const MX = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const ll = (x: number, y: number): LatLng => [LAT0 + y / 111_132, LNG0 + x / MX];
const cuadrado = (m: number): LatLng[] => [ll(-m, -m), ll(m, -m), ll(m, m), ll(-m, m)];
const xDe = (p: { lng: number } | LatLng) => (((Array.isArray(p) ? p[1] : p.lng) as number) - LNG0) * MX;

let serie = 0;
const arbol = (x: number, y: number, m3: number | null = 5, codigo?: string): ArbolAExtraer => {
  serie++;
  const [lat, lng] = ll(x, y);
  return { id: `a-${codigo ?? serie}`, codigo: codigo ?? String(serie), lat, lng, m3, etapa: "en_pie" };
};
/** Un racimo de `n` árboles en círculo alrededor de (cx, cy). */
const racimo = (cx: number, cy: number, n: number, r: number, pref: string): ArbolAExtraer[] =>
  Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    const rr = r * (0.4 + 0.6 * ((i * 7) % 5) / 4);
    return arbol(cx + rr * Math.cos(t), cy + rr * Math.sin(t), 3 + (i % 4), `${pref}${i + 1}`);
  });
const linea = (tipo: string, puntos: LatLng[], nombre = "", vehicular?: boolean): LineaGeo => ({ nombre, tipo, puntos, origen: "osm", ...(vehicular != null ? { vehicular } : {}) });

/** Grilla 31×31 sobre ±1 500 m con altitud z(x, y). */
function grilla(z: (x: number, y: number) => number, lado = 1_500, n = 31): GrillaElevacion {
  const [sur, oeste] = ll(-lado, -lado);
  const [norte, este] = ll(lado, lado);
  const valores: number[] = [];
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) valores.push(z(-lado + (2 * lado * c) / (n - 1), -lado + (2 * lado * f) / (n - 1)));
  }
  return { nx: n, ny: n, bbox: { sur, oeste, norte, este }, valores };
}
const plano = grilla(() => 250);
const base = (extra: Partial<EntradaPlan>): EntradaPlan => ({ arboles: [], predio: cuadrado(1_000), rios: [], caminos: [], elevacion: plano, ...extra });

/** Nadie se arrastra sobre un árbol ya tumbado: cada árbol va DESPUÉS de todos los que salen por él. */
function ordenRespetaLaRed(p: PropuestaPlan): boolean {
  const pos = new Map(p.ordenTala.map((o) => [o.id, o.orden]));
  return p.trochas.tramos.every((t) => t.desde === "patio" || (pos.get(t.hasta) as number) < (pos.get(t.desde) as number));
}

// ─── Blas, con sus datos reales ──────────────────────────────────────────────

const FX = path.join(__dirname, "fixtures");
const blas = JSON.parse(readFileSync(path.join(FX, "loth-blas-arboles-2026-09-29.json"), "utf8")) as {
  parcela: LatLng[];
  arboles: { codigo: string; especie: string; m3: number; lat: number; lng: number }[];
};
const relieveBlas = JSON.parse(readFileSync(path.join(FX, "loth-blas-relieve-2026-09-29.json"), "utf8")) as GrillaElevacion;
const arbolesBlas: ArbolAExtraer[] = blas.arboles.map((a) => ({ id: `blas-${a.codigo}`, codigo: a.codigo, lat: a.lat, lng: a.lng, m3: a.m3, etapa: "en_pie", especie: a.especie }));

function entradaBlas(): EntradaPlan {
  const rec = recuadroDeTrabajo({ contorno: blas.parcela, contornoEs: "parcela", arboles: arbolesBlas.map((a) => [a.lat, a.lng]) });
  if (!rec.ok) throw new Error(rec.motivo);
  const osm = parsearOverpass(readFileSync(path.join(FX, "overpass-blas-2026-09-29.json"), "utf8"), rec.bbox);
  if (!osm) throw new Error("fixture de Overpass ilegible");
  return { arboles: arbolesBlas, predio: blas.parcela, rios: osm.rios, caminos: osm.caminos, elevacion: relieveBlas, bbox: rec.bbox };
}

describe("planificador — Blas, geometría real (61 árboles en pie)", () => {
  const p = planificarExtraccion(entradaBlas());

  it("planifica los 61 árboles y 529,414 m³, y dice que ninguno cae en la parcela dibujada", () => {
    expect(p.vacia).toBe(false);
    expect(p.resumen).toMatchObject({ arboles: 61, m3: 529.414, fueraDelPredio: 61, dentroDelPredio: 0 });
    expect(p.avisos.some((a) => a.startsWith("Los 61 árboles caen fuera del área dibujada") && a.includes("el patio se buscó junto a los árboles"))).toBe(true);
  });

  it("el patio queda junto a los árboles (no en la parcela a 31 km), casi plano y a menos de 1 km del camino", () => {
    const [patio] = p.patios;
    expect(pointInPolygon([patio.lat, patio.lng], blas.parcela)).toBe(false);
    const cerca = Math.min(...arbolesBlas.map((a) => distanceM([patio.lat, patio.lng], [a.lat, a.lng])));
    expect(cerca).toBeLessThan(400);
    expect(patio.pendientePct).not.toBeNull();
    expect(patio.pendientePct as number).toBeLessThanOrEqual(12);
    expect(patio.distanciaCaminoM as number).toBeLessThan(1_000);
    expect(patio.porQue).toMatch(/en promedio de la madera/);
  });

  it("tres patios alternativos, separados al menos 200 m y del más barato al más caro", () => {
    expect(p.patios).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) expect(distanceM([p.patios[i].lat, p.patios[i].lng], [p.patios[j].lat, p.patios[j].lng])).toBeGreaterThanOrEqual(200);
    }
    expect(p.patios[0].puntaje).toBeLessThanOrEqual(p.patios[1].puntaje);
    expect(p.patios[1].puntaje).toBeLessThanOrEqual(p.patios[2].puntaje);
  });

  it("la red llega a los 61 árboles, cada uno una vez, y el orden de tala nunca arrastra sobre lo tumbado", () => {
    expect(p.trochas.tramos).toHaveLength(61);
    expect(new Set(p.ordenTala.map((o) => o.id)).size).toBe(61);
    expect(ordenRespetaLaRed(p)).toBe(true);
    expect(p.ordenTala[0].distanciaRedM).toBe(p.trochas.distanciaMaxArrastreM);
    // El río de OSM pasa a más de 1 km: la red no lo cruza.
    expect(p.trochas.cruces).toBe(0);
    expect(p.trochas.largoTotalM).toBeGreaterThan(1_000);
    expect(p.trochas.distanciaMediaArrastreM).toBeGreaterThan(0);
  });

  it("el camino de salida termina SOBRE el camino de OpenStreetMap", () => {
    const c = p.caminoSalida;
    expect(c).not.toBeNull();
    const osm = entradaBlas().caminos[0].puntos;
    const fin = (c as NonNullable<typeof c>).puntos.at(-1) as LatLng;
    expect(distanciaATraza(fin, osm)).toBeLessThan(1);
    expect((c as NonNullable<typeof c>).largoM).toBeGreaterThan(0);
  });

  it("las zonas no aptas son celdas de más de 30 % de pendiente", () => {
    expect(p.zonasNoAptas.length).toBeGreaterThan(0);
    expect(p.zonasNoAptas.every((z) => z.pendientePct > 30)).toBe(true);
  });

  it("61 árboles en menos de 50 ms (el mejor de 3, ya caliente)", () => {
    const e = entradaBlas();
    const tiempos: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      planificarExtraccion(e);
      tiempos.push(performance.now() - t0);
    }
    expect(Math.min(...tiempos)).toBeLessThan(50);
  });

  // Review 29-09: `patioLat/patioLng` sólo se validan contra el rango del
  // planeta y un árbol con la UTM errada entra igual; el índice de agua
  // recorría cada celda de 100 m de la caja de cada tramo: 100 km = 5 s,
  // 300 km ≈ 45 s con el hilo del servidor tomado. Ahora cuesta lo mismo que cerca.
  // Review 29-09: con coordenadas reales, 49 de 2 000 tramos que pasaban justo
  // por un vértice del río no contaban el cruce (el redondeo dejaba u fuera
  // de [0, 1] en los dos tramos del río).
  it("un tramo que pasa justo por un vértice del río cuenta UN cruce", () => {
    let s = 7;
    const azar = () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const conteos = new Set<number>();
    for (let k = 0; k < 2_000; k++) {
      const pl = crearPlano(-9.8 + azar() * 0.05, -74.8 + azar() * 0.05);
      const v: LatLng = [pl.lat0 + azar() * 0.01, pl.lng0 + azar() * 0.01];
      const [ax, ay] = aXY(pl, [v[0] - 0.003, v[1] - 0.002 - azar() * 0.002]);
      const [vx, vy] = aXY(pl, v);
      const [bx, by] = aXY(pl, [v[0] + 0.003, v[1] - 0.002 - azar() * 0.002]);
      const idx = new IndiceSegmentos(100);
      idx.agregar({ ax, ay, bx: vx, by: vy, linea: 0 });
      idx.agregar({ ax: vx, ay: vy, bx, by, linea: 0 });
      const d = 0.001 + azar() * 0.003;
      const [px, py] = aXY(pl, [v[0] - d * 0.3, v[1] - d]);
      conteos.add(idx.cruces(px, py, 2 * vx - px, 2 * vy - py));
    }
    expect([...conteos]).toEqual([1]);
  });

  it("un patio fijado a 300 km (o un árbol con la UTM errada) no cuelga el cálculo", () => {
    const e = entradaBlas();
    const [la, ln] = [e.arboles[0].lat, e.arboles[0].lng];
    const d = 300 / 111;
    const t0 = performance.now();
    const p = planificarExtraccion({ ...e, patioFijo: [la - d, ln - d] });
    const q = planificarExtraccion({ ...e, arboles: [...e.arboles, { id: "lejos", codigo: "LEJOS", lat: la - d, lng: ln - d, m3: 3, etapa: "en_pie" }] });
    expect(performance.now() - t0).toBeLessThan(3_000);
    expect(p.patios[0].fijadoPorUsuario).toBe(true);
    expect(p.avisos.some((a) => a.startsWith("El patio que fijaste"))).toBe(true);
    expect(q.ordenTala).toHaveLength(62);
  });

  it("la propuesta entra a la cartografía: 2 referencias y las trochas dentro del tope de 40 vías", () => {
    const m = mezclarPropuestaEnCartografia(emptyCartografia(), p);
    expect(m.agregadas.referencias).toBe(2);
    expect(m.agregadas.vias).toBeGreaterThan(1);
    expect(m.cartografia.vias.length).toBeLessThanOrEqual(40);
    // Lo que se manda al PUT sobrevive al normalizador sin perder nada.
    const n = normalizeCartografia(m.cartografia);
    expect(n.vias.map((v) => v.id)).toEqual(m.cartografia.vias.map((v) => v.id));
    expect(n.referencias.map((r) => r.tipo)).toEqual(["acopio", "campamento"]);
  });
});

// ─── Reglas, con terreno sintético ───────────────────────────────────────────

describe("planificador — reglas", () => {
  it("el patio queda dentro del predio y fuera de la faja del río que pasa por el medio", () => {
    const rio = linea("river", [ll(0, -1_200), ll(0, 1_200)], "Aguaytía");
    const arboles = [...racimo(-180, 0, 8, 120, "O"), ...racimo(180, 0, 8, 120, "E")];
    const p = planificarExtraccion(base({ arboles, rios: [rio] }));
    const [patio] = p.patios;
    expect(pointInPolygon([patio.lat, patio.lng], cuadrado(1_000))).toBe(true);
    expect(distanciaATraza([patio.lat, patio.lng], rio.puntos)).toBeGreaterThan(50);
    expect(patio.porQue).toMatch(/descartaron .* por la faja marginal/);
  });

  it("un río entre dos grupos de árboles: la red lo cruza UNA vez y ese tramo queda marcado", () => {
    const rio = linea("stream", [ll(0, -1_200), ll(0, 1_200)], "Shimbillo");
    const arboles = [...racimo(-450, 0, 10, 100, "O"), ...racimo(450, 0, 10, 100, "E")];
    const p = planificarExtraccion(base({ arboles, rios: [rio] }));
    expect(p.trochas.cruces).toBe(1);
    const cruzan = p.trochas.tramos.filter((t) => t.cruces > 0);
    expect(cruzan).toHaveLength(1);
    expect(cruzan[0].clase).toBe("principal");
    expect(p.trochas.porQue).toMatch(/1 cruce de río o quebrada/);
  });

  it("dos grupos al otro lado del agua: se cruza una vez y el segundo grupo se une por lo seco", () => {
    // Cruzar de nuevo acortaría el arrastre del grupo sur (424 m contra 1 km):
    // aun así, una sola trocha cruza la quebrada.
    const rio = linea("stream", [ll(40, -1_200), ll(40, 1_200)]);
    const arboles = [...racimo(-150, 0, 8, 60, "O"), ...racimo(150, 300, 4, 40, "N"), ...racimo(150, -300, 4, 40, "S")];
    const p = planificarExtraccion(base({ arboles, rios: [rio], patioFijo: ll(-150, 0) }));
    expect(p.trochas.cruces).toBe(1);
  });

  it("si la vuelta por lo seco es enorme, se cruza en vez de rodear", () => {
    // La quebrada termina en y = 900; el único camino seco al este pasa por un
    // árbol al norte de la punta: casi 4 km de vuelta contra 200 m y un cruce.
    const rio = linea("stream", [ll(0, -1_400), ll(0, 900)]);
    const arboles = [...racimo(-120, -800, 6, 40, "O"), arbol(0, 1_000, 3, "PUNTA"), ...racimo(120, -800, 6, 40, "E")];
    const p = planificarExtraccion(base({ arboles, rios: [rio], patioFijo: ll(-120, -800), predio: cuadrado(1_400) }));
    const alEste = p.trochas.tramos.filter((t) => t.hasta.startsWith("a-E"));
    expect(alEste.some((t) => t.cruces === 1 && t.desde.startsWith("a-O"))).toBe(true);
    expect(p.trochas.cruces).toBe(1);
  });

  it("una ladera de 40 %: el patio se va al plano, los tramos en la ladera se marcan y la ladera sale como no apta", () => {
    // Oeste plano; al este de x = 0 sube 40 m cada 100 m.
    const ladera = grilla((x) => (x < 0 ? 250 : 250 + 0.4 * x));
    // La madera gruesa está en la ladera: sin el tope de pendiente, el patio iría ahí.
    const arboles = [...racimo(-400, 0, 10, 250, "P"), arbol(250, 0, 40, "L1"), arbol(450, 0, 40, "L2"), arbol(650, 0, 40, "L3")];
    const p = planificarExtraccion(base({ arboles, elevacion: ladera }));
    const [patio] = p.patios;
    expect(xDe(patio)).toBeLessThan(0);
    expect(patio.pendientePct as number).toBeLessThanOrEqual(12);
    expect(p.trochas.tramosEmpinados).toBeGreaterThan(0);
    expect(p.trochas.tramos.filter((t) => t.empinado).every((t) => (t.pendienteMaxPct as number) > 30)).toBe(true);
    expect(p.avisos.some((a) => /pasan? el 30 % de pendiente/.test(a))).toBe(true);
    expect(p.zonasNoAptas.length).toBeGreaterThan(0);
    // Todas las celdas no aptas quedan en la ladera (este de x = 0, con el borde de una celda de 100 m).
    expect(p.zonasNoAptas.every((z) => xDe([0, z.este]) > 0)).toBe(true);
  });

  it("sin ríos, sin caminos y sin relieve: propone igual y lo dice, sin errores", () => {
    const p = planificarExtraccion(base({ arboles: racimo(0, 0, 12, 300, "S"), elevacion: null }));
    expect(p.vacia).toBe(false);
    expect(p.caminoSalida).toBeNull();
    expect(p.campamento).not.toBeNull();
    expect(p.campamento?.agua).toBeNull();
    expect(p.campamento?.porQue).toMatch(/No se conocen ríos ni quebradas/);
    expect(p.avisos.join(" ")).toMatch(/No se conocen ríos ni quebradas/);
    expect(p.avisos.join(" ")).toMatch(/No se conocen caminos/);
    expect(p.avisos.join(" ")).toMatch(/Sin datos de altitud/);
    expect(p.zonasNoAptas).toEqual([]);
  });

  it("un árbol fuera del predio entra al plan y se avisa con su código", () => {
    const arboles = [...racimo(0, 0, 10, 200, "D"), arbol(900, 0, 6, "FUERA-1")];
    const p = planificarExtraccion(base({ arboles, predio: cuadrado(500) }));
    expect(p.resumen.fueraDelPredio).toBe(1);
    expect(p.ordenTala.find((o) => o.codigo === "FUERA-1")?.fueraDelPredio).toBe(true);
    expect(p.avisos.some((a) => a.startsWith("1 de 11 árboles caen fuera") && a.includes("FUERA-1") && a.includes("se incluyen en el plan"))).toBe(true);
    // La mayoría está adentro: el patio sigue dentro del predio.
    expect(pointInPolygon([p.patios[0].lat, p.patios[0].lng], cuadrado(500))).toBe(true);
  });

  it("sin árboles: propuesta vacía con el motivo", () => {
    const p = planificarExtraccion(base({ arboles: [] }));
    expect(p.vacia).toBe(true);
    expect(p.motivo).toMatch(/No hay árboles para sacar/);
    expect(p.patios).toEqual([]);
    expect(p.ordenTala).toEqual([]);
  });

  it("árboles sin coordenadas: vacía con otro motivo", () => {
    const p = planificarExtraccion(base({ arboles: [{ id: "x", codigo: "X", lat: 0, lng: 0, m3: 3 }] }));
    expect(p.vacia).toBe(true);
    expect(p.motivo).toMatch(/Ningún árbol del censo tiene coordenadas/);
  });

  it("el camino de salida sale del predio hasta la vía existente y termina sobre ella", () => {
    const via = linea("track", [ll(1_300, -1_400), ll(1_300, 1_400)], "", true);
    const p = planificarExtraccion(base({ arboles: racimo(0, 0, 10, 250, "C"), caminos: [via] }));
    const c = p.caminoSalida;
    expect(c).not.toBeNull();
    const fin = (c as NonNullable<typeof c>).puntos.at(-1) as LatLng;
    expect(Math.abs(xDe(fin) - 1_300)).toBeLessThan(2);
    // Plano y sin agua: el camino es casi la recta del patio a la vía.
    expect(c?.largoM as number).toBeGreaterThan(1_300 - xDe(p.patios[0]) - 30);
    expect(c?.largoM as number).toBeLessThan((1_300 - xDe(p.patios[0])) * 1.1 + 30);
    expect(c?.destino).toBe("Trocha carrozable");
    expect(c?.porQue).toMatch(/al este hasta la vía más cercana \(trocha carrozable\)/);
    expect(c?.porQue).toMatch(/sin cruzar agua/);
  });

  it("poca madera lleva el patio al camino; mucha lo mete en el monte (abrir camino vs. arrastrar)", () => {
    const via = linea("track", [ll(950, -1_400), ll(950, 1_400)], "", true);
    const conM3 = (m3: number) => racimo(0, 0, 10, 250, `V${m3}-`).map((a) => ({ ...a, m3 }));
    const chico = planificarExtraccion(base({ arboles: conM3(4), caminos: [via] })); // 40 m³ < 400
    const grande = planificarExtraccion(base({ arboles: conM3(200), caminos: [via] })); // 2 000 m³ > 400
    expect(xDe(chico.patios[0])).toBeGreaterThan(850);
    expect(xDe(grande.patios[0])).toBeLessThan(300);
    expect(grande.caminoSalida?.largoM as number).toBeGreaterThan(chico.caminoSalida?.largoM as number);
  });

  it("una senda peatonal no cuenta como camino para el camión", () => {
    const senda = linea("path", [ll(300, -1_400), ll(300, 1_400)], "", false);
    const p = planificarExtraccion(base({ arboles: racimo(0, 0, 6, 150, "N"), caminos: [senda] }));
    expect(p.caminoSalida).toBeNull();
    expect(p.avisos.join(" ")).toMatch(/No se conocen caminos/);
  });

  it("el campamento va cerca del agua pero fuera de la faja, y cerca del patio", () => {
    const rio = linea("river", [ll(-320, -1_200), ll(-320, 1_200)]);
    const p = planificarExtraccion(base({ arboles: racimo(0, 0, 10, 150, "K"), rios: [rio] }));
    const c = p.campamento;
    expect(c?.agua).not.toBeNull();
    expect(c?.agua?.distanciaM as number).toBeGreaterThanOrEqual(60);
    expect(c?.agua?.distanciaM as number).toBeLessThanOrEqual(400);
    expect(c?.distanciaPatioM as number).toBeGreaterThanOrEqual(50);
    expect(c?.distanciaPatioM as number).toBeLessThanOrEqual(500);
    expect(c?.porQue).toMatch(/fuera de su faja de 50 m/);
  });

  it("el árbol dentro de la faja se marca y se avisa (no se borra del plan)", () => {
    const rio = linea("stream", [ll(0, -1_200), ll(0, 1_200)]);
    const arboles = [...racimo(-300, 0, 6, 100, "M"), arbol(12, 50, 4, "ORILLA")];
    const p = planificarExtraccion(base({ arboles, rios: [rio] }));
    expect(p.resumen.enFaja).toBe(1);
    expect(p.ordenTala.find((o) => o.codigo === "ORILLA")?.enFaja).toBe(true);
    expect(p.avisos.some((a) => a.includes("faja marginal") && a.includes("ORILLA"))).toBe(true);
  });

  it("el patio que fijó el usuario se respeta, y si cae en la faja se le dice", () => {
    const rio = linea("river", [ll(0, -1_200), ll(0, 1_200)]);
    const fijo = ll(20, 0);
    const p = planificarExtraccion(base({ arboles: racimo(-200, 0, 6, 100, "F"), rios: [rio], patioFijo: fijo }));
    expect(p.patios).toHaveLength(1);
    expect(p.patios[0].fijadoPorUsuario).toBe(true);
    expect(distanceM([p.patios[0].lat, p.patios[0].lng], fijo)).toBeLessThan(0.01);
    expect(p.avisos.some((a) => a.startsWith("El patio que fijaste cae dentro de la faja marginal"))).toBe(true);
  });

  it("la trocha rodea un semillero que le quedaba en el camino (a menos de 5 m)", () => {
    // Patio fijo en el origen, el árbol A a 300 m al este y un semillero justo en la recta;
    // B queda arriba, a 250 m de los dos. Sin el semillero, A va directo (300 contra 350 por B).
    const A = arbol(300, 0, 5, "SA");
    const B = arbol(150, 200, 5, "SB");
    const patioFijo = ll(0, 0);
    const sin = planificarExtraccion(base({ arboles: [A, B], patioFijo }));
    expect(sin.trochas.tramos.find((t) => t.hasta === A.id)?.desde).toBe("patio");
    const [lat, lng] = ll(150, 1);
    const con = planificarExtraccion(base({ arboles: [A, B], patioFijo, semilleros: [{ codigo: "S19", lat, lng }] }));
    expect(con.trochas.tramos.find((t) => t.hasta === A.id)?.desde).toBe(B.id);
    expect(con.trochas.tramos.every((t) => t.semilleros.length === 0)).toBe(true);
    expect(con.avisos.join(" ")).not.toMatch(/semillero/);
  });

  it("si el único camino pasa junto al semillero, se marca el tramo y se avisa con su código", () => {
    const A = arbol(300, 0, 5, "SA");
    const [lat, lng] = ll(150, 2);
    const p = planificarExtraccion(base({ arboles: [A], patioFijo: ll(0, 0), semilleros: [{ codigo: "S19", lat, lng }] }));
    expect(p.trochas.tramos[0].semilleros).toEqual(["S19"]);
    expect(p.avisos.some((a) => a.startsWith("La trocha pasa a menos de 5 m del semillero S19"))).toBe(true);
  });

  it("patio fijado a mano lejos del agua: se avisa que el campamento queda sin agua", () => {
    const rio = linea("river", [ll(-900, -1_200), ll(-900, 1_200)]);
    const p = planificarExtraccion(base({ arboles: racimo(600, 0, 6, 100, "W"), rios: [rio], patioFijo: ll(600, 0) }));
    expect(p.campamento?.agua).toBeNull();
    expect(p.avisos.some((a) => a.startsWith("Con el patio donde lo pusiste, el campamento queda sin agua a menos de 400 m (la más cercana, a 1.5 km"))).toBe(true);
  });

  it("los talados sólo se arrastran; los en pie se talan y arrastran", () => {
    const arboles = racimo(0, 0, 5, 150, "T");
    arboles[0] = { ...arboles[0], etapa: "talado" };
    const p = planificarExtraccion(base({ arboles }));
    expect(p.ordenTala.find((o) => o.id === arboles[0].id)?.accion).toBe("arrastrar");
    expect(p.ordenTala.filter((o) => o.accion === "talar_y_arrastrar")).toHaveLength(4);
  });

  it("la misma entrada en otro orden da la misma propuesta (ids estables)", () => {
    const arboles = racimo(0, 0, 15, 400, "Z");
    const a = planificarExtraccion(base({ arboles }));
    const b = planificarExtraccion(base({ arboles: [...arboles].reverse() }));
    expect(b.patios).toEqual(a.patios);
    expect(b.trochas.lineas.map((l) => l.id)).toEqual(a.trochas.lineas.map((l) => l.id));
    expect(b.ordenTala).toEqual(a.ordenTala);
  });

  it(`sobre el tope de ${MAX_ARBOLES_PLAN} árboles se planifican los de más volumen y se avisa`, () => {
    let s = 12345;
    const azar = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1;
    const arboles = Array.from({ length: MAX_ARBOLES_PLAN + 100 }, (_, i) => arbol(azar() * 1_400, azar() * 1_400, 1 + (i % 9), `G${i}`));
    const t0 = performance.now();
    const p = planificarExtraccion(base({ arboles, predio: cuadrado(1_500) }));
    const ms = performance.now() - t0;
    expect(p.resumen.arboles).toBe(MAX_ARBOLES_PLAN);
    expect(p.resumen.fueraDelTope).toBe(100);
    expect(p.ordenTala).toHaveLength(MAX_ARBOLES_PLAN);
    expect(p.trochas.tramos).toHaveLength(MAX_ARBOLES_PLAN);
    expect(ordenRespetaLaRed(p)).toBe(true);
    expect(p.avisos.some((a) => a.includes("Se planificaron los 2,000 árboles de más volumen"))).toBe(true);
    expect(ms).toBeLessThan(10_000);
  }, 30_000);
});

// ─── A la cartografía ────────────────────────────────────────────────────────

describe("planificador — mezclar con lo dibujado", () => {
  const p = planificarExtraccion(base({ arboles: racimo(0, 0, 12, 400, "Q"), caminos: [linea("track", [ll(900, -1_400), ll(900, 1_400)], "", true)] }));
  const dibujada: LothCartografia = {
    ...emptyCartografia(),
    referencias: [{ id: "ref-1-caserio", nombre: "Caserío", tipo: "centro_poblado", lat: LAT0, lng: LNG0, nota: "" }],
    vias: [
      { id: "via-1-carretera", nombre: "Carretera", tipo: "acceso", puntos: [ll(-900, 0), ll(-900, 500)] },
      { id: "prop-trocha-9", nombre: "Trocha 9 (propuesta)", tipo: "trocha", puntos: [ll(0, 0), ll(10, 10)] },
    ],
  };

  it("no toca lo dibujado, reemplaza lo propuesto antes y no duplica al aplicar dos veces", () => {
    const una = mezclarPropuestaEnCartografia(dibujada, p);
    expect(una.cartografia.referencias[0].id).toBe("ref-1-caserio");
    expect(una.cartografia.vias[0].id).toBe("via-1-carretera");
    expect(una.cartografia.vias.some((v) => v.id === "prop-trocha-9")).toBe(false);
    expect(una.cartografia.vias.some((v) => v.id === "prop-acceso-1" && v.tipo === "acceso")).toBe(true);
    expect(una.cartografia.vias.filter((v) => v.id.startsWith("prop-")).every((v) => v.nombre.endsWith("(propuesta)"))).toBe(true);
    const dos = mezclarPropuestaEnCartografia(una.cartografia, p);
    expect(dos.cartografia.vias.map((v) => v.id)).toEqual(una.cartografia.vias.map((v) => v.id));
    expect(dos.cartografia.referencias.map((r) => r.id)).toEqual(una.cartografia.referencias.map((r) => r.id));
  });

  it("con la cartografía casi llena, entra lo que cabe y se dice cuánto quedó afuera", () => {
    const llena: LothCartografia = {
      ...emptyCartografia(),
      vias: Array.from({ length: 38 }, (_, i) => ({ id: `via-${i}`, nombre: `Vía ${i}`, tipo: "acceso" as const, puntos: [ll(i, 0), ll(i, 10)] })),
    };
    const m = mezclarPropuestaEnCartografia(llena, p);
    expect(m.cartografia.vias).toHaveLength(40);
    expect(m.agregadas.vias).toBe(2);
    const sinLugar = propuestaAVias(p, { maxVias: 2 }).omitidas.join(" ");
    expect(sinLugar).toMatch(/no entr(ó|aron) al plano/);
  });
});
