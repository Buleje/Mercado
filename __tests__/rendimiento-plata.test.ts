import { describe, expect, it } from "vitest";
import {
  FACTOR_OXAPAMPA_GEOMETRICO,
  FALTA,
  agregarRendimientoPlata,
  entradaDePlata,
  ptOxapampaEstimado,
  rendimientoEnPlata,
  salidaDePlata,
  type GuiaParaPlata,
} from "@/lib/forestal/rendimiento-plata";

/** Las 5 corridas de Blas (medidas 08-10, sólo lectura): inventario declarado, 0 consumos, 0 plata. */
const BLAS = [
  { m3: 6.049, out: 0.934, pct: 15.44 },
  { m3: 20.718, out: 2.399, pct: 11.58 },
  { m3: 9.42, out: 3.531, pct: 37.48 },
  { m3: 13.537, out: 3.688, pct: 27.24 },
  { m3: 28.947, out: 9.22, pct: 31.85 },
];

const sinPlata = (m3: number, out: number) =>
  rendimientoEnPlata(
    entradaDePlata({ m3, consumos: [], guias: new Map(), costoMadera: null, motivoMadera: "sin_consumos" }),
    salidaDePlata({ m3: out, paquetes: [{ volumenM3: out, pieTablar: null, precioVentaPt: null }], costoProceso: null }),
    { parcial: true },
  );

describe("rendimiento-plata · Blas real", () => {
  const filas = BLAS.map((b) => sinPlata(b.m3, b.out));

  it("cada corrida da el mismo % que el libro (m³ ÷ m³)", () => {
    expect(filas.map((f) => f.rendimientoM3Pct)).toEqual(BLAS.map((b) => b.pct));
  });

  it("el agregado es PONDERADO: 25,13 (no el 24,72 del promedio simple)", () => {
    const t = agregarRendimientoPlata(filas);
    expect(t.rendimientoM3Pct).toBe(25.13);
    expect(t.base.m3Entrada).toBeCloseTo(78.671, 4);
    expect(t.base.m3Salida).toBeCloseTo(19.772, 4);
    expect(t.parcial).toBe(true);
  });

  it("sin plata: faltan madera, PT pagado y venta; costo y margen null, nunca 0", () => {
    const t = agregarRendimientoPlata(filas);
    expect(t.faltantes).toEqual(expect.arrayContaining([FALTA.madera, FALTA.ptPagado, FALTA.venta, FALTA.flete, FALTA.aserrio]));
    expect(t.costoPorPt).toBeNull();
    expect(t.ventaPorPt).toBeNull();
    expect(t.margenPorPt).toBeNull();
  });

  it("el comercial se estima con el factor Oxapampa: 25,13 % m³ ≈ 40 % en PT", () => {
    const t = agregarRendimientoPlata(filas);
    expect(t.ptEntradaEstimado).toBe(true);
    expect(t.rendimientoPtPct).toBeGreaterThan(39.5);
    expect(t.rendimientoPtPct).toBeLessThan(40.6);
  });
});

