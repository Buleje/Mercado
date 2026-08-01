import { describe, it, expect } from "vitest";
import {
  TIPO_SUGERIDO,
  calcularSaldo,
  corridaDeSaldos,
  fletesSinCargar,
  leerSaldo,
  movimientoInputSchema,
  saldosPorParte,
  type MovimientoCuenta,
} from "@/lib/forestal/cuenta-corriente";

/**
 * Cuenta corriente con terceros (ADR-322).
 *
 * El saldo se DERIVA siempre: no hay contador que mantener. Y el signo importa
 * más que el número — quién le debe a quién es lo que se discute en el patio.
 */

const mov = (o: Partial<MovimientoCuenta> = {}): MovimientoCuenta => ({
  id: "m1",
  parteId: "p1",
  parteNombre: "Comunidad Nativa X",
  fecha: "2026-07-10T00:00:00.000Z",
  tipo: "cargo",
  concepto: "adelanto",
  monto: 1000,
  moneda: "PEN",
  referencia: null,
  fleteId: null,
  notas: null,
  ...o,
});

describe("saldo", () => {
  it("es cargos menos abonos", () => {
    const r = calcularSaldo([mov({ monto: 1000 }), mov({ id: "m2", tipo: "abono", monto: 300 })]);
    expect(r).toEqual({ cargos: 1000, abonos: 300, saldo: 700 });
  });

  it("una cuenta sin movimientos está en cero, no en null", () => {
    expect(calcularSaldo([])).toEqual({ cargos: 0, abonos: 0, saldo: 0 });
  });

  it("se lee en palabras, en los dos sentidos", () => {
    expect(leerSaldo(700, "Comunidad X")).toMatch(/Comunidad X le debe S\/ 700\.00/);
    expect(leerSaldo(-450, "Comunidad X")).toMatch(/El CTP le debe S\/ 450\.00/);
    expect(leerSaldo(0, "Comunidad X")).toMatch(/al día/);
    // Un centavo de redondeo no es una deuda.
    expect(leerSaldo(0.004, "Comunidad X")).toMatch(/al día/);
  });
});

describe("saldos por parte", () => {
  it("agrupa y ordena por lo que más se mueve, en valor absoluto", () => {
    const filas = saldosPorParte([
      mov({ id: "a", parteId: "p1", parteNombre: "Chico", monto: 100 }),
      mov({ id: "b", parteId: "p2", parteNombre: "Grande", monto: 5000 }),
      mov({ id: "c", parteId: "p3", parteNombre: "A favor", tipo: "abono", monto: 9000 }),
    ]);
    // El que el CTP le debe 9000 encabeza igual que si le debieran a él: los dos
    // son plata pendiente.
    expect(filas.map((f) => f.parteNombre)).toEqual(["A favor", "Grande", "Chico"]);
    expect(filas[0]!.saldo).toBe(-9000);
  });

  it("usa el nombre del movimiento MÁS RECIENTE", () => {
    const filas = saldosPorParte([
      mov({ id: "a", fecha: "2026-05-01T00:00:00.000Z", parteNombre: "Razón vieja" }),
      mov({ id: "b", fecha: "2026-07-01T00:00:00.000Z", parteNombre: "Razón nueva SAC" }),
    ]);
    expect(filas[0]!.parteNombre).toBe("Razón nueva SAC");
    expect(filas[0]!.movimientos).toBe(2);
  });
});

describe("corrida de saldos", () => {
  it("acumula del más viejo al más nuevo", () => {
    const c = corridaDeSaldos([
      mov({ id: "b", fecha: "2026-07-05T00:00:00.000Z", tipo: "abono", monto: 400 }),
      mov({ id: "a", fecha: "2026-07-01T00:00:00.000Z", monto: 1000 }),
      mov({ id: "c", fecha: "2026-07-09T00:00:00.000Z", monto: 200 }),
    ]);
    expect(c.map((m) => m.acumulado)).toEqual([1000, 600, 800]);
  });

  it("no muta la lista original", () => {
    const lista = [mov({ id: "b", fecha: "2026-07-05T00:00:00.000Z" }), mov({ id: "a", fecha: "2026-07-01T00:00:00.000Z" })];
    corridaDeSaldos(lista);
    expect(lista.map((m) => m.id)).toEqual(["b", "a"]);
  });
});

describe("fletes pendientes de cargar", () => {
  const flete = (o: Partial<{ id: string; pagaQuien: string; monto: number | null; proveedorId: string | null }> = {}) => ({
    id: "f1",
    pagaQuien: "proveedor",
    monto: 800,
    proveedorId: "p1",
    ...o,
  });

  it("sólo los que van a cargo del proveedor", () => {
    const r = fletesSinCargar([flete(), flete({ id: "f2", pagaQuien: "ctp" })], []);
    expect(r.map((f) => f.id)).toEqual(["f1"]);
  });

  it("un flete SIN monto no se carga: metería un cero en la cuenta", () => {
    expect(fletesSinCargar([flete({ monto: null })], [])).toEqual([]);
    expect(fletesSinCargar([flete({ monto: 0 })], [])).toEqual([]);
  });

  it("sin proveedor identificado no hay a quién cargárselo", () => {
    expect(fletesSinCargar([flete({ proveedorId: null })], [])).toEqual([]);
  });

  it("el que ya está cargado no vuelve a aparecer", () => {
    const r = fletesSinCargar([flete()], [mov({ fleteId: "f1" })]);
    expect(r).toEqual([]);
  });
});

describe("validación", () => {
  it("el monto tiene que ser positivo: un 0 no es un movimiento", () => {
    const base = { parteId: "p1", parteNombre: "X", fecha: "2026-07-10", tipo: "cargo", concepto: "adelanto" };
    expect(movimientoInputSchema.safeParse({ ...base, monto: 0 }).success).toBe(false);
    expect(movimientoInputSchema.safeParse({ ...base, monto: -5 }).success).toBe(false);
    expect(movimientoInputSchema.safeParse({ ...base, monto: 10 }).success).toBe(true);
  });

  it("exige con quién es la cuenta", () => {
    const r = movimientoInputSchema.safeParse({ parteId: "", parteNombre: "X", fecha: "2026-07-10", tipo: "cargo", concepto: "pago", monto: 10 });
    expect(r.success).toBe(false);
  });

  it("cada concepto sugiere su tipo natural", () => {
    expect(TIPO_SUGERIDO.adelanto).toBe("cargo");
    expect(TIPO_SUGERIDO.pago).toBe("abono");
    expect(TIPO_SUGERIDO.madera).toBe("abono");
    expect(TIPO_SUGERIDO.aserrio_prestado).toBe("cargo");
  });
});
