/**
 * __tests__/forestal-declarar-produccion.test.ts
 *
 * El contrato de «Declarar producción» en su propio modal (ADR-429): una
 * corrida por especie, resumen especie × tipo, precio por especie sin fingir
 * ceros, detalle ordenado y el pedido que valida el servidor.
 */
import { describe, expect, it } from "vitest";
import {
  armarPedido,
  paquetesDeLoCubicado,
  corridasPorEspecie,
  importe,
  ordenarDetalle,
  precioValido,
  produccionSinLoteSchema,
  resumenEspecieTipo,
  valorizar,
  type PaqueteDeclarable,
} from "@/lib/forestal/declarar-produccion";

const paq = (codigo: string, especie: string, tipo: string, cantidad: number, pt: number, m3: number, e = 5.08, a = 20.32, l = 3.05): PaqueteDeclarable => ({
  codigo, productType: "MADERA ASERRADA", tipo, presentacion: "PIEZAS", cantidad, volumenM3: m3,
  espesorCm: e, anchoCm: a, largoM: l, medida: "2×8×10", especie, pieTablar: pt,
});

const lote = [
  paq("A1", "Panguana", "Tabla", 10, 40, 0.0944),
  paq("A2", "Tornillo", "Comercial", 5, 66.67, 0.1573),
  paq("A3", "PANGUANA", "Comercial", 4, 53.33, 0.1258),
  paq("A4", "Panguana", "Tabla", 2, 8, 0.0189, 2.54),
];

describe("una corrida por especie", () => {
  it("agrupa por especie sin separar mayúsculas y suma piezas, PT y m³", () => {
    const c = corridasPorEspecie(lote);
    expect(c.map((x) => x.especie)).toEqual(["Panguana", "Tornillo"]);
    expect(c[0]).toMatchObject({ piezas: 16, pt: 101.33, m3: 0.2391 });
    expect(c[0].paquetes.map((p) => p.codigo)).toEqual(["A1", "A3", "A4"]);
  });

  it("lo que no tiene especie queda aparte con especie vacía (la pantalla no deja declararlo)", () => {
    const c = corridasPorEspecie([...lote, paq("A5", "  ", "Tabla", 1, 4, 0.01)]);
    expect(c[c.length - 1]).toMatchObject({ especie: "", piezas: 1 });
  });
});

describe("resumen especie × tipo", () => {
  it("filas por tipo en el orden comercial de siempre, subtotal por especie y total", () => {
    const r = resumenEspecieTipo(lote);
    expect(r.especies.map((e) => e.especie)).toEqual(["Panguana", "Tornillo"]);
    expect(r.especies[0].filas.map((f) => `${f.tipo}:${f.piezas}:${f.pt}`)).toEqual(["Comercial:4:53.33", "Tabla:12:48"]);
    expect(r.total).toEqual({ piezas: 21, pt: 168, m3: 0.3964 });
  });
});

describe("precio por especie", () => {
  it("vacío, cero o negativo es «sin precio», no cero", () => {
    expect(precioValido("")).toBeNull();
    expect(precioValido(0)).toBeNull();
    expect(precioValido("-3")).toBeNull();
    expect(precioValido("2,5")).toBe(2.5);
    expect(importe(100, null)).toBeNull();
    expect(importe(101.33, 2.5)).toBe(253.33);
  });

  it("valoriza lo que tiene precio y nombra lo que no", () => {
    const r = resumenEspecieTipo(lote);
    expect(valorizar(r.especies, { panguana: 2.5 })).toEqual({ total: 253.33, sinPrecio: ["Tornillo"] });
    expect(valorizar(r.especies, {})).toEqual({ total: null, sinPrecio: ["Panguana", "Tornillo"] });
  });
});

describe("detalle ordenado", () => {
  it("especie → tipo → espesor → ancho → largo", () => {
    expect(ordenarDetalle(lote).map((p) => p.codigo)).toEqual(["A3", "A4", "A1", "A2"]);
  });
});

