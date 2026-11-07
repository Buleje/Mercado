/**
 * Los cuatro modos del alta «Nuevo adelanto» (ADR-448): qué viaja al servidor,
 * hacia dónde va la caja y cómo queda la cuenta de la persona.
 */
import { describe, expect, it } from "vitest";
import { cajaAlCrear, cajaAlDevolver, problemaDeDireccion } from "@/lib/adelantos/direccion";
import {
  MODO,
  MODOS_ALTA,
  abonablesDe,
  adelantosDelModo,
  cuentaDePersona,
  cuerpoAbonoEntrega,
  cuerpoAdelanto,
  intencionAbonoRepartido,
  lineaCaja,
  metodoCajaPorDefecto,
  modalidadValida,
  modoDeAdelanto,
  proyeccionCuenta,
  repartoDelAbono,
  type BorradorAlta,
} from "@/lib/adelantos/modos-alta";

const HOY = "2026-09-28";

const borrador = (over: Partial<BorradorAlta> = {}): BorradorAlta => ({
  modo: "dar",
  beneficiarioId: "b1",
  modalidad: "CUENTA_CORRIENTE",
  monto: 500,
  moneda: "PEN",
  fecha: HOY,
  hoy: HOY,
  vencimiento: "",
  notas: "",
  reciboManual: "",
  metodoCaja: "efectivo",
  comprobante: null,
  forzarLimite: false,
  plan: [],
  piesTablares: "",
  piesTablaresTipo: "",
  contratoId: null,
  ...over,
});

const adelanto = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  beneficiarioId: "b1",
  codigoOperacion: "ADL-2026-0001",
  fechaAdelanto: "2026-09-01T12:00:00.000Z",
  saldoPendiente: 100,
  moneda: "PEN",
  modalidad: "CUENTA_CORRIENTE",
  status: "ABIERTO",
  entregasPactadas: [] as { id: string }[],
  ...over,
});

describe("MODO — la caja y la dirección de cada modo", () => {
  it("dar saca plata; abono, servicio y préstamo la entran", () => {
    expect(MODO.dar.caja).toBe(cajaAlCrear("DADO"));
    expect(MODO.abono.caja).toBe(cajaAlDevolver("DADO"));
    expect(MODO.servicio.caja).toBe(cajaAlCrear("RECIBIDO"));
    expect(MODO.prestamo.caja).toBe(cajaAlCrear("RECIBIDO"));
    expect(MODOS_ALTA.map((m) => MODO[m].caja)).toEqual(["egreso", "ingreso", "ingreso", "ingreso"]);
  });

  it("lo recibido nunca ofrece descuento por planilla (el CHECK de la base lo rechaza)", () => {
    for (const m of ["servicio", "prestamo"] as const) {
      expect(MODO[m].modalidades.map((o) => o.id)).not.toContain("DESCUENTO_PLANILLA");
      expect(modalidadValida(m, "DESCUENTO_PLANILLA")).toBe("CUENTA_CORRIENTE");
    }
    expect(modalidadValida("dar", "DESCUENTO_PLANILLA")).toBe("DESCUENTO_PLANILLA");
  });

  it("cada cuerpo que crea un adelanto pasa la misma regla que el servidor", () => {
    for (const modo of ["dar", "servicio", "prestamo"] as const) {
      for (const modalidad of ["CUENTA_CORRIENTE", "ENTREGAS_PACTADAS", "DESCUENTO_PLANILLA"] as const) {
        expect(problemaDeDireccion(cuerpoAdelanto(borrador({ modo, modalidad })))).toBeNull();
      }
    }
  });
});

describe("metodoCajaPorDefecto", () => {
  it("hoy mueve la caja en efectivo; otro día, no la toca", () => {
    expect(metodoCajaPorDefecto(HOY, HOY)).toBe("efectivo");
    expect(metodoCajaPorDefecto("2026-09-27", HOY)).toBe("");
  });
});

