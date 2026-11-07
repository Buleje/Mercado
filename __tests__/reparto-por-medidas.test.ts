/**
 * ADR-505 · El reparto respeta las medidas de las trozas (Brandon, 2026-10-20:
 * «que la distribución actúe de acuerdo a Faltante y cierre según cuadran las
 * medidas … que se distribuya de acuerdo a ello»).
 *
 * El caso de Blas con sus tres permisos de Tornillo: PLT-2021-017 sólo tiene
 * trozas cortas (≤ 3,42 m), PLT-2025-096 llega a 9,75 m y PLT-2025-167 a 7,90 m.
 */
import { describe, expect, it } from "vitest";
import { distribuirPorCapacidad, claveOverrideLinea, type BloqueRolliza, type Distribucion } from "@/lib/forestal/cubicacion-reparto";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { cuadrarMedidasDelReparto, type FuentesDeTrozas } from "@/lib/forestal/cuadre-medidas-rolliza";
import { elegibilidad, holguraM, subcapacidadM3, type TrozaMedida } from "@/lib/forestal/medida-cabe-en-troza";
import { compararRepartoPorMedidas } from "@/lib/forestal/reparto-medidas-diff";
import { completarMedidas } from "@/components/admin/forestal/hooks/use-cuadre-medidas";

const SIN_FUENTES: FuentesDeTrozas = { libro: [], lotes: new Map(), cubicador: [] };

function pieza(id: string, cantidad: number, espesor: number, ancho: number, largoPies: number): PiezaCubicada {
  const base = { cantidad, espesor, ancho, largo: largoPies, uEspesor: "pulg" as const, uAncho: "pulg" as const, uLargo: "pies" as const };
  const { pieTablar, m3 } = cubicarPieza(base);
  return { id, ...base, especie: "Tornillo", pieTablar, m3 };
}

const T017: TrozaMedida[] = [
  { largoM: 2.5, d1Cm: 45, d2Cm: 48 },
  { largoM: 3.0, d1Cm: 50, d2Cm: 52 },
  { largoM: 3.42, d1Cm: 40, d2Cm: 44 },
];
const T096: TrozaMedida[] = [
  { largoM: 4.0, d1Cm: 50, d2Cm: 55 },
  { largoM: 6.0, d1Cm: 45, d2Cm: 50 },
  { largoM: 9.75, d1Cm: 42, d2Cm: 46 },
];
const T167: TrozaMedida[] = [
  { largoM: 5.0, d1Cm: 48, d2Cm: 50 },
  { largoM: 7.9, d1Cm: 40, d2Cm: 45 },
];

const bloque = (id: string, permiso: string, m3: number, trozas: TrozaMedida[] | null, extra: Partial<BloqueRolliza> = {}): BloqueRolliza => ({
  id, etiqueta: id, especie: "Tornillo", m3, tipo: "rolliza", origen: "trozas", permiso, aprovechablePct: 50,
  ...(trozas ? { trozasMedidas: trozas } : {}),
  ...extra,
});

const LOTE: PiezaCubicada[] = [
  pieza("p12", 200, 2, 8, 12),
  pieza("p8", 300, 2, 8, 8),
  pieza("p32", 20, 2, 10, 32),
  pieza("p26", 30, 2, 8, 26),
];

const BLOQUES = [bloque("b017", "PLT-2021-017", 20, T017), bloque("b096", "PLT-2025-096", 12, T096), bloque("b167", "PLT-2025-167", 10, T167)];

/** Piezas de una medida (por su largo en pies) que quedaron en cada bloque. */
function piezasPorBloque(d: Distribucion, largoPies: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of d.especies)
    for (const b of e.bloques)
      out[b.bloque.id] = b.asignado.reduce((s, g) => s + g.medidas.filter((m) => m.largo === largoPies).reduce((t, m) => t + m.piezas, 0), 0);
  return out;
}

const totalPiezas = (d: Distribucion) =>
  d.especies.reduce(
    (s, e) => s + e.bloques.reduce((a, b) => a + b.asignado.reduce((x, g) => x + g.piezas, 0), 0) + e.faltante.reduce((a, f) => a + f.piezas, 0),
    0,
  );

