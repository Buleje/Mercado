/**
 * ADR-478 · la parte pura de «cubicación → cuenta»: re-cubicar en el servidor,
 * valorizar al céntimo y repartir FIFO entre los adelantos abiertos.
 */
import { describe, expect, it } from "vitest";
import {
  FaltaPrecioError,
  MedidaFueraDeRangoError,
  agruparPorEspecie,
  aplicarCubicacionSchema,
  cubicarEnServidor,
  descripcionEntregaMadera,
  fmtVolumen,
  guardarCubicacionSchema,
  huellaAplicar,
  repartirConCuenta,
  valorizar,
  type AdelantoAbierto,
  type LineaEspecie,
} from "@/lib/forestal/cubicacion-cuenta";
import { conVolumen } from "@/lib/forestal/cubicacion-trozas-formula";

const linea = (clave: string, nombre: string, volumen: number): LineaEspecie => ({ clave, nombre, n: 1, volumen, precio: null, monto: null });
const ad = (id: string, fecha: string, saldo: number, direccion: "DADO" | "RECIBIDO" = "DADO"): AdelantoAbierto => ({
  id,
  codigoOperacion: `ADL-${id}`,
  fecha: `${fecha}T15:00:00.000Z`,
  saldo,
  direccion,
});

describe("cubicarEnServidor", () => {
  it("ignora el volumen del cliente y coincide con conVolumen (Smalian, 2 Ø)", () => {
    const entrada = [{ especie: "Tornillo", d1: 40, d2: 44, largo: 3.5, m3: 99, pt: 99 }] as unknown as Parameters<typeof cubicarEnServidor>[1];
    const r = cubicarEnServidor("smalian", entrada, 2);
    const esperado = conVolumen("smalian", { id: "x", d1: 40, d2: 44, largo: 3.5 }).m3;
    expect(r.trozas[0].volumen).toBe(esperado);
    expect(r.volumen).toBe(esperado);
    expect(r.trozas[0]).not.toHaveProperty("m3");
  });

  it("Oxapampina con 1 Ø: la troza queda pareja aunque el cliente mande otro d2", () => {
    const r = cubicarEnServidor("oxapampina", [{ especie: "Cumala", d1: 20, d2: 35, largo: 12 }], 1);
    expect(r.trozas[0].d2).toBe(20);
    expect(r.trozas[0].volumen).toBe(conVolumen("oxapampina", { id: "x", d1: 20, d2: 20, largo: 12 }).pt);
    expect(r.volumen).toBeCloseTo(195.92, 2);
  });

  it("Ø o largo por encima del tope de la fórmula → error con el número de troza; por debajo del mínimo, marcada", () => {
    expect(() => cubicarEnServidor("smalian", [{ especie: "A", d1: 40, largo: 3 }, { especie: "A", d1: 250, largo: 3 }])).toThrow(MedidaFueraDeRangoError);
    try {
      cubicarEnServidor("oxapampina", [{ especie: "A", d1: 20, largo: 60 }], 1);
    } catch (e) {
      expect(e).toBeInstanceOf(MedidaFueraDeRangoError);
      expect((e as MedidaFueraDeRangoError).n).toBe(1);
    }
    const r = cubicarEnServidor("smalian", [{ especie: "A", d1: 8, d2: 9, largo: 3 }]);
    expect(r.trozas[0].sospechosa).toBe(true);
  });
});