describe("el pedido", () => {
  it("madera propia: una corrida por especie con su precio; valida contra el esquema", () => {
    const pedido = armarPedido({ paquetes: lote, fecha: "2026-09-22", servicio: { tipo: "propia", precios: { panguana: 2.5 } } });
    expect(pedido.corridas.map((c) => `${c.especie}:${c.paquetes.length}`)).toEqual(["Panguana:3", "Tornillo:1"]);
    expect(pedido.servicio).toEqual({ tipo: "propia", preciosVentaPt: [{ especie: "Panguana", precioPt: 2.5 }, { especie: "Tornillo", precioPt: null }] });
    expect(produccionSinLoteSchema.safeParse(pedido).success).toBe(true);
  });

  it("servicio a tercero: lleva la cuenta y el trato por especie", () => {
    const pedido = armarPedido({ paquetes: lote, fecha: "2026-09-22", servicio: { tipo: "tercero", parteId: "p1", precios: { tornillo: 0.9 } } });
    expect(pedido.servicio).toEqual({ tipo: "tercero", parteId: "p1", preciosManualPt: [{ especie: "Panguana", precioPt: null }, { especie: "Tornillo", precioPt: 0.9 }] });
    expect(produccionSinLoteSchema.safeParse(pedido).success).toBe(true);
  });

  it("el esquema rechaza lo que no se puede declarar", () => {
    const base = armarPedido({ paquetes: lote, fecha: "2026-09-22", servicio: { tipo: "propia", precios: {} } });
    expect(produccionSinLoteSchema.safeParse({ ...base, fecha: "22/09/2026" }).success).toBe(false);
    expect(produccionSinLoteSchema.safeParse({ ...base, corridas: [] }).success).toBe(false);
    expect(produccionSinLoteSchema.safeParse({ ...base, corridas: [{ especie: "", paquetes: base.corridas[0].paquetes }] }).success).toBe(false);
    expect(produccionSinLoteSchema.safeParse({ ...base, servicio: { tipo: "tercero", parteId: "", preciosManualPt: [] } }).success).toBe(false);
    expect(produccionSinLoteSchema.safeParse({ ...base, servicio: { tipo: "propia", preciosVentaPt: [{ especie: "Panguana", precioPt: 0 }] } }).success).toBe(false);
    // una escuadría minúscula no entra (guardaba 0,00 cm y agrandaba la tolerancia del PT)
    const diminuto = { ...base.corridas[0].paquetes[0], espesorCm: 0.001 };
    expect(produccionSinLoteSchema.safeParse({ ...base, corridas: [{ especie: "Panguana", paquetes: [diminuto] }] }).success).toBe(false);
  });
});

describe("paquetesDeLoCubicado respeta la unidad de cada medida", () => {
  const base = { id: "p-1-0", cantidad: 3, pieTablar: 10, m3: 0.0236, especie: "Tornillo" };
  it("pulgadas y pies como siempre; cm y m sin pasarlos por pulgadas", () => {
    const [enPulg] = paquetesDeLoCubicado([{ ...base, espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" }], { hoy: new Date("2026-09-22T12:00:00Z") });
    expect([enPulg.espesorCm, enPulg.anchoCm, enPulg.largoM]).toEqual([5.08, 20.32, 3.05]);
    const [enCm] = paquetesDeLoCubicado([{ ...base, espesor: 5, ancho: 20, largo: 3, uEspesor: "cm", uAncho: "cm", uLargo: "m" }], { hoy: new Date("2026-09-22T12:00:00Z") });
    expect([enCm.espesorCm, enCm.anchoCm, enCm.largoM]).toEqual([5, 20, 3]);
  });
});

describe("una especie sin letras no es una especie", () => {
  it("«-» y «—» van al grupo sin especie (la pantalla bloquea antes del 422 del servidor)", () => {
    const c = corridasPorEspecie([paq("B1", "-", "Tabla", 1, 4, 0.0094), paq("B2", "—", "Tabla", 1, 4, 0.0094), paq("B3", "Tornillo", "Tabla", 1, 4, 0.0094)]);
    expect(c.map((x) => `${x.especie || "(sin)"}:${x.paquetes.length}`)).toEqual(["(sin):2", "Tornillo:1"]);
  });
});