describe("regla única: medida-cabe-en-troza", () => {
  it("12 pies no cabe en trozas de ≤ 3,42 m; sí en las de 9,75 m", () => {
    const p = { medida: "2×8×12", espesor: 2, ancho: 8, largo: 12, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", piezas: 1 };
    expect(elegibilidad(p, T017, "PLT-2021-017").cabe).toBe(false);
    expect(elegibilidad(p, T096, "PLT-2025-096")).toEqual({ cabe: true, comprobado: true });
    expect(elegibilidad(p, [], "x")).toEqual({ cabe: true, comprobado: false });
  });

  it("holgura: la troza más justa que la da; subcapacidad: la parte del volumen que la alcanza", () => {
    const p = { medida: "2×10×32", espesor: 2, ancho: 10, largo: 32, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", piezas: 1 };
    expect(holguraM(p, T096)).toBeCloseTo(9.75 - 32 * 0.3048, 4);
    expect(holguraM(p, T167)).toBe(Number.POSITIVE_INFINITY);
    const sub = subcapacidadM3(p, T096, 6);
    expect(sub).toBeGreaterThan(2);
    expect(sub).toBeLessThan(3);
    expect(subcapacidadM3(p, T167, 5)).toBe(0);
  });
});

describe("reparto respetando medidas — Blas, 3 permisos de Tornillo", () => {
  const d = distribuirPorCapacidad(BLOQUES, LOTE, "largo");

  it("12 pies NO sale de PLT-2021-017", () => {
    expect(piezasPorBloque(d, 12).b017).toBe(0);
  });

  it("32 pies sólo de PLT-2025-096 (la única con 9,75 m), topado por la parte de sus trozas que llega", () => {
    const r = piezasPorBloque(d, 32);
    expect(r.b096).toBe(20);
    expect(r.b017 + r.b167).toBe(0);
  });

  it("la troza más justa primero: 26 pies va a PLT-2025-167 (7,90 m), no gasta la de 9,75 m", () => {
    const r = piezasPorBloque(d, 26);
    expect(r.b167).toBe(30);
    expect(r.b096).toBe(0);
  });

  it("¿Cuadran las medidas? = 0 avisos y no se pierde ninguna pieza", () => {
    expect(cuadrarMedidasDelReparto(d, SIN_FUENTES).avisos).toBe(0);
    expect(totalPiezas(d)).toBe(550);
    expect(d.especies[0].medidas?.aplicado).toBe(true);
    expect(d.especies[0].medidas?.exigentes).toBeGreaterThanOrEqual(2);
  });

  it("antes (sin respetar) había avisos; el diff los cuenta por permiso", () => {
    const sin = distribuirPorCapacidad(BLOQUES.map((b) => ({ ...b, ignorarMedidas: true })), LOTE, "largo");
    expect(cuadrarMedidasDelReparto(sin, SIN_FUENTES).avisos).toBeGreaterThan(0);
    const diff = compararRepartoPorMedidas(sin, d, SIN_FUENTES);
    expect(diff.avisosAntes).toBeGreaterThan(0);
    expect(diff.avisosDespues).toBe(0);
    expect(diff.piezasMovidas).toBeGreaterThan(0);
    expect(diff.permisos.map((p) => p.permiso)).toEqual(["PLT-2021-017", "PLT-2025-096", "PLT-2025-167"]);
  });

  it("un bloque sin medidas es el último recurso: recibe lo exigente que sobró, «sin comprobar»", () => {
    const con = distribuirPorCapacidad([...BLOQUES, bloque("bx", "PLT-SIN", 4, null, { origen: "manual" })], LOTE, "largo");
    const bx = con.especies[0].bloques.find((b) => b.bloque.id === "bx")!;
    const doce = bx.asignado.flatMap((g) => g.medidas).filter((m) => m.largo === 12);
    expect(doce.reduce((s, m) => s + m.piezas, 0)).toBeGreaterThan(0);
    expect(doce.every((m) => m.sinComprobar)).toBe(true);
    expect(con.especies[0].medidas?.sinComprobarPiezas).toBeGreaterThan(0);
    /* Antes que el bloque sin medidas, los que sí pueden dar 12 pies se llenan. */
    const b096 = con.especies[0].bloques.find((b) => b.bloque.id === "b096")!;
    expect(b096.libreM3).toBeLessThan(0.04);
  });

  it("lo que ninguna troza da va a «Falta por distribuir» con su porqué (y el cierre con tolerancia no lo mete)", () => {
    const lote = [...LOTE, pieza("p40", 2, 2, 8, 40)];
    const r = distribuirPorCapacidad(BLOQUES.map((b) => ({ ...b, m3: b.m3 * 2 })), lote, "largo");
    const st = r.especies[0].faltante.flatMap((f) => f.sinTroza ?? []);
    expect(st).toHaveLength(1);
    expect(st[0].piezas).toBe(2);
    expect(st[0].motivos).toEqual(["largo"]);
    expect(st[0].texto).toMatch(/ninguna troza de tornillo alcanza 40 pies/i);
    expect(st[0].texto).toMatch(/9[.,]75 m/);
    expect(piezasPorBloque(r, 40)).toEqual({ b017: 0, b096: 0, b167: 0 });
    expect(r.especies[0].medidas?.sinTrozaPiezas).toBe(2);
  });

  it("lo dicho a mano gana: un override de 12 pies en PLT-2021-017 se respeta y queda como aviso", () => {
    const b017 = { ...BLOQUES[0], overridesLinea: { [claveOverrideLinea("largo", "12pies")]: { piezas: 10 } } };
    const r = distribuirPorCapacidad([b017, BLOQUES[1], BLOQUES[2]], LOTE, "largo");
    expect(piezasPorBloque(r, 12).b017).toBe(10);
    const cuadre = cuadrarMedidasDelReparto(r, SIN_FUENTES);
    expect(cuadre.avisos).toBe(1);
    expect(cuadre.bloques.find((b) => b.bloqueId === "b017")?.piezasConAviso).toBe(10);
    expect(totalPiezas(r)).toBe(550);
  });

  it("un override exime sólo a SU bloque: lo que ninguna troza da y no se dijo a mano queda afuera con su porqué", () => {
    const lote = [...LOTE, pieza("p40", 2, 2, 8, 40)];
    const bloques = BLOQUES.map((b) => ({ ...b, m3: b.m3 * 2 }));
    bloques[1] = { ...bloques[1], overridesLinea: { [claveOverrideLinea("largo", "40pies")]: { piezas: 1 } } };
    const r = distribuirPorCapacidad(bloques, lote, "largo");
    expect(piezasPorBloque(r, 40)).toEqual({ b017: 0, b096: 1, b167: 0 });
    const st = r.especies[0].faltante.flatMap((f) => f.sinTroza ?? []);
    expect(st.map((x) => [x.piezas, x.motivos])).toEqual([[1, ["largo"]]]);
    expect(piezasPorBloque(r, 12).b017).toBe(0);
    expect(totalPiezas(r)).toBe(552);
  });

  it("completar medidas de una hoja ya registrada en el Libro no mueve nada; sin registro, la regla se prende", () => {
    const fuentes: FuentesDeTrozas = { ...SIN_FUENTES, cubicador: [{ especie: "Tornillo", d1: 45, d2: 48, largo: 2.5 }] };
    const sinMedidas = BLOQUES.map(({ trozasMedidas: _t, ...b }) => b);
    const registrada = completarMedidas(sinMedidas.map((b, i) => (i === 0 ? { ...b, corridaIds: ["c1"] } : b)), fuentes);
    expect(registrada?.every((b) => b.ignorarMedidas === true && (b.trozasMedidas?.length ?? 0) === 1)).toBe(true);
    const antes = distribuirPorCapacidad(sinMedidas, LOTE, "largo");
    const despues = distribuirPorCapacidad(registrada ?? [], LOTE, "largo");
    expect(JSON.stringify(despues.totales)).toBe(JSON.stringify(antes.totales));
    expect(piezasPorBloque(despues, 12)).toEqual(piezasPorBloque(antes, 12));
    const nueva = completarMedidas(sinMedidas, fuentes);
    expect(nueva?.some((b) => b.ignorarMedidas)).toBe(false);
    expect(nueva?.every((b) => (b.trozasMedidas?.length ?? 0) === 1)).toBe(true);
  });

  it("«sin respetar medidas» en todos = exactamente el reparto sin medidas", () => {
    const ignorado = distribuirPorCapacidad(BLOQUES.map((b) => ({ ...b, ignorarMedidas: true })), LOTE, "largo");
    const sinCopia = distribuirPorCapacidad(BLOQUES.map(({ trozasMedidas: _t, ...b }) => b), LOTE, "largo");
    expect(JSON.stringify(ignorado.totales)).toBe(JSON.stringify(sinCopia.totales));
    expect(ignorado.especies[0].medidas).toBeUndefined();
  });
});
