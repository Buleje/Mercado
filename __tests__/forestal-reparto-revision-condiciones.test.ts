import { describe, expect, it } from "vitest";
import { distribuirPorCapacidad, type BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { PT_POR_M3, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  fechaConDia, motivoMedidaImposible, revisarMedidasImposibles, revisarRendimientoDeBloques, revisarTrozasDeBloques,
  type ContextoTrozasRevision, type TrozaRevision,
} from "@/lib/forestal/reparto-revision-condiciones";
import { revisarDistribucion } from "@/lib/forestal/reparto-revision";
import { umbralRendimientoAlto } from "@/lib/forestal/ctp-rendimiento";

const PIEZAS = 1000;
function pieza(id: string, especie: string, m3: number, medida: Partial<PiezaCubicada> = {}): PiezaCubicada {
  return {
    id, cantidad: PIEZAS, espesor: 2, ancho: 8, largo: 10,
    uEspesor: "pulg", uAncho: "pulg", uLargo: "pies",
    especie, m3, pieTablar: Math.round(m3 * PT_POR_M3 * 100) / 100, ...medida,
  };
}
const bloque = (id: string, especie: string, m3: number, extra: Partial<BloqueRolliza> = {}): BloqueRolliza =>
  ({ id, etiqueta: `GTF-${id}`, especie, m3, origen: "manual", permiso: "19-SEC/REG-001", fecha: "2026-09-07", ...extra });
const dist = (bloques: BloqueRolliza[], piezas: PiezaCubicada[]) => distribuirPorCapacidad(bloques, piezas, "tipo");
const ids = (hs: { id: string }[]) => hs.map((h) => h.id);

const troza = (id: string, extra: Partial<TrozaRevision> = {}): TrozaRevision =>
  ({ id, codigo: `T-${id}`, especieComun: "Tornillo", permiso: "19-SEC/REG-001", largoM: 4, d1Cm: 50, d2Cm: 45, llegada: "2026-09-01", ...extra });
const ctx = (libro: TrozaRevision[], lotes: [string, { code: string; trozas: TrozaRevision[] }][] = []): ContextoTrozasRevision =>
  ({ libro, lotes: new Map(lotes) });

describe("1 · rendimiento por bloque contra el referencial SERFOR", () => {
  it("el umbral es 56 % + 3 pp (aserrada) y 41 % + 3 (tablillas), sin otro número", () => {
    expect(umbralRendimientoAlto()).toBe(59);
    expect(umbralRendimientoAlto("Comercial")).toBe(59);
    expect(umbralRendimientoAlto("Tablilla para piso")).toBe(44);
  });

  it("avisa el bloque que rinde 60 %: 10 m³ de rolliza amparan 6 y el techo es 5,9", () => {
    const b = [bloque("a", "Tornillo", 10, { aprovechablePct: 60 })];
    const h = revisarRendimientoDeBloques(dist(b, [pieza("p", "Tornillo", 6)]));
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ id: "a:rendimiento", severidad: "aviso", bloqueId: "a", donde: "GTF-a" });
    expect(h[0].que).toContain("Rinde 60.0 %");
    expect(h[0].que).toContain("5.900 m³");
    expect(h[0].info?.what).toContain("RDE D000259-2024");
  });

  it("no avisa en 58 % ni en 59 % justo (el margen es parte del referencial)", () => {
    for (const pct of [58, 59]) {
      const b = [bloque("a", "Tornillo", 10, { aprovechablePct: pct })];
      expect(revisarRendimientoDeBloques(dist(b, [pieza("p", "Tornillo", pct / 10)]))).toEqual([]);
    }
  });

  it("tablillas se juzgan contra 44 %: 50 % ya es alto", () => {
    const b = [bloque("a", "Tornillo", 10, { aprovechablePct: 50, tipoProducto: "Tablilla para piso" })];
    expect(ids(revisarRendimientoDeBloques(dist(b, [pieza("p", "Tornillo", 5)])))).toEqual(["a:rendimiento"]);
  });

  it("el «ampara» a mano sobre la rolliza: el bloque se topa en su m³ y avisa que rinde casi 100 %", () => {
    const b = [bloque("a", "Tornillo", 1, { amparaManualM3: 3 })];
    const [h] = revisarRendimientoDeBloques(dist(b, [pieza("p", "Tornillo", 3)]));
    expect(h.severidad).toBe("aviso");
    expect(h.que).toMatch(/Rinde 99\.\d %/);
  });

  it("la aserrada directa no tiene rendimiento: no salió de ninguna troza", () => {
    const b = [bloque("a", "Tornillo", 10, { tipo: "aserrada", aprovechablePct: 100 })];
    expect(revisarRendimientoDeBloques(dist(b, [pieza("p", "Tornillo", 10)]))).toEqual([]);
  });

  it("la especie no repite lo que ya dijo el bloque", () => {
    const b = [bloque("a", "Tornillo", 10, { aprovechablePct: 62 })];
    const h = revisarDistribucion(b, dist(b, [pieza("p", "Tornillo", 6.2)]));
    expect(ids(h)).toContain("a:rendimiento");
    expect(ids(h)).not.toContain("esp:Tornillo:rendimiento");
  });
});

