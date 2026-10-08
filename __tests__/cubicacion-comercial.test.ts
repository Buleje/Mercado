/**
 * ADR-483 · las cuentas puras de la cubicación comercial: descuentos por troza
 * (hueco, largo que no sirve, castigo), por pieza aserrada (descartadas,
 * castigo) y del lote (por especie y general), el precio general, y el
 * prellenado de la GTF real de Blas (019-001-0000001, 22 trozas).
 */
import { describe, expect, it } from "vitest";
import {
  DescuentoInvalidoError,
  aplicarDescuentoLote,
  cubicarLineasComercial,
  cubicarPiezasComercial,
  cubicarTrozasComercial,
  lineasDeEspecie,
  piesDeMetros,
  piezaNeta,
  ptSugeridoDeM3,
  pulgadasDeMetros,
  trozaNeta,
  unidadesComercial,
} from "@/lib/forestal/cubicacion-comercial";
import { FaltaPrecioError, aplicarCubicacionSchema, huellaAplicar, valorizar, type LineaEspecie } from "@/lib/forestal/cubicacion-cuenta";
import { descuentoTrozaSchema, guardarAserradaSchema, piezaComercialSchema } from "@/lib/forestal/cubicacion-comercial-tipos";
import { cubicarSegun } from "@/lib/forestal/cubicacion-trozas-formula";

const linea = (clave: string, nombre: string, volumen: number): LineaEspecie => ({ clave, nombre, n: 1, volumen, precio: null, monto: null });
const errorDe = (fn: () => unknown): string => {
  try {
    fn();
    return "sin error";
  } catch (e) {
    return e instanceof DescuentoInvalidoError ? `descuento ${JSON.stringify(e.donde)}` : String(e);
  }
};
const pieza = (cantidad: number, extra: Record<string, unknown> = {}) =>
  piezaComercialSchema.parse({ especie: "Tornillo", cantidad, espesor: 2, ancho: 8, largo: 10, ...extra });

describe("trozaNeta", () => {
  it("1 · Oxapampina sin descuento: neto = bruto = cubicarSegun", () => {
    expect(trozaNeta("oxapampina", 20, 18, 12)).toEqual({ bruto: cubicarSegun("oxapampina", 20, 12, 18), neto: cubicarSegun("oxapampina", 20, 12, 18) });
    expect(trozaNeta("oxapampina", 20, 18, 12, { hueco: null, menosLargo: null, pct: 0 }).neto).toBe(trozaNeta("oxapampina", 20, 18, 12).bruto);
  });

  it("2 · hueco 6″ en 20″ × 20″ × 10′: 163,27 − 14,69 = 148,58 PT", () => {
    expect(cubicarSegun("oxapampina", 6, 10, 6)).toBe(14.69);
    expect(trozaNeta("oxapampina", 20, 20, 10, { hueco: 6 })).toEqual({ bruto: 163.27, neto: 148.58 });
  });

  it("3 · −2′ de largo → 130,61; castigo 10 % → ×0,9", () => {
    expect(trozaNeta("oxapampina", 20, 20, 10, { menosLargo: 2 }).neto).toBe(130.61);
    expect(trozaNeta("oxapampina", 20, 20, 10, { pct: 10 }).neto).toBe(146.94);
    /* El orden: largo → hueco con ese largo → castigo. 8′: 130,61 − 11,76 = 118,85 × 0,9 = 106,97. */
    expect(trozaNeta("oxapampina", 20, 20, 10, { menosLargo: 2, hueco: 6, pct: 10 }).neto).toBe(106.97);
  });

  it("4 · hueco ≥ Ø menor o −largo ≥ largo → DescuentoInvalidoError con la troza; 91 % no pasa el Zod", () => {
    expect(errorDe(() => trozaNeta("oxapampina", 20, 18, 10, { hueco: 18 }, 7))).toBe('descuento {"troza":7}');
    expect(errorDe(() => trozaNeta("oxapampina", 20, 18, 10, { menosLargo: 10 }, 3))).toBe('descuento {"troza":3}');
    expect(errorDe(() => trozaNeta("oxapampina", 20, 18, 10, { hueco: 17.9 }))).toBe("sin error");
    expect(descuentoTrozaSchema.safeParse({ pct: 91 }).success).toBe(false);
    expect(descuentoTrozaSchema.safeParse({ pct: 90 }).success).toBe(true);
  });

  it("5 · Smalian con hueco en cm: resta π/4 · h² · L′", () => {
    const bruto = cubicarSegun("smalian", 60, 3, 50);
    const hueco = Math.round((Math.PI / 4) * 0.2 ** 2 * 3 * 10_000) / 10_000;
    expect(trozaNeta("smalian", 60, 50, 3, { hueco: 20 })).toEqual({ bruto, neto: Math.round((bruto - hueco) * 10_000) / 10_000 });
  });
});

