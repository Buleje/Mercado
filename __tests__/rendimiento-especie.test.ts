import { describe, expect, it } from "vitest";
import {
  armarRendimientoAserradero,
  estadoCorrida,
  rangoPropio,
  resumenPorEspecie,
  simularAserrado,
  tendencia,
  RANGO_REFERENCIA,
  textoPlataNoLeida,
  type CorridaRendimiento,
} from "@/lib/forestal/rendimiento-especie";
import { rendimientoEnPlata, salidaDePlata } from "@/lib/forestal/rendimiento-plata";

const corrida = (p: Partial<CorridaRendimiento> & { id: string; especie: string; pct: number | null }): CorridaRendimiento => ({
  lineNo: 1,
  fecha: "2026-09-01",
  lote: null,
  m3Entrada: 10,
  m3Salida: p.pct != null ? p.pct / 10 : 0,
  unidad: "m3",
  rendimientoPct: p.pct,
  finProceso: null,
  parcial: false,
  ...p,
});

/** Blas 08-10: 5 especies, 1 corrida c/u, todas con lote en proceso hasta 01-11. */
const BLAS: CorridaRendimiento[] = [
  ["Azucar huayo", 6.049, 0.934, 15.44, "21-2026"],
  ["Panguana", 20.718, 2.399, 11.58, "20-2026"],
  ["Mashonaste", 9.42, 3.531, 37.48, "LA-2026-001"],
  ["Copal", 13.537, 3.688, 27.24, "LA-2026-002"],
  ["Cachimbo", 28.947, 9.22, 31.85, "LA-2026-003"],
].map(([especie, m3Entrada, m3Salida, pct, lote], i) => ({
  id: `b${i + 1}`,
  lineNo: i + 1,
  fecha: "2026-08-01",
  especie: especie as string,
  lote: lote as string,
  m3Entrada: m3Entrada as number,
  m3Salida: m3Salida as number,
  unidad: "m3",
  rendimientoPct: pct as number,
  finProceso: "2026-11-01",
  parcial: true,
}));

describe("rendimiento por especie · Blas", () => {
  const dto = armarRendimientoAserradero(BLAS, null, "2026-10-08");

  it("5 corridas, ponderado 25,13 y promedio simple 24,72 al lado", () => {
    expect(dto.total.corridas).toBe(5);
    expect(dto.total.ponderadoPct).toBe(25.13);
    expect(dto.total.promedioSimplePct).toBe(24.72);
  });

  it("las 5 «parcial»: ninguna se juzga ni enseña rango", () => {
    expect(dto.total.enProceso).toBe(5);
    expect(dto.corridas.every((c) => c.estado === "parcial")).toBe(true);
    expect(dto.especies.every((e) => e.rango == null && e.terminadas === 0)).toBe(true);
    expect(dto.especies.find((e) => e.especie === "Panguana")?.finProceso).toBe("2026-11-01");
  });

  it("sin rol de plata, plataVisible = false y sin total de plata", () => {
    expect(dto.plataVisible).toBe(false);
    expect(dto.total.plata).toBeNull();
  });

  it("el simulador cae a la referencia general, rotulada", () => {
    const sim = simularAserrado([{ especie: "Panguana", m3: 10 }], dto.especies);
    expect(sim[0].fuente).toBe("referencia");
    expect(sim[0].pct).toBe(RANGO_REFERENCIA.centro);
    expect(sim[0].ptEsperado).toBeCloseTo(10 * 0.56 * 424, 1);
  });
});

describe("rango propio", () => {
  it("con menos de 5 corridas es provisional (lo visto ± 5)", () => {
    expect(rangoPropio([50.19, 50])).toEqual({ min: 45, max: 55.2, corridas: 2, provisional: true });
  });
  it("con 5 o más: percentil 10 a 90", () => {
    const r = rangoPropio([40, 45, 50, 55, 60, 90]);
    expect(r?.provisional).toBe(false);
    expect(r?.min).toBe(42.5);
    expect(r?.max).toBe(75);
  });
  it("sin corridas: null", () => {
    expect(rangoPropio([])).toBeNull();
  });
});

describe("estado de una corrida contra las OTRAS de su especie", () => {
  const cs = [
    corrida({ id: "a", especie: "Tornillo", pct: 50 }),
    corrida({ id: "b", especie: "Tornillo", pct: 52 }),
    corrida({ id: "c", especie: "Tornillo", pct: 38 }),
    corrida({ id: "d", especie: "Cumala", pct: 47 }),
    corrida({ id: "e", especie: "Tornillo", pct: 20, parcial: true, finProceso: "2026-11-01" }),
  ];
  it("sale bajo lo suyo", () => {
    const r = estadoCorrida(cs[2], cs);
    expect(r.estado).toBe("bajo_lo_suyo");
    expect(r.rango).toMatchObject({ min: 45, max: 57, corridas: 2, provisional: true });
  });
  it("única de su especie: sin rango", () => {
    expect(estadoCorrida(cs[3], cs).estado).toBe("sin_rango");
  });
  it("en proceso: parcial, y no entra al rango de las otras", () => {
    expect(estadoCorrida(cs[4], cs).estado).toBe("parcial");
    const tornillo = resumenPorEspecie(cs).find((e) => e.especie === "Tornillo")!;
    expect(tornillo.terminadas).toBe(3);
    expect(tornillo.enProceso).toBe(1);
    expect(tornillo.rango?.corridas).toBe(3);
  });
});