describe("2 · aserrado antes de que llegue la troza", () => {
  it("fecha «jueves 10/09» en UTC", () => {
    expect(fechaConDia("2026-09-10")).toBe("jueves 10/09");
    expect(fechaConDia("2026-09-07T00:00:00.000Z")).toBe("lunes 07/09");
  });

  it("avisa la troza que llegó después del día del bloque, y dice cuál y cuándo", () => {
    const b = [bloque("a", "Tornillo", 10, { trozaIds: ["t1", "t2"] })];
    const c = ctx([troza("t1", { llegada: "2026-09-23" }), troza("t2")]);
    const h = revisarTrozasDeBloques(b, dist(b, [pieza("p", "Tornillo", 5)]), c).find((x) => x.id === "a:antes-de-llegar");
    expect(h?.severidad).toBe("aviso");
    expect(h?.que).toContain("lunes 07/09");
    expect(h?.que).toContain("1 troza llegó");
    expect(h?.que).toContain("T-t1");
    expect(h?.que).toContain("miércoles 23/09");
  });

  it("no avisa si la troza llegó el mismo día o antes", () => {
    const b = [bloque("a", "Tornillo", 10, { trozaIds: ["t1"] })];
    const c = ctx([troza("t1", { llegada: "2026-09-07" })]);
    expect(ids(revisarTrozasDeBloques(b, dist(b, [pieza("p", "Tornillo", 5)]), c))).not.toContain("a:antes-de-llegar");
  });

  it("mira la jornada del Libro más temprana, no sólo la fecha del bloque", () => {
    const b = [bloque("a", "Tornillo", 10, {
      fecha: "2026-09-25", trozaIds: ["t1"],
      jornadasLibro: [{ dia: 1, corridaId: "c1", lineNo: 1, estado: "declarada", fecha: "2026-09-05" }],
    })];
    const c = ctx([troza("t1", { llegada: "2026-09-10" })]);
    expect(ids(revisarTrozasDeBloques(b, dist(b, [pieza("p", "Tornillo", 5)]), c))).toContain("a:antes-de-llegar");
  });

  it("también con las trozas del lote, y calla si la troza no tiene fecha", () => {
    const b = [bloque("a", "Tornillo", 10, { loteId: "L1" })];
    const tarde = ctx([], [["L1", { code: "LA-01", trozas: [troza("t1", { llegada: "2026-09-30" })] }]]);
    const sinFecha = ctx([], [["L1", { code: "LA-01", trozas: [troza("t1", { llegada: null })] }]]);
    const d = dist(b, [pieza("p", "Tornillo", 5)]);
    expect(ids(revisarTrozasDeBloques(b, d, tarde))).toContain("a:antes-de-llegar");
    expect(ids(revisarTrozasDeBloques(b, d, sinFecha))).not.toContain("a:antes-de-llegar");
  });

  it("sin trozas cargadas no adivina nada", () => {
    const b = [bloque("a", "Tornillo", 10, { trozaIds: ["t1"] })];
    expect(revisarTrozasDeBloques(b, dist(b, [pieza("p", "Tornillo", 5)]), null)).toEqual([]);
  });
});