describe("piezaNeta", () => {
  it("6 · 10 × 2″ × 8″ × 10′ = 133,33 PT; 2 descartadas → 106,67; más descartadas que piezas → error", () => {
    expect(piezaNeta(pieza(10))).toEqual({ bruto: 133.33, neto: 133.33 });
    expect(piezaNeta(pieza(10, { descuento: { descartadas: 2 } }))).toEqual({ bruto: 133.33, neto: 106.67 });
    expect(piezaNeta(pieza(10, { descuento: { descartadas: 10 } })).neto).toBe(0);
    expect(errorDe(() => piezaNeta(pieza(10, { descuento: { descartadas: 11 } }), 4))).toBe('descuento {"pieza":4}');
    expect(piezaNeta(pieza(10, { descuento: { pct: 10 } })).neto).toBe(120);
  });
});

describe("aplicarDescuentoLote", () => {
  const lineas = [linea("tornillo", "Tornillo", 1000), linea("cumala", "Cumala", 500)];

  it("7 · por especie (−PT y %) y después el general; nunca < 0; menos > neto o clave ausente → error", () => {
    const r = aplicarDescuentoLote(lineas, { pct: 10, porEspecie: [{ clave: "Tornillo", menos: 100, pct: 50 }] }, "oxapampina");
    /* Tornillo: (1000 − 100) × 0,5 × 0,9 = 405 · Cumala: 500 × 0,9 = 450. */
    expect(r.lineas.map((l) => l.volumen)).toEqual([405, 450]);
    expect([r.bruto, r.neto]).toEqual([1500, 855]);
    expect(aplicarDescuentoLote(lineas, { porEspecie: [{ clave: "cumala", menos: 500 }] }, "oxapampina").lineas[1].volumen).toBe(0);
    expect(errorDe(() => aplicarDescuentoLote(lineas, { porEspecie: [{ clave: "cumala", menos: 500.01 }] }, "oxapampina"))).toBe('descuento {"clave":"cumala"}');
    expect(errorDe(() => aplicarDescuentoLote(lineas, { porEspecie: [{ clave: "Cedro", pct: 5 }] }, "oxapampina"))).toBe('descuento {"clave":"cedro"}');
    expect(aplicarDescuentoLote(lineas, null, "oxapampina")).toEqual({ lineas, bruto: 1500, neto: 1500 });
  });

  it("8 · la línea rápida: el PT manda, el m³ no cambia el volumen", () => {
    const r = cubicarLineasComercial([
      { especie: "Tornillo", pt: 1200.5, m3: 2.83, piezas: 40 },
      { especie: "tornillo", pt: 99.5, m3: 99 },
    ]);
    expect(r.porEspecie).toEqual([{ clave: "tornillo", nombre: "Tornillo", n: 40, volumen: 1300, precio: null, monto: null }]);
    expect([r.bruto, r.neto]).toEqual([1300, 1300]);
    expect(r.lineas[1]).toEqual({ n: 2, especie: "tornillo", pt: 99.5, m3: 99, piezas: null, volumen: 99.5 });
  });
});

describe("valorizar y huella con precio general", () => {
  it("9 · precio propio > general > FaltaPrecioError; 33,33 × 2,5 = 83,33", () => {
    const l = [linea("tornillo", "Tornillo", 33.33), linea("cumala", "Cumala", 10)];
    const r = valorizar(l, [{ clave: "tornillo", precio: 2.5 }], 3);
    expect(r.porEspecie.map((x) => [x.precio, x.monto])).toEqual([[2.5, 83.33], [3, 30]]);
    expect(r.monto).toBe(113.33);
    expect(valorizar(l, [], 2.5).monto).toBe(108.33);
    expect(() => valorizar(l, [{ clave: "tornillo", precio: 2.5 }])).toThrow(FaltaPrecioError);
  });

  it("10 · la huella cambia con el precio general y no cambia sin él (las de ayer siguen valiendo)", () => {
    const a = { precios: [{ clave: "tornillo", precio: 1.2 }], montoVisto: 10, idempotencyKey: "clave-123456", version: 1 };
    expect(huellaAplicar(a)).toBe("aplicar|tornillo=1.2000|10.00|v1|");
    expect(huellaAplicar({ ...a, precioGeneral: 2 })).not.toBe(huellaAplicar({ ...a, precioGeneral: 2.1 }));
    expect(aplicarCubicacionSchema.safeParse({ ...a, precios: [] }).success).toBe(false);
    const soloGeneral = aplicarCubicacionSchema.safeParse({ ...a, precios: undefined, precioGeneral: 4 });
    expect(soloGeneral.success && soloGeneral.data.precios).toEqual([]);
  });
});