describe("tendencia", () => {
  it("con menos de 3 corridas no hay tendencia", () => {
    expect(tendencia([40, 50])).toBeNull();
  });
  it("sube, baja o estable por la pendiente", () => {
    expect(tendencia([40, 45, 50])?.sentido).toBe("sube");
    expect(tendencia([50, 45, 40])?.sentido).toBe("baja");
    expect(tendencia([50, 50.5, 50.2])?.sentido).toBe("estable");
  });
});

describe("simulador con corridas propias", () => {
  it("usa el ponderado de las terminadas de la especie y su rango", () => {
    const cs = [corrida({ id: "a", especie: "Tornillo", pct: 50 }), corrida({ id: "b", especie: "Tornillo", pct: 52 })];
    const sim = simularAserrado([{ especie: "tornillo", m3: 2, trozas: 3 }, { especie: "Tornillo", m3: 1 }], resumenPorEspecie(cs));
    expect(sim).toHaveLength(1);
    expect(sim[0]).toMatchObject({ especie: "Tornillo", m3: 3, trozas: 4, pct: 51, fuente: "provisional", corridas: 2 });
    expect(sim[0].ptEsperado).toBeCloseTo(3 * 0.51 * 424, 1);
    expect(sim[0].ptMin).toBeLessThan(sim[0].ptEsperado);
  });
});

/* Revisión 1dc55fcad: el ponderado se decide por los m³, no por el % guardado. */
describe("ponderado por m³ (no por el % guardado)", () => {
  it("una corrida en PT con un % viejo no mete su troza al denominador", () => {
    const cs = [
      corrida({ id: "a", especie: "Tornillo", pct: 50, m3Entrada: 10, m3Salida: 5 }),
      corrida({ id: "pt", especie: "Tornillo", pct: 40, m3Entrada: 10, m3Salida: 0, unidad: "pt" }),
    ];
    expect(armarRendimientoAserradero(cs, null, "2026-10-08").total.ponderadoPct).toBe(50);
  });

  it("una corrida en m³ sin % guardado pero con entrada y salida sí cuenta", () => {
    const cs = [
      corrida({ id: "a", especie: "Tornillo", pct: 50, m3Entrada: 10, m3Salida: 5 }),
      corrida({ id: "b", especie: "Tornillo", pct: null, m3Entrada: 10, m3Salida: 3 }),
    ];
    expect(armarRendimientoAserradero(cs, null, "2026-10-08").total.ponderadoPct).toBe(40);
  });

  it("Blas sigue en 25,13 (19,772 ÷ 78,671)", () => {
    const t = armarRendimientoAserradero(BLAS, null, "2026-10-08").total;
    expect(t.ponderadoPct).toBe(25.13);
    expect(t.m3Entrada).toBeCloseTo(78.671, 4);
    expect(t.m3Salida).toBeCloseTo(19.772, 4);
  });
});

describe("plata no leída por el tope", () => {
  it("una corrida sin plata con la plata pedida: el total no tiene costo y lo dice", () => {
    const plata = rendimientoEnPlata(
      { m3: 10, ptPagado: 2600, fuentePt: "factura", costoMadera: 2000, costoFleteGastos: 300, servicio: false },
      salidaDePlata({ m3: 5, paquetes: [{ volumenM3: 5, pieTablar: 2000, precioVentaPt: 3 }], costoProceso: 700 }),
      { parcial: false },
    );
    const cs = [corrida({ id: "a", especie: "Tornillo", pct: 50 }), corrida({ id: "b", especie: "Tornillo", pct: 40 })];
    const dto = armarRendimientoAserradero(cs, new Map([["a", plata]]), "2026-10-08", { corridas: 1, guias: 0 });
    expect(dto.plataTruncada).toEqual({ corridas: 1, guias: 0 });
    expect(dto.total.plata?.costoPorPt).toBeNull();
    expect(dto.total.plata?.faltantes).toContain("la plata de 1 corrida no leída");
    expect(textoPlataNoLeida({ corridas: 1, guias: 3 })).toBe("No se leyó la plata de 1 corrida antigua ni de 3 guías: el costo total queda sin calcular.");
  });
});