describe("rendimiento-plata · PT de entrada", () => {
  it("factor Oxapampa/geométrico ≈ 0,624", () => {
    expect(FACTOR_OXAPAMPA_GEOMETRICO).toBeCloseTo(0.624, 3);
    expect(ptOxapampaEstimado(1)).toBeCloseTo(424 * 0.6237, 0);
  });

  const guia = (ptSellado: number | null, ptPago: { pt: number; fuente: "oxapampa" | "estimado" }): GuiaParaPlata => ({
    lineas: [{ id: "w1", volumeM3: 10, ptSellado, fuenteSellada: ptSellado != null ? "factura" : null, ptPago }],
    volumenM3: 10,
    fleteGastos: 500,
  });
  const consumo = [{ woodEntryId: "w1", gtfNumber: "G1", volumeM3: 5 }];
  const entrada = (g: GuiaParaPlata) =>
    entradaDePlata({ m3: 5, consumos: consumo, guias: new Map([["G1", g]]), costoMadera: 1000, motivoMadera: "ok" });

  it("sellado de la factura > Oxapampa de las trozas, prorrateado por m³", () => {
    const e = entrada(guia(3000, { pt: 2800, fuente: "oxapampa" }));
    expect(e.ptPagado).toBe(1500);
    expect(e.fuentePt).toBe("factura");
    expect(e.costoFleteGastos).toBe(250);
  });

  it("sin sello: el Oxapampa de las trozas", () => {
    const e = entrada(guia(null, { pt: 2800, fuente: "oxapampa" }));
    expect(e.ptPagado).toBe(1400);
    expect(e.fuentePt).toBe("oxapampa");
  });

  it("el ≈ de la guía no se usa: cae al ≈ del m³ y se rotula", () => {
    const e = entrada(guia(null, { pt: 2000, fuente: "estimado" }));
    expect(e.ptPagado).toBeNull();
    const r = rendimientoEnPlata(e, salidaDePlata({ m3: 2.5, paquetes: [], costoProceso: 100 }), { parcial: false });
    expect(r.ptEntradaEstimado).toBe(true);
    expect(r.base.ptEntrada).toBe(ptOxapampaEstimado(5));
    expect(r.faltantes).toContain(FALTA.ptPagado);
  });
});

describe("rendimiento-plata · ceros y faltantes", () => {
  it("flete sin monto → null + faltante, el costo por PT queda en null", () => {
    const e = entradaDePlata({
      m3: 5,
      consumos: [{ woodEntryId: "w1", gtfNumber: "G1", volumeM3: 5 }],
      guias: new Map([["G1", { lineas: [], volumenM3: 5, fleteGastos: null }]]),
      costoMadera: 1000,
      motivoMadera: "ok",
    });
    expect(e.costoFleteGastos).toBeNull();
    const r = rendimientoEnPlata(e, salidaDePlata({ m3: 2.5, paquetes: [], costoProceso: 100 }), { parcial: false });
    expect(r.costoPorPt).toBeNull();
    expect(r.faltantes).toContain(FALTA.flete);
  });

  it("todo cargado: costo, venta y margen por PT", () => {
    const e = { m3: 10, ptPagado: 2600, fuentePt: "factura" as const, costoMadera: 2000, costoFleteGastos: 300, servicio: false };
    const s = salidaDePlata({ m3: 5, paquetes: [{ volumenM3: 5, pieTablar: 2000, precioVentaPt: 3 }], costoProceso: 700 });
    const r = rendimientoEnPlata(e, s, { parcial: false });
    expect(r.faltantes).toEqual([]);
    expect(r.costoPorPt).toBe(1.5); // (2000+300+700)/2000
    expect(r.ventaPorPt).toBe(3);
    expect(r.margenPorPt).toBe(1.5);
    expect(r.rendimientoPtPct).toBe(76.9);
    expect(r.ptSalidaEstimado).toBe(false);
  });

  it("un paquete sin precio deja la venta en null (no suma la mitad)", () => {
    const s = salidaDePlata({
      m3: 2,
      paquetes: [
        { volumenM3: 1, pieTablar: 424, precioVentaPt: 3 },
        { volumenM3: 1, pieTablar: null, precioVentaPt: null },
      ],
      costoProceso: null,
    });
    expect(s.ventaSoles).toBeNull();
    expect(s.ptMedido).toBe(false);
    expect(s.pt).toBe(848);
  });

  it("madera de servicio: sin costo ni venta que pedir", () => {
    const e = entradaDePlata({ m3: 5, consumos: [], guias: new Map(), costoMadera: null, motivoMadera: "madera_de_servicio" });
    const r = rendimientoEnPlata(e, salidaDePlata({ m3: 2, paquetes: [], costoProceso: null }), { parcial: false });
    expect(r.servicio).toBe(true);
    expect(r.faltantes).toEqual([]);
    expect(r.costoPorPt).toBeNull();
  });
});