describe("3 · troza de otra especie dentro del bloque", () => {
  it("avisa la Capirona dentro de un bloque de Tornillo", () => {
    const b = [bloque("a", "Tornillo", 10, { trozaIds: ["t1", "t2"] })];
    const c = ctx([troza("t1"), troza("t2", { especieComun: "Capirona" })]);
    const h = revisarTrozasDeBloques(b, dist(b, [pieza("p", "Tornillo", 5)]), c).find((x) => x.id === "a:troza-otra-especie");
    expect(h?.que).toContain("1 de Capirona");
    expect(h?.info?.what).toBeTruthy();
  });

  it("no avisa la misma especie escrita distinto ni la troza sin especie", () => {
    const b = [bloque("a", "Tornillo", 10, { trozaIds: ["t1", "t2"] })];
    const c = ctx([troza("t1", { especieComun: " tornillo " }), troza("t2", { especieComun: null })]);
    expect(ids(revisarTrozasDeBloques(b, dist(b, [pieza("p", "Tornillo", 5)]), c))).not.toContain("a:troza-otra-especie");
  });
});

describe("4 · la misma troza en dos bloques", () => {
  it("un aviso por juego de bloques, con las trozas que comparten", () => {
    const b = [
      bloque("a", "Tornillo", 5, { trozaIds: ["t1", "t2"] }),
      bloque("b", "Tornillo", 5, { trozaIds: ["t1", "t2", "t3"] }),
    ];
    const c = ctx([troza("t1"), troza("t2"), troza("t3")]);
    const rep = revisarTrozasDeBloques(b, dist(b, [pieza("p", "Tornillo", 5)]), c).filter((x) => x.id.startsWith("rep:"));
    expect(rep).toHaveLength(1);
    expect(rep[0]).toMatchObject({ id: "rep:a+b", donde: "GTF-a · GTF-b", bloqueId: "a" });
    expect(rep[0].que).toContain("2 trozas están en 2 bloques");
  });

  it("también cruza una troza elegida con la de un lote", () => {
    const b = [bloque("a", "Tornillo", 5, { trozaIds: ["t1"] }), bloque("b", "Tornillo", 5, { loteId: "L1" })];
    const c = ctx([troza("t1")], [["L1", { code: "LA-01", trozas: [troza("t1")] }]]);
    expect(ids(revisarTrozasDeBloques(b, dist(b, [pieza("p", "Tornillo", 5)]), c))).toContain("rep:a+b");
  });

  it("no avisa trozas distintas ni la misma troza repetida dentro de UN bloque", () => {
    const b = [bloque("a", "Tornillo", 5, { trozaIds: ["t1", "t1"] }), bloque("b", "Tornillo", 5, { trozaIds: ["t2"] })];
    const c = ctx([troza("t1"), troza("t2")]);
    expect(ids(revisarTrozasDeBloques(b, dist(b, [pieza("p", "Tornillo", 5)]), c)).filter((x) => x.startsWith("rep:"))).toEqual([]);
  });
});

