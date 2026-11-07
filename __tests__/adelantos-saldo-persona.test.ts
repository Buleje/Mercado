import { describe, expect, it } from "vitest";
import { cumplimientoDe, resumirPersona, type AdelantoDeLaPersona } from "@/lib/adelantos/saldo-persona";

const a = (p: Partial<AdelantoDeLaPersona>): AdelantoDeLaPersona => ({
  montoAdelantado: 100,
  saldoPendiente: 100,
  status: "ABIERTO",
  fechaAdelanto: "2026-01-01T12:00:00.000Z",
  ...p,
});

describe("resumirPersona · el bug de los cancelados", () => {
  it("un adelanto CANCELADO no se debe ni se contó como plata entregada", () => {
    // El caso medido en el tenant real: cuatro cancelados por S/ 9,250 hacían
    // que la ficha dijera «Sin margen» sobre alguien que no debe nada.
    const r = resumirPersona([
      a({ status: "CANCELADO", montoAdelantado: 9000, saldoPendiente: 9000 }),
      a({ status: "CANCELADO", montoAdelantado: 250, saldoPendiente: 250 }),
    ]);
    expect(r.saldoPendiente).toEqual({});
    expect(r.totalAdelantado).toEqual({});
    expect(r.adelantosCancelados).toBe(2);
    expect(r.adelantosAbiertos).toBe(0);
  });

  it("el saldo es SÓLO de los abiertos — la misma cuenta que hace el guard de crédito", () => {
    const r = resumirPersona([
      a({ status: "ABIERTO", montoAdelantado: 500, saldoPendiente: 200 }),
      a({ status: "LIQUIDADO", montoAdelantado: 300, saldoPendiente: 0 }),
      a({ status: "CANCELADO", montoAdelantado: 900, saldoPendiente: 900 }),
    ]);
    expect(r.saldoPendiente.PEN).toBe(200);
    expect(r.totalAdelantado.PEN).toBe(800); // 500 + 300, sin el cancelado
    expect(r.totalEntregado.PEN).toBe(600); // 300 del abierto + 300 del liquidado
    expect(r.adelantosAbiertos).toBe(1);
    expect(r.adelantosLiquidados).toBe(1);
  });

  it("lo entregado DE MÁS va aparte, no restando el saldo", () => {
    // Mezclarlos escondería las dos deudas: te debe 200 y vos le debés 50.
    const r = resumirPersona([
      a({ status: "ABIERTO", montoAdelantado: 500, saldoPendiente: 200 }),
      a({ status: "EXCEDIDO", montoAdelantado: 100, saldoPendiente: -50 }),
    ]);
    expect(r.saldoPendiente.PEN).toBe(200);
    expect(r.saldoAFavor.PEN).toBe(50);
  });

  it("el excedido cuenta como entregado por todo lo que cubrió, sin pasarse", () => {
    const r = resumirPersona([a({ status: "EXCEDIDO", montoAdelantado: 100, saldoPendiente: -40 })]);
    expect(r.totalEntregado.PEN).toBe(140);
  });

  it("una persona sin adelantos queda en cero, no en NaN", () => {
    const r = resumirPersona([]);
    expect(r).toMatchObject({ totalAdelantado: {}, saldoPendiente: {}, saldoAFavor: {}, ultimoAdelanto: null });
  });

  it("redondea a céntimos: tres tercios no dejan cola binaria", () => {
    const r = resumirPersona([
      a({ montoAdelantado: 33.33, saldoPendiente: 33.33 }),
      a({ montoAdelantado: 33.33, saldoPendiente: 33.33 }),
      a({ montoAdelantado: 33.34, saldoPendiente: 33.34 }),
    ]);
    expect(r.saldoPendiente.PEN).toBe(100);
  });

  /**
   * EL BUG que encontró la auditoría de esta sesión: la misma persona con un
   * adelanto en soles y otro en dólares se sumaba en un solo número, como si
   * 200 PEN + 50 USD fueran 250 de la misma unidad.
   */
  it("un adelanto en soles y otro en dólares NO se mezclan en un solo total", () => {
    const r = resumirPersona([
      a({ status: "ABIERTO", montoAdelantado: 200, saldoPendiente: 200, moneda: "PEN" }),
      a({ status: "ABIERTO", montoAdelantado: 50, saldoPendiente: 50, moneda: "USD" }),
    ]);
    expect(r.saldoPendiente).toEqual({ PEN: 200, USD: 50 });
    expect(r.totalAdelantado).toEqual({ PEN: 200, USD: 50 });
  });

  it("sin moneda cae a PEN, como el resto del módulo (shared.tsx)", () => {
    const r = resumirPersona([a({ status: "ABIERTO", moneda: undefined })]);
    expect(Object.keys(r.saldoPendiente)).toEqual(["PEN"]);
  });
});

describe("resumirPersona · último adelanto", () => {
  it("toma el más reciente, sin importar el orden en que vengan", () => {
    const r = resumirPersona([
      a({ fechaAdelanto: "2026-01-01T12:00:00.000Z" }),
      a({ fechaAdelanto: "2026-06-15T12:00:00.000Z" }),
      a({ fechaAdelanto: "2026-03-01T12:00:00.000Z" }),
    ]);
    expect(r.ultimoAdelanto).toBe("2026-06-15T12:00:00.000Z");
  });

  it("acepta Date además de string ISO (es lo que llega de Prisma)", () => {
    const r = resumirPersona([a({ fechaAdelanto: new Date("2026-04-02T12:00:00.000Z") })]);
    expect(r.ultimoAdelanto).toBe("2026-04-02T12:00:00.000Z");
  });

  it("un cancelado no cuenta como «último adelanto»", () => {
    const r = resumirPersona([
      a({ status: "ABIERTO", fechaAdelanto: "2026-01-01T12:00:00.000Z" }),
      a({ status: "CANCELADO", fechaAdelanto: "2026-12-01T12:00:00.000Z" }),
    ]);
    expect(r.ultimoAdelanto).toBe("2026-01-01T12:00:00.000Z");
  });

  it("una fecha basura no rompe el resumen", () => {
    const r = resumirPersona([a({ fechaAdelanto: "no-es-fecha" }), a({ fechaAdelanto: null })]);
    expect(r.ultimoAdelanto).toBeNull();
    expect(r.saldoPendiente).toEqual({ PEN: 200 });
  });
});

describe("cumplimientoDe", () => {
  it("es el porcentaje devuelto de todo lo que sacó", () => {
    expect(cumplimientoDe(resumirPersona([a({ montoAdelantado: 400, saldoPendiente: 100 })]))).toBe(75);
  });

  it("quien nunca sacó nada NO tiene nota: null, no 100", () => {
    // Un 100 de regalo diría «cumplidor» sobre alguien de quien no se sabe nada.
    expect(cumplimientoDe(resumirPersona([]))).toBeNull();
    expect(cumplimientoDe(resumirPersona([a({ status: "CANCELADO" })]))).toBeNull();
  });

  it("no pasa de 100 aunque haya entregado de más", () => {
    expect(cumplimientoDe(resumirPersona([a({ status: "EXCEDIDO", montoAdelantado: 100, saldoPendiente: -50 })]))).toBe(100);
  });

  it("quien no devolvió nada tiene 0", () => {
    expect(cumplimientoDe(resumirPersona([a({ montoAdelantado: 500, saldoPendiente: 500 })]))).toBe(0);
  });
});
