/**
 * ADR-484 · la parte pura de «lo que el adelanto no cubre va a la cuenta» y
 * «la venta llena el valor de venta del despacho vacío».
 */
import { describe, expect, it } from "vitest";
import {
  etiquetaPersonaCubicacion,
  partirCentimos,
  patasDeCuenta,
  repartirValorVenta,
  separarImputacion,
  textoValorVenta,
  type LineaDespachoValor,
} from "@/lib/forestal/cubicacion-a-cuenta";
import { huellaAplicar, type LineaEspecie } from "@/lib/forestal/cubicacion-cuenta";

const especie = (clave: string, monto: number): LineaEspecie => ({ clave, nombre: clave, n: 1, volumen: 1, precio: monto, monto });
const linea = (id: string, extra: Partial<LineaDespachoValor> = {}): LineaDespachoValor => ({
  id, especie: "Tornillo", cantidad: 1, unidad: "m3", valorVenta: null, moneda: "PEN", ...extra,
});
const sumaPatas = (p: ReturnType<typeof patasDeCuenta>) => Math.round(p.reduce((t, x) => t + (x.tipo === "cargo" ? x.monto : -x.monto), 0) * 100) / 100;

describe("patasDeCuenta", () => {
  const base = { codigo: "CUB-2026-0007", detalle: "Madera · CUB-2026-0007 · 3 trozas · 604,73 PT", adelantos: ["ADL-0001"] };
  it("venta sin adelanto: un cargo `venta` por todo (te debe)", () => {
    const p = patasDeCuenta({ ...base, sentido: "venta", total: 1200, resto: 1200, adelantos: [] });
    expect(p).toEqual([{ tipo: "cargo", concepto: "venta", monto: 1200, notas: base.detalle }]);
  });
  it("venta que el adelanto cubre a medias: la venta entera y el cruce; el saldo sube sólo el resto", () => {
    const p = patasDeCuenta({ ...base, sentido: "venta", total: 1000, resto: 400 });
    expect(p.map((x) => [x.tipo, x.concepto, x.monto])).toEqual([["cargo", "venta", 1000], ["abono", "compensacion", 600]]);
    expect(sumaPatas(p)).toBe(400);
    expect(p[1].notas).toBe("Cruce con ADL-0001 · CUB-2026-0007 (lo que te adelantó)");
  });
  it("compra con el DADO excedido (B1): la madera entera de abono y el cruce de cargo; el saldo baja el resto (le debes)", () => {
    const p = patasDeCuenta({ ...base, sentido: "compra", total: 7000, resto: 752 });
    expect(p.map((x) => [x.tipo, x.concepto, x.monto])).toEqual([["abono", "madera", 7000], ["cargo", "compensacion", 6248]]);
    expect(sumaPatas(p)).toBe(-752);
  });
  it("toda nota lleva el código de la cubicación (lo que mira el freno de la cuenta)", () => {
    const p = patasDeCuenta({ ...base, detalle: "3 trozas", sentido: "compra", total: 10, resto: 4 });
    expect(p.every((x) => x.notas.includes("CUB-2026-0007"))).toBe(true);
  });
});

describe("huella de aplicar", () => {
  it("`adelantoIds: []` (ninguno) no es lo mismo que sin el campo (todos)", () => {
    const base = { precios: [{ clave: "tornillo", precio: 5 }], montoVisto: 10, idempotencyKey: "clave-123456", version: 1 };
    expect(huellaAplicar({ ...base, adelantoIds: [] })).not.toBe(huellaAplicar(base));
  });
});

