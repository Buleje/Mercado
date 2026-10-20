import { describe, expect, it } from "vitest";
import {
  aCm,
  aMetros,
  coincidePermiso,
  cuadrarBloque,
  diametroUtilCm,
  revisarPieza,
  trozasDelBloque,
  type FuentesDeTrozas,
  type PiezaMedida,
} from "@/lib/forestal/cuadre-medidas-rolliza";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";

const pieza = (largoPies: number, anchoPulg: number, piezas = 12, espesorPulg = 2): PiezaMedida => ({
  medida: `${espesorPulg}x${anchoPulg}x${largoPies}`,
  espesor: espesorPulg,
  ancho: anchoPulg,
  largo: largoPies,
  uEspesor: "pulg",
  uAncho: "pulg",
  uLargo: "pies",
  piezas,
});

describe("unidades", () => {
  it("convierte pies → m y pulgadas → cm", () => {
    expect(aMetros(20, "pies")).toBeCloseTo(6.096, 3);
    expect(aMetros(6, "m")).toBe(6);
    expect(aMetros(250, "cm")).toBe(2.5);
    expect(aCm(12, "pulg")).toBeCloseTo(30.48, 2);
    expect(aCm(25, "cm")).toBe(25);
    expect(aMetros(0, "pies")).toBeNull();
    expect(aMetros(3, "brazas")).toBeNull();
  });

  it("el Ø de la troza es la punta delgada; sin puntas, el declarado", () => {
    expect(diametroUtilCm({ d1Cm: 48, d2Cm: 46 })).toBe(46);
    expect(diametroUtilCm({ d1Cm: 40 })).toBe(40);
    expect(diametroUtilCm({ diametroCm: 35 })).toBe(35);
    expect(diametroUtilCm({})).toBeNull();
  });
});

describe("revisarPieza", () => {
  it("20 pies contra una troza de 6,00 m cuadra (tolerancia de 15 cm)", () => {
    expect(revisarPieza(pieza(20, 6), [{ largoM: 6, d1Cm: 50, d2Cm: 52 }], "PLT-1")).toBeNull();
  });

  it("20 pies contra 5,20 m es advertencia, con el texto que lee Brandon", () => {
    const a = revisarPieza(pieza(20, 6), [{ largoM: 5.2, d1Cm: 50, d2Cm: 52 }, { largoM: 4, d1Cm: 60 }], "PLT-2025-167");
    expect(a?.motivos).toEqual(["largo"]);
    expect(a?.texto).toBe("12 piezas de 20 pies (6.10 m) y la troza más larga de PLT-2025-167 mide 5.20 m");
  });

  it("ancho 12″ contra un Ø de 25 cm es advertencia por diámetro", () => {
    const a = revisarPieza(pieza(8, 12, 3), [{ largoM: 4, d1Cm: 25, d2Cm: 27 }], "PLT-9");
    expect(a?.motivos).toEqual(["diametro"]);
    expect(a?.texto).toContain("2×12″ (pide 30.9 cm de Ø)");
    expect(a?.texto).toContain("mide 25 cm de Ø en la punta");
  });

  it("el Ø se mide contra la diagonal de la sección (ADR-505): 6×12″ pide 34 cm, no 30,5", () => {
    const troza = [{ largoM: 4, d1Cm: 32, d2Cm: 34 }];
    /* Con el lado mayor solo (30,5 cm) cabía; con la diagonal (34,1 cm) no. */
    const a = revisarPieza(pieza(8, 12, 2, 6), troza, "PLT-9");
    expect(a?.motivos).toEqual(["diametro"]);
    expect(a?.diagonalCm).toBeCloseTo(34.08, 1);
    expect(revisarPieza(pieza(8, 12, 2, 2), [{ largoM: 4, d1Cm: 31, d2Cm: 33 }], "PLT-9")).toBeNull();
  });

  it("largo y Ø alcanzan por separado pero no en la misma troza", () => {
    const a = revisarPieza(pieza(18, 12), [{ largoM: 6, d1Cm: 20 }, { largoM: 3, d1Cm: 60 }], "PLT-9");
    expect(a?.motivos).toEqual(["misma-troza"]);
    expect(a?.texto).toContain("no pasan de 20 cm de Ø");
  });

  it("sin trozas con medidas no opina", () => {
    expect(revisarPieza(pieza(20, 6), [{ largoM: null, d1Cm: null }], "PLT-9")).toBeNull();
  });
});