describe("5 · diámetro sin comprobar", () => {
  it("dice cuántas trozas no tienen Ø", () => {
    const b = [bloque("a", "Tornillo", 10, { trozaIds: ["t1", "t2"] })];
    const c = ctx([troza("t1", { d1Cm: null, d2Cm: null }), troza("t2", { d1Cm: null, d2Cm: null })]);
    const h = revisarTrozasDeBloques(b, dist(b, [pieza("p", "Tornillo", 5)]), c).find((x) => x.id === "a:sin-diametro");
    expect(h?.que).toBe("Diámetro sin comprobar: 2 trozas sin Ø.");
  });

  it("en parte: «en 1 de 2 trozas»", () => {
    const b = [bloque("a", "Tornillo", 10, { trozaIds: ["t1", "t2"] })];
    const c = ctx([troza("t1", { d1Cm: null, d2Cm: null }), troza("t2")]);
    const h = revisarTrozasDeBloques(b, dist(b, [pieza("p", "Tornillo", 5)]), c).find((x) => x.id === "a:sin-diametro");
    expect(h?.que).toContain("en 1 de 2 trozas");
  });

  it("no avisa si todas tienen Ø, ni si el bloque no amparó nada", () => {
    const b = [bloque("a", "Tornillo", 10, { trozaIds: ["t1"] })];
    expect(ids(revisarTrozasDeBloques(b, dist(b, [pieza("p", "Tornillo", 5)]), ctx([troza("t1")])))).not.toContain("a:sin-diametro");
    const sinD = ctx([troza("t1", { d1Cm: null, d2Cm: null })]);
    expect(ids(revisarTrozasDeBloques(b, dist(b, [pieza("p", "Cedro", 5)]), sinD))).not.toContain("a:sin-diametro");
  });
});

describe("6 · piezas con medidas imposibles", () => {
  const m = (espesor: number, ancho: number, largo: number, u: Partial<{ uEspesor: string; uAncho: string; uLargo: string }> = {}) =>
    ({ medida: `${espesor}×${ancho}×${largo}`, espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", piezas: 4, ...u });

  it("reusa medidaSospechosa: al revés, fuera de rango, en 0, unidad rara", () => {
    expect(motivoMedidaImposible(m(8, 2, 10))).toContain("más gruesa que ancha");
    expect(motivoMedidaImposible(m(2, 8, 40))).toContain("largo de 40.0 pies");
    expect(motivoMedidaImposible(m(2, 8, 0))).toBe("largo en 0");
    expect(motivoMedidaImposible(m(2, 8, 10, { uAncho: "xx" }))).toContain("«xx» desconocida");
  });

  it("no marca medidas creíbles, tampoco en cm/m justo en el borde del rango", () => {
    expect(motivoMedidaImposible(m(2, 8, 10))).toBeNull();
    expect(motivoMedidaImposible(m(0.5, 1, 2))).toBeNull();
    expect(motivoMedidaImposible(m(5, 76.2, 3, { uEspesor: "cm", uAncho: "cm", uLargo: "m" }))).toBeNull();
  });

  it("lista la fila con su bloque, y también lo que quedó por distribuir", () => {
    const b = [bloque("a", "Tornillo", 10)];
    const d = dist(b, [pieza("p", "Tornillo", 2, { espesor: 8, ancho: 2 }), pieza("q", "Cedro", 1, { largo: 40 })]);
    const h = revisarMedidasImposibles(d);
    const delBloque = h.find((x) => x.bloqueId === "a");
    expect(delBloque?.donde).toMatch(/^GTF-a · /);
    expect(delBloque?.que).toContain("más gruesa que ancha");
    expect(h.some((x) => x.id.startsWith("esp:Cedro:falta:medida:") && x.bloqueId === null)).toBe(true);
  });

  it("de 7 filas malas nombra 3 y cuenta el resto en una línea", () => {
    const b = [bloque("a", "Tornillo", 100, { aprovechablePct: 100 })];
    const piezas = [31, 32, 33, 34, 35, 36, 37].map((largo, i) => pieza(`p${i}`, "Tornillo", 1, { largo }));
    const h = revisarMedidasImposibles(dist(b, piezas));
    expect(h).toHaveLength(4);
    expect(h[3].id).toBe("a:medida:resto");
    expect(h[3].que).toContain("4 medidas imposibles más");
  });

  it("una aserrada sana no genera nada", () => {
    const b = [bloque("a", "Tornillo", 10)];
    expect(revisarMedidasImposibles(dist(b, [pieza("p", "Tornillo", 5)]))).toEqual([]);
  });
});