describe("valorizar", () => {
  it("cierra al céntimo con 3 especies y precios con decimales (medio céntimo hacia arriba)", () => {
    const { porEspecie, monto } = valorizar(
      [linea("tornillo", "Tornillo", 33.33), linea("cumala", "Cumala", 67.89), linea("lupuna", "Lupuna", 100.5)],
      [{ clave: "Tornillo", precio: 2.5 }, { clave: "CUMALA", precio: 0.95 }, { clave: "lupuna", precio: 1.2 }],
    );
    expect(porEspecie.map((l) => l.monto)).toEqual([83.33, 64.5, 120.6]);
    expect(monto).toBe(268.43);
    expect(Math.round(porEspecie.reduce((t, l) => t + (l.monto ?? 0), 0) * 100) / 100).toBe(monto);
  });

  it("una especie con volumen y sin precio → error con su nombre", () => {
    expect(() => valorizar([linea("tornillo", "Tornillo", 10), linea("cumala", "Cumala", 5)], [{ clave: "tornillo", precio: 1 }])).toThrow(
      new FaltaPrecioError("Cumala"),
    );
  });

  it("agrupa por especie sin tildes ni mayúsculas", () => {
    const r = cubicarEnServidor("smalian", [
      { especie: "Capirona", d1: 30, largo: 3 },
      { especie: "CAPIRONA ", d1: 30, largo: 3 },
      { especie: "Tornillo", d1: 50, largo: 4 },
    ]);
    const g = agruparPorEspecie(r.trozas, "smalian");
    expect(g.map((l) => [l.clave, l.n])).toEqual([["tornillo", 1], ["capirona", 2]]);
  });
});

describe("repartirConCuenta (ADR-484: cada adelanto hasta su saldo, el resto a la cuenta)", () => {
  it("1 adelanto, monto exacto: nada a la cuenta", () => {
    const r = repartirConCuenta(1000, 50, [ad("a1", "2026-09-01", 1000)]);
    expect(r.partes).toEqual([{ adelantoId: "a1", codigoOperacion: "ADL-a1", monto: 1000, volumen: 50, excedido: false }]);
    expect(r.aCuenta).toBeNull();
  });

  it("caso Wasaco: 3 adelantos (S/ 6 248), el más antiguo primero", () => {
    const abiertos = [ad("a3", "2026-09-20", 1248), ad("a1", "2026-08-01", 2000), ad("a2", "2026-09-01", 3000)];
    const r = repartirConCuenta(4500, 2140, abiertos, 2);
    expect(r.partes.map((i) => [i.adelantoId, i.monto])).toEqual([["a1", 2000], ["a2", 2500]]);
    expect(r.partes.reduce((t, i) => t + i.volumen, 0)).toBeCloseTo(2140, 6);
    expect(r.aCuenta).toBeNull();
  });

  it("B1 cerrado: DADO con sobrante → ninguno queda excedido, el resto va a la cuenta con su parte del volumen", () => {
    const abiertos = [ad("a1", "2026-08-01", 2000), ad("a2", "2026-09-01", 3000), ad("a3", "2026-09-20", 1248)];
    const r = repartirConCuenta(7000, 3333.33, abiertos, 2);
    expect(r.partes.map((i) => [i.adelantoId, i.monto, i.excedido])).toEqual([["a1", 2000, false], ["a2", 3000, false], ["a3", 1248, false]]);
    expect(r.aCuenta?.monto).toBe(752);
    expect(Math.round((r.partes.reduce((t, i) => t + i.volumen, 0) + (r.aCuenta?.volumen ?? 0)) * 100) / 100).toBe(3333.33);
    expect(Math.round((r.partes.reduce((t, i) => t + i.monto, 0) + (r.aCuenta?.monto ?? 0)) * 100) / 100).toBe(7000);
  });

  it("RECIBIDO con más madera que lo que te adelantó → se devuelve todo y el resto queda debiéndote", () => {
    const r = repartirConCuenta(1500, 10, [ad("r1", "2026-09-01", 1000, "RECIBIDO")]);
    expect(r.partes.map((i) => [i.adelantoId, i.monto])).toEqual([["r1", 1000]]);
    expect(r.aCuenta).toEqual({ monto: 500, volumen: 3.3333 });
  });

  it("sin adelantos → todo a la cuenta; un adelanto sin saldo no toma nada", () => {
    expect(repartirConCuenta(10, 1, [])).toEqual({ partes: [], aCuenta: { monto: 10, volumen: 1 } });
    expect(repartirConCuenta(10, 1, [ad("x", "2026-01-01", -5)])).toEqual({ partes: [], aCuenta: { monto: 10, volumen: 1 } });
    expect(repartirConCuenta(0, 1, [])).toEqual({ partes: [], aCuenta: null });
  });

  it("el volumen prorrateado (m³, 4 decimales) suma el total exacto", () => {
    const r = repartirConCuenta(100, 1.2345, [ad("a", "2026-01-01", 33.33), ad("b", "2026-01-02", 33.33), ad("c", "2026-01-03", 33.34)], 4);
    expect(Math.round(r.partes.reduce((t, i) => t + i.volumen, 0) * 10000) / 10000).toBe(1.2345);
    expect(r.aCuenta).toBeNull();
  });
});

