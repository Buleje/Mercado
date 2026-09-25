import { describe, expect, it } from "vitest";
import { adelantosDe, plazoHabitualDe, sugerirRepetir, yaTuvoAdelantoHoy } from "@/lib/adelantos/sugerencias";
import type { DbAdelanto } from "@/lib/db/adelantos.db";

const AHORA = new Date("2026-08-04T15:00:00.000Z").getTime();
const dias = (n: number) => new Date(AHORA - n * 86_400_000).toISOString();

const adel = (p: Partial<DbAdelanto> & { id: string }): DbAdelanto =>
  ({
    tenantId: "t1",
    beneficiarioId: "b1",
    modalidad: "CUENTA_CORRIENTE",
    montoAdelantado: 500,
    moneda: "PEN",
    fechaAdelanto: dias(10),
    status: "ABIERTO",
    saldoPendiente: 500,
    totalEntregado: 0,
    entregas: [],
    entregasPactadas: [],
    createdAt: dias(10),
    updatedAt: dias(10),
    ...p,
  }) as DbAdelanto;

const entrega = (fecha: string, valor: number) =>
  ({ id: `e${fecha}${valor}`, adelantoId: "a", fecha, tipo: "LIBRE", valor, sumadoAStock: false, createdAt: fecha }) as never;

describe("adelantosDe", () => {
  it("trae sólo los de esa persona, sin cancelados, del más nuevo al más viejo", () => {
    const r = adelantosDe(
      [
        adel({ id: "viejo", fechaAdelanto: dias(30) }),
        adel({ id: "nuevo", fechaAdelanto: dias(2) }),
        adel({ id: "cancelado", status: "CANCELADO", fechaAdelanto: dias(1) }),
        adel({ id: "otro", beneficiarioId: "b2" }),
      ],
      "b1",
    );
    expect(r.map((x) => x.id)).toEqual(["nuevo", "viejo"]);
  });
});

describe("yaTuvoAdelantoHoy", () => {
  it("encuentra el de hoy — el duplicado por doble clic se descubre al cuadrar la caja", () => {
    const r = yaTuvoAdelantoHoy([adel({ id: "hoy", fechaAdelanto: dias(0) })], "b1", AHORA);
    expect(r?.id).toBe("hoy");
  });

  it("el de ayer no cuenta", () => {
    expect(yaTuvoAdelantoHoy([adel({ id: "ayer", fechaAdelanto: dias(1) })], "b1", AHORA)).toBeNull();
  });

  it("un cancelado de hoy no es un adelanto que se haya dado", () => {
    expect(yaTuvoAdelantoHoy([adel({ id: "x", status: "CANCELADO", fechaAdelanto: dias(0) })], "b1", AHORA)).toBeNull();
  });

  it("no confunde con otra persona", () => {
    expect(yaTuvoAdelantoHoy([adel({ id: "x", beneficiarioId: "b2", fechaAdelanto: dias(0) })], "b1", AHORA)).toBeNull();
  });
});

describe("sugerirRepetir", () => {
  it("propone el último con su monto, modalidad y motivo", () => {
    const r = sugerirRepetir(
      [
        adel({ id: "viejo", fechaAdelanto: dias(60), montoAdelantado: 100 }),
        adel({ id: "ultimo", fechaAdelanto: dias(15), montoAdelantado: 800, modalidad: "DESCUENTO_PLANILLA", notas: "Adelanto de sueldo" }),
      ],
      "b1",
      AHORA,
    );
    expect(r).toMatchObject({ monto: 800, modalidad: "DESCUENTO_PLANILLA", notas: "Adelanto de sueldo", hace: 15 });
  });

  it("sin historial no propone nada, en vez de inventar un monto", () => {
    expect(sugerirRepetir([], "b1", AHORA)).toBeNull();
    expect(sugerirRepetir([adel({ id: "x", status: "CANCELADO" })], "b1", AHORA)).toBeNull();
  });
});

describe("plazoHabitualDe", () => {
  it("promedia lo que TARDÓ en liquidar, no lo que prometió", () => {
    const r = plazoHabitualDe(
      [
        adel({ id: "a", status: "LIQUIDADO", fechaAdelanto: dias(60), saldoPendiente: 0, entregas: [entrega(dias(40), 500)] }),
        adel({ id: "b", status: "LIQUIDADO", fechaAdelanto: dias(90), saldoPendiente: 0, entregas: [entrega(dias(60), 500)] }),
      ],
      "b1",
    );
    expect(r).toBe(25); // (20 + 30) / 2
  });

  it("con un solo caso NO estima: un dato es una anécdota", () => {
    const r = plazoHabitualDe(
      [adel({ id: "a", status: "LIQUIDADO", fechaAdelanto: dias(60), saldoPendiente: 0, entregas: [entrega(dias(40), 500)] })],
      "b1",
    );
    expect(r).toBeNull();
  });

  it("los abiertos no cuentan: todavía no se sabe cuánto van a tardar", () => {
    expect(plazoHabitualDe([adel({ id: "a" }), adel({ id: "b" })], "b1")).toBeNull();
  });

  it("toma la ÚLTIMA entrega, no la primera: el plazo es hasta que terminó de pagar", () => {
    const r = plazoHabitualDe(
      [
        adel({ id: "a", status: "LIQUIDADO", fechaAdelanto: dias(40), saldoPendiente: 0, entregas: [entrega(dias(35), 100), entrega(dias(20), 400)] }),
        adel({ id: "b", status: "LIQUIDADO", fechaAdelanto: dias(40), saldoPendiente: 0, entregas: [entrega(dias(20), 500)] }),
      ],
      "b1",
    );
    expect(r).toBe(20);
  });
});
