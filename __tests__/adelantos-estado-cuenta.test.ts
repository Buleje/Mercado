import { describe, expect, it } from "vitest";
import { movimientosDePersona, saldoDeLaCuenta, textoEstadoDeCuenta } from "@/lib/adelantos/estado-cuenta";
import type { DbAdelanto } from "@/lib/db/adelantos.db";

const adel = (p: Partial<DbAdelanto> & { id: string }): DbAdelanto =>
  ({
    tenantId: "t1",
    beneficiarioId: "b1",
    modalidad: "CUENTA_CORRIENTE",
    montoAdelantado: 500,
    moneda: "PEN",
    fechaAdelanto: "2026-03-01T12:00:00.000Z",
    status: "ABIERTO",
    saldoPendiente: 500,
    totalEntregado: 0,
    entregas: [],
    entregasPactadas: [],
    createdAt: "2026-03-01T12:00:00.000Z",
    updatedAt: "2026-03-01T12:00:00.000Z",
    ...p,
  }) as DbAdelanto;

const entrega = (fecha: string, valor: number, descripcion?: string) =>
  ({ id: `e-${fecha}-${valor}`, adelantoId: "a", fecha, tipo: "LIBRE", descripcion, valor, sumadoAStock: false, createdAt: fecha }) as never;

describe("movimientosDePersona", () => {
  it("intercala adelantos y entregas en orden cronológico", () => {
    const movs = movimientosDePersona([
      adel({
        id: "a",
        fechaAdelanto: "2026-03-01T12:00:00.000Z",
        entregas: [entrega("2026-03-20T12:00:00.000Z", 100, "Pintura"), entrega("2026-03-10T12:00:00.000Z", 50, "Flete")],
      }),
    ]);
    expect(movs.map((m) => m.concepto)).toEqual(["Adelanto", "Flete", "Pintura"]);
  });

  it("el saldo corre: el adelanto suma, la entrega resta", () => {
    const movs = movimientosDePersona([
      adel({ id: "a", montoAdelantado: 500, entregas: [entrega("2026-03-10T12:00:00.000Z", 200)] }),
    ]);
    expect(movs.map((m) => m.saldo)).toEqual([500, 300]);
    expect(saldoDeLaCuenta(movs)).toEqual({ PEN: 300 });
  });

  it("un adelanto CANCELADO no entra en la cuenta que se le manda a la persona", () => {
    // Verla ahí la haría discutir una deuda que el negocio ya perdonó.
    const movs = movimientosDePersona([
      adel({ id: "vivo", montoAdelantado: 100 }),
      adel({ id: "muerto", status: "CANCELADO", montoAdelantado: 9000, saldoPendiente: 9000 }),
    ]);
    expect(movs).toHaveLength(1);
    expect(saldoDeLaCuenta(movs)).toEqual({ PEN: 100 });
  });

  it("usa el código del adelanto en el concepto, para que se pueda identificar", () => {
    const movs = movimientosDePersona([adel({ id: "a", codigoOperacion: "ADL-2026-0007" })]);
    expect(movs[0].concepto).toBe("Adelanto ADL-2026-0007");
  });

  it("sin código no deja un espacio colgando al final", () => {
    expect(movimientosDePersona([adel({ id: "a", codigoOperacion: null })])[0].concepto).toBe("Adelanto");
  });

  it("una entrega sin descripción se llama «Entrega», no queda vacía", () => {
    const movs = movimientosDePersona([adel({ id: "a", entregas: [entrega("2026-03-10T12:00:00.000Z", 50)] })]);
    expect(movs[1].concepto).toBe("Entrega");
  });

  it("redondea en cada paso: el papel tiene que cuadrar al centavo", () => {
    // Sin redondear por paso, el saldo final termina en 0.30000000000000004.
    const movs = movimientosDePersona([
      adel({ id: "a", montoAdelantado: 0.1, entregas: [] }),
      adel({ id: "b", montoAdelantado: 0.2, entregas: [] }),
    ]);
    expect(saldoDeLaCuenta(movs)).toEqual({ PEN: 0.3 });
  });

  it("sin movimientos, el saldo es 0 y no explota", () => {
    expect(movimientosDePersona([])).toEqual([]);
    expect(saldoDeLaCuenta([])).toEqual({});
  });

  /**
   * EL BUG que encontré leyendo esta misma sesión: un adelanto en soles y
   * otro en dólares corrían sobre el MISMO acumulado, como si 500 PEN + 100
   * USD fueran 600 de la misma plata — y esta es la única pantalla que se le
   * manda a la persona por WhatsApp.
   */
  it("un adelanto en soles y otro en dólares corren en cuentas separadas", () => {
    const movs = movimientosDePersona([
      adel({ id: "pen", montoAdelantado: 500, moneda: "PEN", fechaAdelanto: "2026-03-01T12:00:00.000Z" }),
      adel({ id: "usd", montoAdelantado: 100, moneda: "USD", fechaAdelanto: "2026-03-02T12:00:00.000Z" }),
    ]);
    expect(movs.every((m) => m.saldo < 600)).toBe(true);
    expect(saldoDeLaCuenta(movs)).toEqual({ PEN: 500, USD: 100 });
  });
});

describe("textoEstadoDeCuenta", () => {
  it("arma el mensaje con el nombre, las líneas y el saldo final", () => {
    const movs = movimientosDePersona([
      adel({ id: "a", montoAdelantado: 500, entregas: [entrega("2026-03-10T12:00:00.000Z", 200, "Pintura")] }),
    ]);
    const texto = textoEstadoDeCuenta("Juan Pérez", movs);
    expect(texto).toContain("*Estado de cuenta*");
    expect(texto).toContain("Juan Pérez");
    expect(texto).toContain("+S/ 500.00");
    expect(texto).toContain("−S/ 200.00");
    expect(texto).toContain("*Saldo pendiente: S/ 300.00*");
  });

  it("las entregas van con signo menos, no como si fueran más deuda", () => {
    const movs = movimientosDePersona([
      adel({ id: "a", montoAdelantado: 100, entregas: [entrega("2026-03-10T12:00:00.000Z", 100, "Todo")] }),
    ]);
    expect(textoEstadoDeCuenta("Ana", movs)).toContain("Todo: −S/ 100.00");
    expect(textoEstadoDeCuenta("Ana", movs)).toContain("*Saldo pendiente: S/ 0.00*");
  });

  it("con dos monedas, el saldo final las lista separadas — nunca una suma cruzada", () => {
    const movs = movimientosDePersona([
      adel({ id: "pen", montoAdelantado: 200, moneda: "PEN" }),
      adel({ id: "usd", montoAdelantado: 50, moneda: "USD" }),
    ]);
    const texto = textoEstadoDeCuenta("Ana", movs);
    expect(texto).toContain("*Saldo pendiente: S/ 200.00 · $ 50.00*");
  });
});
