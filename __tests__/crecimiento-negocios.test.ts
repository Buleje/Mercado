import { describe, expect, it } from "vitest";
import {
  armarMesesDeNegocio,
  calcularArranque,
  etiquetaMes,
  inicioDeMesUTC,
  mesesLima,
  perfilDeNegocio,
  variacionPct,
  type FilaMensual,
  type HechosDeNegocio,
} from "@/lib/superadmin/crecimiento-negocios";

const sinNada: HechosDeNegocio = {
  productos: false, pedidos: false, ventas: false, libroCtp: false,
  trozas: false, lotes: false, gtfIngreso: false, gtfSalida: false,
};

describe("perfilDeNegocio", () => {
  it("movimiento forestal sin pedidos = aserradero (caso Blas: bodega en el rubro, 6 ventas POS)", () => {
    expect(perfilDeNegocio({ ...sinNada, ventas: true, productos: true, libroCtp: true, gtfIngreso: true })).toBe("aserradero");
  });
  it("con un pedido es tienda aunque tenga libro de prueba (caso main)", () => {
    expect(perfilDeNegocio({ ...sinNada, pedidos: true, libroCtp: true, lotes: true })).toBe("tienda");
  });
  it("sin nada es tienda", () => {
    expect(perfilDeNegocio(sinNada)).toBe("tienda");
  });
});

describe("calcularArranque", () => {
  it("aserradero completo = 5 de 5 sin pedido ni venta", () => {
    const h = { ...sinNada, libroCtp: true, gtfIngreso: true, lotes: true, gtfSalida: true };
    const a = calcularArranque("aserradero", h, true);
    expect(a.pasos).toEqual(["logo", "ingreso", "libro", "lote", "guia"]);
    expect([a.done, a.total, a.pct, a.complete, a.stuckAt]).toEqual([5, 5, 100, true, null]);
  });
  it("aserradero: el ingreso vale con trozas o con guía de ingreso", () => {
    expect(calcularArranque("aserradero", { ...sinNada, trozas: true }, false).steps.ingreso).toBe(true);
    expect(calcularArranque("aserradero", { ...sinNada, gtfIngreso: true }, false).steps.ingreso).toBe(true);
  });
  it("aserradero estancado: marca el primer paso que falta", () => {
    const a = calcularArranque("aserradero", { ...sinNada, gtfIngreso: true }, true);
    expect([a.done, a.stuckAt]).toEqual([2, "libro"]);
  });
  it("tienda mantiene sus 4 pasos de siempre", () => {
    const a = calcularArranque("tienda", { ...sinNada, productos: true, ventas: true }, true);
    expect(a.steps).toEqual({ logo: true, productos: true, pedido: false, venta: true });
    expect([a.done, a.total, a.stuckAt]).toEqual([3, 4, "pedido"]);
  });
});

describe("meses de Lima", () => {
  it("lista 6 meses del más viejo al actual", () => {
    expect(mesesLima(6, new Date("2026-11-04T12:00:00Z"))).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
  });
  it("a las 02:00 UTC del 1.º aún es el mes anterior en Lima", () => {
    expect(mesesLima(1, new Date("2026-11-01T02:00:00Z"))).toEqual(["2026-10"]);
  });
  it("cruza el año", () => {
    expect(mesesLima(3, new Date("2027-01-15T12:00:00Z"))).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
  it("el mes de Lima empieza a las 05:00 UTC", () => {
    expect(inicioDeMesUTC("2026-06").toISOString()).toBe("2026-06-01T05:00:00.000Z");
  });
  it("etiqueta corta en español", () => {
    expect(etiquetaMes("2026-06")).toBe("jun 26");
  });
});

describe("variacionPct", () => {
  it("anterior 0 y actual >0 = 100; ambos 0 = 0; baja = negativo", () => {
    expect(variacionPct(0, 5)).toBe(100);
    expect(variacionPct(0, 0)).toBe(0);
    expect(variacionPct(10, 5)).toBe(-50);
  });
});

describe("armarMesesDeNegocio", () => {
  const claves = ["2026-09", "2026-10", "2026-11"];
  const f = (mes: string, fuente: FilaMensual["fuente"], n: number, total = 0): FilaMensual => ({ tenantId: "t", mes, fuente, n, total });
  it("un aserradero suma operaciones del libro y trozas; los pedidos en cero no lo ocultan", () => {
    const m = armarMesesDeNegocio(claves, [f("2026-10", "libroCtp", 40), f("2026-10", "trozas", 3), f("2026-11", "libroCtp", 10)]);
    expect(m.map((x) => x.operaciones)).toEqual([0, 43, 10]);
    expect(m.map((x) => x.orders)).toEqual([0, 0, 0]);
    expect(m[1].month).toBe("oct 26");
  });
  it("los ingresos salen solo de pedidos; la venta POS cuenta como operación, no como ingreso", () => {
    const m = armarMesesDeNegocio(claves, [f("2026-11", "pedidos", 2, 150.456), f("2026-11", "ventas", 3, 999)]);
    expect(m[2]).toMatchObject({ revenue: 150.46, orders: 2, operaciones: 5 });
  });
  it("ignora filas fuera de la ventana", () => {
    expect(armarMesesDeNegocio(claves, [f("2026-01", "pedidos", 9, 100)]).every((x) => x.operaciones === 0)).toBe(true);
  });
});