describe("cuentaDePersona", () => {
  it("sin los campos nuevos, lo de antes: dado abierto te debe, dado excedido le debes", () => {
    expect(cuentaDePersona({ saldoPendiente: { PEN: 573 }, saldoAFavor: { PEN: 20 } })).toEqual({
      teDebe: { PEN: 573 },
      leDebes: { PEN: 20 },
    });
  });

  it("WASACO: te debe 3 217 y le debes 3 031, en cifras separadas", () => {
    const c = cuentaDePersona({ saldoPendiente: { PEN: 3217 }, saldoAFavor: {}, recibidoPendiente: { PEN: 3031 }, recibidoExcedido: {} });
    expect(c).toEqual({ teDebe: { PEN: 3217 }, leDebes: { PEN: 3031 } });
  });

  it("si el servidor ya manda teDebe/leDebes, se usan tal cual", () => {
    const c = cuentaDePersona({ saldoPendiente: { PEN: 1 }, saldoAFavor: {}, teDebe: { PEN: 10 }, leDebes: { USD: 5 } });
    expect(c).toEqual({ teDebe: { PEN: 10 }, leDebes: { USD: 5 } });
  });
});

describe("proyeccionCuenta y lineaCaja", () => {
  const cuenta = { teDebe: { PEN: 573 }, leDebes: { PEN: 3031 } };

  it("dar sube lo que te debe; servicio y préstamo suben lo que le debes", () => {
    expect(proyeccionCuenta("dar", cuenta, 500, "PEN")).toEqual({ cifra: "te-debe", antes: 573, despues: 1073, cruza: false, excedente: 0 });
    expect(proyeccionCuenta("servicio", cuenta, 1731, "PEN")).toEqual({ cifra: "le-debes", antes: 3031, despues: 4762, cruza: false, excedente: 0 });
    expect(proyeccionCuenta("prestamo", cuenta, 100, "USD")).toEqual({ cifra: "le-debes", antes: 0, despues: 100, cruza: false, excedente: 0 });
  });

  it("un abono baja lo que te debe y avisa si lo pasa", () => {
    expect(proyeccionCuenta("abono", cuenta, 73, "PEN")).toMatchObject({ antes: 573, despues: 500, cruza: false });
    expect(proyeccionCuenta("abono", cuenta, 600, "PEN")).toMatchObject({ despues: 0, cruza: true, excedente: 27 });
  });

  it("sin método no se mueve la caja", () => {
    expect(lineaCaja("dar", "", 500).tipo).toBe("nada");
    expect(lineaCaja("dar", "efectivo", 500)).toEqual({ tipo: "egreso", monto: 500, metodo: "efectivo" });
    expect(lineaCaja("servicio", "yape", 1731)).toEqual({ tipo: "ingreso", monto: 1731, metodo: "yape" });
    /* Sin monto todavía, la caja igual dice hacia dónde va: el método ya está elegido. */
    expect(lineaCaja("abono", "efectivo", 0)).toEqual({ tipo: "ingreso", monto: 0, metodo: "efectivo" });
  });
});

describe("abonablesDe + repartoDelAbono", () => {
  const lista = [
    adelanto({ id: "nuevo", fechaAdelanto: "2026-09-20T12:00:00.000Z", saldoPendiente: 50, codigoOperacion: "ADL-3" }),
    adelanto({ id: "viejo", fechaAdelanto: "2026-09-01T12:00:00.000Z", saldoPendiente: 100, codigoOperacion: "ADL-1" }),
    adelanto({ id: "usd", moneda: "USD", saldoPendiente: 40 }),
    adelanto({ id: "cuotas", modalidad: "ENTREGAS_PACTADAS", saldoPendiente: 60 }),
    adelanto({ id: "recibido", direccion: "RECIBIDO", conceptoRecibido: "SERVICIO", saldoPendiente: 1731 }),
    adelanto({ id: "excedido", status: "EXCEDIDO", saldoPendiente: -20 }),
    adelanto({ id: "liquidado", status: "LIQUIDADO", saldoPendiente: 0 }),
    adelanto({ id: "ajeno", beneficiarioId: "b2", saldoPendiente: 999 }),
  ];

  it("la más vieja primero entra sólo en soles y sin cuotas; lo demás se dice con su motivo", () => {
    const r = abonablesDe(lista, "b1");
    expect(r.adentro.map((a) => a.id)).toEqual(["viejo", "nuevo"]);
    expect(r.elegibles.map((a) => a.id).sort()).toEqual(["cuotas", "nuevo", "usd", "viejo"]);
    const motivo = Object.fromEntries(r.fuera.map((f) => [f.id, f.motivo]));
    expect(motivo.usd).toMatch(/USD/);
    expect(motivo.cuotas).toMatch(/cuotas/);
    expect(motivo.recibido).toMatch(/te dieron/);
    expect(motivo.excedido).toMatch(/de más/);
    expect(motivo).not.toHaveProperty("liquidado");
    expect(motivo).not.toHaveProperty("ajeno");
  });

  it("reparte sin darle a ninguno más que su saldo", () => {
    const { adentro } = abonablesDe(lista, "b1");
    expect(repartoDelAbono(adentro, 120)).toEqual([
      { adelantoId: "viejo", codigo: "ADL-1", monto: 100 },
      { adelantoId: "nuevo", codigo: "ADL-3", monto: 20 },
    ]);
  });
});