describe("Zod y textos", () => {
  const base = { fecha: "2026-10-08", formula: "oxapampina", diametros: 1, beneficiarioId: "b1", trozas: [{ especie: "Tornillo", d1: 20, largo: 12 }] };
  it("rechaza trozas vacías, fecha mal y sin persona; acepta lo normal con sentido compra por defecto", () => {
    expect(guardarCubicacionSchema.safeParse({ ...base, trozas: [] }).success).toBe(false);
    expect(guardarCubicacionSchema.safeParse({ ...base, fecha: "08/10/2026" }).success).toBe(false);
    /* Revisión M: el 31-02 se corría al 02-03, el mes 13 daba Invalid Date (503) y el servidor aceptaba mañana. */
    for (const fecha of ["2026-02-31", "2026-13-01", "2999-01-01"]) {
      const r = guardarCubicacionSchema.safeParse({ ...base, fecha });
      expect(r.success, fecha).toBe(false);
      if (!r.success) expect(r.error.issues.map((i) => i.message).join(" ")).toMatch(/no existe|mañana/);
    }
    expect(guardarCubicacionSchema.safeParse({ ...base, fecha: "2024-02-29" }).success).toBe(true);
    expect(guardarCubicacionSchema.safeParse({ ...base, beneficiarioId: undefined }).success).toBe(false);
    const ok = guardarCubicacionSchema.safeParse(base);
    expect(ok.success && ok.data.sentido).toBe("compra");
    /* La pantalla manda los opcionales vacíos: "" o null = ausente. */
    const vacios = guardarCubicacionSchema.safeParse({ ...base, parteId: "", gtfNumber: null, trozas: [{ especie: "Tornillo", d1: 20, d2: null, largo: 12 }] });
    expect(vacios.success && [vacios.data.parteId, vacios.data.gtfNumber]).toEqual([undefined, undefined]);
    expect(guardarCubicacionSchema.safeParse({ ...base, beneficiarioId: "" }).success).toBe(false);
  });

  it("aplicar: precio 0 no pasa; la huella cambia con el precio", () => {
    const a = { precios: [{ clave: "tornillo", precio: 1.2 }], montoVisto: 10, idempotencyKey: "clave-123456", version: 1 };
    expect(aplicarCubicacionSchema.safeParse({ ...a, precios: [{ clave: "tornillo", precio: 0 }] }).success).toBe(false);
    expect(huellaAplicar(a)).not.toBe(huellaAplicar({ ...a, precios: [{ clave: "tornillo", precio: 1.3 }] }));
    expect(huellaAplicar(a)).toBe(huellaAplicar({ ...a, precios: [{ clave: "Tornillo", precio: 1.2 }] }));
  });

  it("descripción de la entrega como se escribe en el papel", () => {
    expect(fmtVolumen(2140, "oxapampina")).toBe("2 140 PT");
    expect(fmtVolumen(12.3456, "smalian")).toBe("12,346 m³");
    expect(descripcionEntregaMadera({ codigo: "CUB-2026-0003", nTrozas: 34, volumen: 2140, formula: "oxapampina" })).toBe(
      "Madera · CUB-2026-0003 · 34 trozas · 2 140 PT",
    );
    expect(descripcionEntregaMadera({ codigo: "CUB-2026-0003", nTrozas: 1, volumen: 5.5, formula: "oxapampina" }, { i: 2, de: 3 })).toBe(
      "Madera · CUB-2026-0003 · 1 troza · 5,5 PT · parte 2 de 3",
    );
  });
});