describe("cuadrarBloque", () => {
  const base = { bloqueId: "b1", etiqueta: "Bloque 1", especie: "Cumala", permiso: "PLT-1", fuente: "x" };

  it("sin trozas → «sin medidas», nunca «cuadra»", () => {
    const r = cuadrarBloque({ ...base, trozas: [], piezas: [pieza(20, 6)] });
    expect(r.estado).toBe("sin-medidas");
    expect(r.avisos).toHaveLength(0);
  });

  it("une la misma medida repartida en dos grupos y cuenta las piezas", () => {
    const r = cuadrarBloque({ ...base, trozas: [{ largoM: 3.8, d1Cm: 48, d2Cm: 46 }], piezas: [pieza(20, 8, 5), pieza(20, 8, 4), pieza(10, 8, 9)] });
    expect(r.estado).toBe("advertencia");
    expect(r.avisos).toHaveLength(1);
    expect(r.piezasConAviso).toBe(9);
    expect(r.piezas).toBe(18);
  });
});

describe("trozasDelBloque", () => {
  const fuentes: FuentesDeTrozas = {
    libro: [
      { id: "t1", permiso: "19-SEC/REG-PLT-2021-017", especieComun: "Tornillo", largoM: 5, d1Cm: 40 },
      { id: "t2", permiso: "OTRO", especieComun: "Tornillo", largoM: 9, d1Cm: 90 },
      { id: "t3", permiso: "PLT-2021-017", especieComun: "Cumala", largoM: 9, d1Cm: 90 },
    ],
    lotes: new Map(),
    cubicador: [{ especie: "Tornillo", d1: 30, d2: 32, largo: 4 }],
  };
  const bloque = (x: Partial<BloqueRolliza>): BloqueRolliza => ({ id: "b", etiqueta: "", especie: "Tornillo", m3: 1, origen: "manual", ...x });

  it("por permiso (la cola del título) y especie", () => {
    const r = trozasDelBloque(bloque({ permiso: "PLT-2021-017" }), fuentes);
    expect(r.trozas).toHaveLength(1);
    expect(r.trozas[0]?.largoM).toBe(5);
  });

  it("las trozas elegidas mandan sobre el permiso", () => {
    expect(trozasDelBloque(bloque({ permiso: "PLT-2021-017", trozaIds: ["t2"] }), fuentes).trozas[0]?.largoM).toBe(9);
  });

  it("del cubicador de trozas por especie; sin nada → vacío", () => {
    expect(trozasDelBloque(bloque({ origen: "trozas" }), fuentes).trozas[0]?.d1Cm).toBe(30);
    expect(trozasDelBloque(bloque({ especie: "Capirona" }), fuentes).trozas).toHaveLength(0);
  });

  it("coincidePermiso no confunde colas cortas", () => {
    expect(coincidePermiso("PLT-2021-017", "19 SEC REG PLT 2021 017")).toBe(true);
    expect(coincidePermiso("017", "PLT-2021-017")).toBe(false);
  });
});

describe("permiso de la hoja (chips de «Lo que entró»)", () => {
  const b = (x: Partial<BloqueRolliza>): BloqueRolliza => ({ id: Math.random().toString(36), etiqueta: "", especie: "Tornillo", m3: 1, origen: "manual", ...x });

  it("agrupa por permiso escrito distinto, separa la aserrada y deja «sin permiso» al final", async () => {
    const { gruposDePermiso, SIN_PERMISO } = await import("@/components/admin/forestal/hooks/use-permiso-de-rolliza");
    const g = gruposDePermiso([
      b({ permiso: "", m3: 50 }),
      b({ permiso: "PLT-2025-167", m3: 5, trozaIds: ["a", "b"] }),
      b({ permiso: "plt 2025 167", m3: 3, piezasOrigen: 4 }),
      b({ permiso: "PLT-2021-017", m3: 30 }),
    ]);
    expect(g.map((x) => x.valor)).toEqual(["PLT-2021-017", "PLT-2025-167", SIN_PERMISO]);
    expect(g[1]).toMatchObject({ bloques: 2, rollizaM3: 8, trozas: 6 });
  });

  it("bloqueEnPermiso: vacío = todos; la cola del título también cuenta", async () => {
    const { bloqueEnPermiso, SIN_PERMISO } = await import("@/components/admin/forestal/hooks/use-permiso-de-rolliza");
    expect(bloqueEnPermiso({ permiso: "X" }, "")).toBe(true);
    expect(bloqueEnPermiso({ permiso: "19-SEC/REG-PLT-2021-017" }, "PLT-2021-017")).toBe(true);
    expect(bloqueEnPermiso({ permiso: "PLT-2025-167" }, "PLT-2021-017")).toBe(false);
    expect(bloqueEnPermiso({ permiso: " " }, SIN_PERMISO)).toBe(true);
  });
});