describe("partirCentimos", () => {
  it("cierra exacto por el mayor resto", () => {
    expect(partirCentimos(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(partirCentimos(1001, [0.5, 300])).toEqual([2, 999]);
    expect(partirCentimos(10, [0, 0])).toEqual([5, 5]);
  });
});

describe("repartirValorVenta", () => {
  it("una línea vacía → el total", () => {
    expect(repartirValorVenta(1234.56, [linea("d1")], [])).toEqual({ estado: "puesto", lineas: [{ despachoId: "d1", valor: 1234.56 }], previo: null, diferencia: null });
  });
  it("con valor no se pisa: muestra la diferencia; a medias no se toca nada", () => {
    expect(repartirValorVenta(1000, [linea("d1", { valorVenta: 900 })], [])).toEqual({ estado: "ya_tenia", lineas: [], previo: 900, diferencia: 100 });
    expect(repartirValorVenta(1000, [linea("d1", { valorVenta: 900 }), linea("d2")], []).estado).toBe("incompleto");
  });
  it("varias líneas, una por especie de la cubicación → el monto de cada especie", () => {
    const r = repartirValorVenta(
      1500,
      [linea("d1", { especie: "TORNILLO", cantidad: 0.5 }), linea("d2", { especie: "Cumala", cantidad: 300, unidad: "pt" })],
      [especie("tornillo", 1000), especie("cumala", 500)],
    );
    expect(r.lineas).toEqual([{ despachoId: "d1", valor: 1000 }, { despachoId: "d2", valor: 500 }]);
  });
  it("especies que no calzan → por cantidad en la misma unidad; unidades mezcladas → no se reparte", () => {
    const r = repartirValorVenta(100, [linea("d1", { cantidad: 1 }), linea("d2", { cantidad: 2 })], [especie("cumala", 100)]);
    expect(r.lineas.map((l) => l.valor)).toEqual([33.33, 66.67]);
    const mezcla = repartirValorVenta(100, [linea("d1", { especie: "x" }), linea("d2", { especie: "y", unidad: "pt" })], [especie("cumala", 100)]);
    expect(mezcla.estado).toBe("sin_reparto");
  });
  it("otra moneda → no se toca", () => {
    expect(repartirValorVenta(100, [linea("d1", { moneda: "USD" })], []).estado).toBe("otra_moneda");
  });
});

describe("separarImputacion y textos", () => {
  it("los adelantos de siempre, la cuenta y el valor de venta, cada uno en su campo", () => {
    const adel = { adelantoId: "a1", codigoOperacion: "ADL-1", monto: 10, volumen: 1, excedido: false, entregaId: "e1" };
    const cuenta = { tipo: "cuenta", parteId: "p1", parteNombre: "Juan", monto: 5, volumen: 0.5, sentido: "venta", movIds: ["m1"] };
    const vv = { tipo: "valorVenta", estado: "puesto", lineas: [{ despachoId: "d1", valor: 15 }], previo: null, diferencia: null };
    const r = separarImputacion([adel, cuenta, vv]);
    expect(r.adelantos).toEqual([adel]);
    expect(r.cuenta?.movIds).toEqual(["m1"]);
    expect(r.valorVenta?.estado).toBe("puesto");
    expect(separarImputacion(null)).toEqual({ adelantos: null, cuenta: null, valorVenta: null });
  });
  it("textoValorVenta dice de dónde salió y la diferencia", () => {
    expect(textoValorVenta({ tipo: "valorVenta", estado: "puesto", lineas: [{ despachoId: "d1", valor: 1200 }], previo: null, diferencia: null }, "CUB-2026-0007")).toMatch(
      /quedó en S\/\s?1,?200\.00: salió de CUB-2026-0007/,
    );
    expect(textoValorVenta({ tipo: "valorVenta", estado: "ya_tenia", lineas: [], previo: 900, diferencia: 100 }, "CUB-1")).toMatch(/no se tocó.*100\.00 más/);
  });
});

describe("etiquetaPersonaCubicacion (el selector de persona)", () => {
  const p = {
    nombre: "Wasaco", beneficiarioId: "b1",
    adelantos: { teDebe: 1200, abiertos: 2, recibidoPendiente: 0, recibidosAbiertos: 0 },
    cuenta: -300,
  };
  it("compra: lo que le adelantaste (te debe) y su cuenta", () => {
    expect(etiquetaPersonaCubicacion(p, "compra")).toMatch(/^Wasaco · 2 adelantos · te debe S\/\s?1,?200\.00 · en su cuenta le debes S\/\s?300\.00$/);
  });
  it("venta: NUNCA el «te debe» de lo que tú le diste; sólo lo que él te adelantó", () => {
    expect(etiquetaPersonaCubicacion(p, "venta")).toMatch(/^Wasaco · sin adelanto · en su cuenta le debes/);
    const conRecibido = { ...p, adelantos: { ...p.adelantos, recibidoPendiente: 500, recibidosAbiertos: 1 }, cuenta: 0 };
    expect(etiquetaPersonaCubicacion(conRecibido, "venta")).toMatch(/^Wasaco · te adelantó S\/\s?500\.00$/);
  });
  it("sin ficha en el directorio y sin adelanto lo dice; tu rol sin plata ve sólo el nombre", () => {
    expect(etiquetaPersonaCubicacion({ ...p, adelantos: null, beneficiarioId: null, cuenta: null }, "venta")).toBe("Wasaco · sin adelanto · sin cuenta en el directorio");
    expect(etiquetaPersonaCubicacion({ nombre: "Wasaco", beneficiarioId: "b1" }, "venta")).toBe("Wasaco");
  });
});