describe("GTF real de Blas · 019-001-0000001 (22 trozas, 20,303 m³ declarados)", () => {
  /* D1 mayor, D2 menor y largo en metros, como los guarda `ForestGtf.items` (SELECT de sólo lectura, 08-10). */
  const ITEMS: Array<[number, number, number]> = [
    [0.56, 0.52, 3.1], [0.49, 0.43, 3.12], [0.62, 0.6, 3.52], [0.65, 0.61, 3.52], [1.1, 0.94, 3.14], [0.67, 0.63, 3.19],
    [0.66, 0.64, 3.1], [0.46, 0.36, 3.17], [0.62, 0.6, 2.71], [0.83, 0.63, 3.27], [0.59, 0.57, 3.15], [0.58, 0.5, 2.78],
    [0.96, 0.85, 2.4], [0.65, 0.57, 3.12], [0.6, 0.57, 2.61], [0.46, 0.45, 3.27], [0.42, 0.37, 3.22], [0.52, 0.45, 2.61],
    [0.87, 0.85, 2.62], [0.81, 0.81, 2.33], [0.41, 0.41, 3.18], [0.45, 0.4, 3.77],
  ];

  it("11 · prellenado a 1 decimal y Oxapampina bruta: 5 360,24 PT (sin redondear las medidas, 5 364,42)", () => {
    expect([pulgadasDeMetros(0.56), pulgadasDeMetros(1.1), piesDeMetros(3.1), piesDeMetros(3.77)]).toEqual([22, 43.3, 10.2, 12.4]);
    const trozas = ITEMS.map(([may, men, l]) => ({ especie: "TORNILLO", d1: pulgadasDeMetros(may), d2: pulgadasDeMetros(men), largo: piesDeMetros(l) }));
    const r = cubicarTrozasComercial("oxapampina", trozas, 2);
    /* El redondeo del prellenado baja 4,18 PT (0,08 %): la cinta manda, la guía sólo prellena. */
    expect(r.neto).toBe(5360.24);
    expect(Math.abs(r.neto - 5364.42) / 5364.42).toBeLessThan(0.001);
    expect(r.bruto).toBe(r.neto);
    /* Lo declarado pasado a PT es un derivado (×424) y queda 37,7 % arriba: nunca se paga con él. */
    expect(ptSugeridoDeM3(20.303)).toBe(8608.47);
  });
});

describe("unidades, líneas por especie y Zod de la aserrada", () => {
  it("12 · tablar = PT a 2; smalian = m³ a 4", () => {
    expect(unidadesComercial("tablar")).toEqual({ volumen: "PT", decimales: 2, nombre: "Pie tablar (aserrada)" });
    expect(unidadesComercial("smalian")).toMatchObject({ volumen: "m³", decimales: 4 });
  });

  it("piezas uno por uno: bruto, neto por pieza y n = piezas; el lote baja por especie", () => {
    const r = cubicarPiezasComercial([pieza(10, { descuento: { descartadas: 2 } }), pieza(5, { especie: "Cumala" })], { porEspecie: [{ clave: "cumala", pct: 10 }] });
    expect(r.piezas.map((p) => [p.bruto, p.volumen, p.descuento ?? null])).toEqual([[133.33, 106.67, { descartadas: 2 }], [66.67, 66.67, null]]);
    expect([r.bruto, r.neto]).toEqual([200, 166.67]);
    expect(lineasDeEspecie({ material: "aserrada", modo: "pieza", formula: "tablar", trozas: r.piezas }).map((l) => [l.clave, l.n, l.volumen])).toEqual([
      ["tornillo", 10, 106.67],
      ["cumala", 5, 66.67],
    ]);
  });

  it("el Zod de la aserrada: persona, despacho con id, uno por uno con piezas o una guardada (no las dos), rápida sin piezas", () => {
    const base = { material: "aserrada", fecha: "2026-10-08", beneficiarioId: "b1" };
    const ok = (x: Record<string, unknown>) => guardarAserradaSchema.safeParse({ ...base, ...x }).success;
    expect(ok({ modo: "total", lineas: [{ especie: "General", pt: 100 }] })).toBe(true);
    expect(ok({ modo: "total", lineas: [{ especie: "General", pt: 100 }], beneficiarioId: undefined })).toBe(false);
    expect(ok({ modo: "total", lineas: [] })).toBe(false);
    expect(ok({ modo: "pieza", cubicacionRefId: "kv-1" })).toBe(true);
    expect(ok({ modo: "pieza", cubicacionRefId: "kv-1", piezas: [pieza(1)] })).toBe(false);
    expect(ok({ modo: "pieza" })).toBe(false);
    expect(ok({ modo: "total", origen: "despacho", lineas: [{ especie: "General", pt: 1 }] })).toBe(false);
    const venta = guardarAserradaSchema.safeParse({ ...base, modo: "total", lineas: [{ especie: "General", pt: 1 }] });
    expect(venta.success && venta.data.sentido).toBe("venta");
  });
});