describe("lo que viaja al servidor", () => {
  it("dar no manda dirección (el servidor la pone DADO) y sí el tope forzado", () => {
    const c = cuerpoAdelanto(borrador({ forzarLimite: true }));
    expect(c).not.toHaveProperty("direccion");
    expect(c.forzarLimite).toBe(true);
    expect(c.fechaAdelanto).toBeUndefined();
    expect(c.metodoCaja).toBe("efectivo");
  });

  it("un servicio va RECIBIDO con sus pt del lado del servicio, sin tope", () => {
    const c = cuerpoAdelanto(borrador({ modo: "servicio", forzarLimite: true, piesTablares: "3462", modalidad: "DESCUENTO_PLANILLA" }));
    expect(c).toMatchObject({ direccion: "RECIBIDO", conceptoRecibido: "SERVICIO", piesTablares: 3462, piesTablaresTipo: "SERVICIO", modalidad: "CUENTA_CORRIENTE" });
    expect(c.forzarLimite).toBeUndefined();
  });

  it("un préstamo de ayer sin caja", () => {
    const c = cuerpoAdelanto(borrador({ modo: "prestamo", fecha: "2026-09-27", metodoCaja: "" }));
    expect(c).toMatchObject({ direccion: "RECIBIDO", conceptoRecibido: "PRESTAMO" });
    expect(typeof c.fechaAdelanto).toBe("string");
    expect(c.metodoCaja).toBeUndefined();
  });

  it("el abono a un adelanto entra a la caja sólo si hay método", () => {
    expect(cuerpoAbonoEntrega({ ...borrador(), metodoCaja: "efectivo", reciboManual: "001-9" })).toMatchObject({
      tipo: "LIBRE",
      valorManual: 500,
      descripcion: "Abono en efectivo",
      metodoCaja: "efectivo",
      notas: "Recibo 001-9",
    });
    expect(cuerpoAbonoEntrega({ ...borrador(), metodoCaja: "" })).toMatchObject({ descripcion: "Abono", metodoCaja: null });
  });

  it("el abono repartido nombra cada adelanto y no toca la cuenta forestal", () => {
    const i = intencionAbonoRepartido({ ...borrador(), metodoCaja: "" }, [{ adelantoId: "viejo", codigo: null, monto: 100 }]);
    expect(i.compensar).toBe(0);
    expect(i.pago).toEqual({ direccion: "recibido", monto: 500, metodo: "efectivo", moverCaja: false });
    expect(i.imputacion?.pago).toEqual([{ partida: "adelanto:viejo", monto: 100 }]);
  });
});

describe("modoDeAdelanto / adelantosDelModo", () => {
  it("un adelanto de antes, sin dirección, es dar", () => {
    expect(modoDeAdelanto({})).toBe("dar");
    expect(modoDeAdelanto({ direccion: "RECIBIDO", conceptoRecibido: "PRESTAMO" })).toBe("prestamo");
    expect(modoDeAdelanto({ direccion: "RECIBIDO", conceptoRecibido: "SERVICIO" })).toBe("servicio");
  });

  it("«repetir el último» no mezcla lo dado con lo recibido", () => {
    const l = [adelanto({ id: "d" }), adelanto({ id: "s", direccion: "RECIBIDO", conceptoRecibido: "SERVICIO" })];
    expect(adelantosDelModo(l, "dar").map((a) => a.id)).toEqual(["d"]);
    expect(adelantosDelModo(l, "servicio").map((a) => a.id)).toEqual(["s"]);
    expect(adelantosDelModo(l, "abono")).toEqual([]);
  });
});
