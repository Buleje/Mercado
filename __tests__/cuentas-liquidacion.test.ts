/**
 * Liquidar la cuenta de una persona (ADR-413 · Verificación §1).
 *
 * Lo que se protege: que ninguna partida reciba más que su saldo (nunca un
 * EXCEDIDO, nunca un signo dado vuelta), que el sobrepago se rechace con la
 * cifra, que la huella no cambie sola y que el neto sea el mismo que muestra la
 * fila de la persona.
 */

import { describe, expect, it } from "vitest";
import {
  cargosCubiertosPorAntiguedad,
  clasificarAdelantos,
  detalleDeLiquidacion,
  fechaDeudaViva,
  huellaDe,
  imputarFifo,
  intencionDejarEnCero,
  leerPlan,
  liquidacionInputSchema,
  maximoCompensable,
  motivoNoSePuedeAnular,
  planLiquidacion,
  saldosDe,
  type IntencionLiquidacion,
  type PartidasDePersona,
} from "@/lib/cuentas/liquidacion";
import { unificarCuentas } from "@/lib/adelantos/cuenta-unificada";
import { PREFIJO_LIQUIDACION, normalizarBusquedaCodigo, siguienteCodigo } from "@/lib/adelantos/codigo-operacion";
import type { MovimientoCuenta } from "@/lib/forestal/cuenta-corriente";
import { limaDateKey } from "@/lib/utils";

const mov = (o: Partial<MovimientoCuenta> = {}): MovimientoCuenta => ({
  id: "m1",
  parteId: "p1",
  parteNombre: "Juana",
  fecha: "2026-09-01T00:00:00.000Z",
  tipo: "abono",
  concepto: "madera",
  monto: 800,
  moneda: "PEN",
  referencia: null,
  fleteId: null,
  notas: null,
  ...o,
});

const partidas = (o: Partial<PartidasDePersona> = {}): PartidasDePersona => ({
  persona: { beneficiarioId: "b1", parteId: "p1", nombre: "Juana", documento: "12345678" },
  cruzable: true,
  adelantos: [
    { adelantoId: "a1", codigo: "ADL-2026-0001", fecha: "2026-08-01T12:00:00.000Z", saldo: 600, modalidad: "CUENTA_CORRIENTE" },
    { adelantoId: "a2", codigo: "ADL-2026-0002", fecha: "2026-08-15T12:00:00.000Z", saldo: 400, modalidad: "CUENTA_CORRIENTE" },
  ],
  forestal: { saldo: -800, desde: "2026-09-01T00:00:00.000Z", movimientos: [mov()] },
  fuera: [],
  ...o,
});

const intencion = (o: Partial<IntencionLiquidacion> = {}): IntencionLiquidacion => ({
  fecha: "2026-09-14",
  compensar: 0,
  pago: null,
  ...o,
});

const plan = (p: PartidasDePersona, i: IntencionLiquidacion) => {
  const r = planLiquidacion(p, i);
  if (!r.ok) throw new Error(r.errores.join(" · "));
  return r.plan;
};
const errores = (p: PartidasDePersona, i: IntencionLiquidacion) => {
  const r = planLiquidacion(p, i);
  return r.ok ? [] : r.errores;
};

describe("imputar del más viejo al más nuevo", () => {
  it("FIFO sin darle a nadie más que su saldo", () => {
    const r = imputarFifo(partidas().adelantos, 700);
    expect(r.map((x) => [x.partida.adelantoId, x.monto])).toEqual([["a1", 600], ["a2", 100]]);
  });
});

describe("cruzar", () => {
  it("el ejemplo del ADR: adelanto 1000 y madera 800 → cruzar 800 deja 200 de neto y la cuenta en 0", () => {
    const p = plan(partidas(), intencion({ compensar: 800 }));
    expect(p.entregas.map((e) => [e.adelantoId, e.valor, e.paso])).toEqual([["a1", 600, "cruce"], ["a2", 200, "cruce"]]);
    expect(p.movimientos).toEqual([expect.objectContaining({ tipo: "cargo", concepto: "compensacion", monto: 800 })]);
    expect(p.antes).toEqual({ adelantosTeDebe: 1000, maderaSaldo: -800, neto: 200 });
    expect(p.despues).toEqual({ adelantosTeDebe: 200, maderaSaldo: 0, neto: 200 });
    expect(p.caja).toBeNull();
  });

  it("no cruza más que el mínimo de las dos deudas", () => {
    expect(maximoCompensable(partidas())).toBe(800);
    expect(errores(partidas(), intencion({ compensar: 900 }))[0]).toContain("Lo máximo que cruza es");
  });

  it("sin vínculo explícito no cruza", () => {
    expect(maximoCompensable(partidas({ cruzable: false }))).toBe(0);
    expect(errores(partidas({ cruzable: false }), intencion({ compensar: 100 }))).toEqual([
      "Para cruzar las dos libretas, primero confirma que es la misma persona.",
    ]);
  });

  it("el reparto a mano tiene que sumar exacto, caber en cada adelanto y ser de la persona", () => {
    expect(errores(partidas(), intencion({ compensar: 500, imputacion: { compensacion: [{ adelantoId: "a1", monto: 300 }] } }))[0]).toContain("El reparto suma");
    expect(errores(partidas(), intencion({ compensar: 700, imputacion: { compensacion: [{ adelantoId: "a2", monto: 700 }] } }))[0]).toContain("El adelanto ADL-2026-0002 debe");
    expect(errores(partidas(), intencion({ compensar: 100, imputacion: { compensacion: [{ adelantoId: "ajeno", monto: 100 }] } }))).toEqual([
      "Ese adelanto no es de esta persona.",
    ]);
  });
});

describe("pagar", () => {
  it("el pago recibido mayor que la deuda se rechaza con la cifra", () => {
    const p = partidas({ forestal: null, cruzable: false });
    expect(errores(p, intencion({ pago: { direccion: "recibido", monto: 1500, metodo: "efectivo", moverCaja: true } }))[0]).toMatch(/^Te debe S\/ .*1,000\.00: el pago no puede pasar de eso\.$/);
  });

  it("el pago hecho mayor que lo que le debes se rechaza con la cifra", () => {
    expect(errores(partidas(), intencion({ pago: { direccion: "hecho", monto: 900, metodo: "yape", moverCaja: false } }))[0]).toContain("Le debes");
  });

  it("un pago recibido parcial cubre los adelantos por antigüedad y mueve la caja una vez", () => {
    const p = plan(partidas({ forestal: null, cruzable: false }), intencion({ pago: { direccion: "recibido", monto: 700, metodo: "efectivo", moverCaja: true } }));
    expect(p.entregas.map((e) => [e.adelantoId, e.valor])).toEqual([["a1", 600], ["a2", 100]]);
    expect(p.caja).toEqual({ tipo: "ingreso", monto: 700, metodo: "efectivo" });
    expect(p.despues.adelantosTeDebe).toBe(300);
  });

  it("nada que liquidar", () => {
    expect(errores(partidas(), intencion())).toEqual(["No hay nada que liquidar."]);
  });
});

describe("dejar en cero", () => {
  it("neto a su cargo: cruza lo máximo y cobra el resto", () => {
    const i = intencionDejarEnCero(partidas(), "2026-09-14", "efectivo", true);
    expect(i).toMatchObject({ compensar: 800, pago: { direccion: "recibido", monto: 200 } });
    const p = plan(partidas(), i as IntencionLiquidacion);
    expect(p.despues).toEqual({ adelantosTeDebe: 0, maderaSaldo: 0, neto: 0 });
    expect(p.caja).toEqual({ tipo: "ingreso", monto: 200, metodo: "efectivo" });
    expect(leerPlan(p, "Juana").at(-1)).toContain("Entran");
  });

  it("neto a su favor: cruza lo máximo y le pagas el resto", () => {
    const base = partidas({
      adelantos: [{ adelantoId: "a1", codigo: "ADL-2026-0001", fecha: "2026-08-01T12:00:00.000Z", saldo: 300, modalidad: "CUENTA_CORRIENTE" }],
    });
    const i = intencionDejarEnCero(base, "2026-09-14", "transferencia", false);
    expect(i).toMatchObject({ compensar: 300, pago: { direccion: "hecho", monto: 500 } });
    const p = plan(base, i as IntencionLiquidacion);
    expect(p.movimientos.map((m) => [m.concepto, m.monto])).toEqual([["compensacion", 300], ["pago_hecho", 500]]);
    expect(p.despues.neto).toBe(0);
    expect(p.caja).toBeNull();
  });

  it("sin vínculo y con deudas en las dos direcciones no se puede dejar en cero de un pago", () => {
    expect(intencionDejarEnCero(partidas({ cruzable: false }), "2026-09-14", "efectivo", true)).toBeNull();
  });
});

describe("queda fuera", () => {
  it("EXCEDIDO, dólares y cuotas pactadas quedan fuera con su motivo; lo demás, en orden", () => {
    const { adelantos, fuera } = clasificarAdelantos([
      { id: "x", codigo: "ADL-2026-0009", fecha: "2026-09-01", saldo: -50, moneda: "PEN", modalidad: "CUENTA_CORRIENTE", status: "EXCEDIDO", cuotasPactadas: 0 },
      { id: "d", codigo: "ADL-2026-0008", fecha: "2026-08-20", saldo: 100, moneda: "USD", modalidad: "CUENTA_CORRIENTE", status: "ABIERTO", cuotasPactadas: 0 },
      { id: "c", codigo: "ADL-2026-0007", fecha: "2026-08-10", saldo: 200, moneda: "PEN", modalidad: "ENTREGAS_PACTADAS", status: "ABIERTO", cuotasPactadas: 3 },
      { id: "b", codigo: "ADL-2026-0006", fecha: "2026-08-05", saldo: 70, moneda: "PEN", modalidad: "DESCUENTO_PLANILLA", status: "ABIERTO", cuotasPactadas: 0 },
      { id: "a", codigo: "ADL-2026-0005", fecha: "2026-08-01", saldo: 30, moneda: null, modalidad: "CUENTA_CORRIENTE", status: "ABIERTO", cuotasPactadas: 0 },
    ]);
    expect(adelantos.map((a) => a.adelantoId)).toEqual(["a", "b"]);
    expect(fuera.map((f) => f.motivo)).toEqual([
      expect.stringContaining("cuotas pactadas"),
      expect.stringContaining("USD"),
      expect.stringContaining("a favor suyo"),
    ]);
  });
});

describe("huella", () => {
  it("es estable sin importar el orden y cambia con un saldo", () => {
    const a = partidas();
    const b = partidas({ adelantos: [...a.adelantos].reverse() });
    expect(huellaDe(a)).toBe(huellaDe(b));
    expect(huellaDe(a)).toMatch(/^[0-9a-f]{8}$/);
    const c = partidas({ adelantos: [{ ...a.adelantos[0], saldo: 599.99 }, a.adelantos[1]] });
    expect(huellaDe(c)).not.toBe(huellaDe(a));
    const d = partidas({ forestal: { saldo: -800, desde: null, movimientos: [mov(), mov({ id: "m2", tipo: "cargo", monto: 0.01 })] } });
    expect(huellaDe(d)).not.toBe(huellaDe(a));
  });
});

describe("código LIQ", () => {
  it("por tenant y año, sale de los emitidos y se busca como se dicta", () => {
    expect(siguienteCodigo(["LIQ-2026-0001", "LIQ-2026-0002"], 2026, PREFIJO_LIQUIDACION)).toBe("LIQ-2026-0003");
    expect(siguienteCodigo(["LIQ-2025-0040"], 2026, PREFIJO_LIQUIDACION)).toBe("LIQ-2026-0001");
    expect(normalizarBusquedaCodigo("liq-2026-7", PREFIJO_LIQUIDACION)).toBe("LIQ-2026-0007");
  });
});

describe("anular", () => {
  it("sólo la última viva", () => {
    expect(motivoNoSePuedeAnular({ id: "l1", anulada: false }, { id: "l2", codigo: "LIQ-2026-0005" })).toContain("Anula primero LIQ-2026-0005");
    expect(motivoNoSePuedeAnular({ id: "l2", anulada: false }, { id: "l2", codigo: "LIQ-2026-0005" })).toBeNull();
    expect(motivoNoSePuedeAnular({ id: "l2", anulada: true }, null)).toContain("ya está anulada");
  });
});

describe("céntimos", () => {
  it("0.1 + 0.2 no deja cola", () => {
    const p = partidas({
      cruzable: false,
      forestal: null,
      adelantos: [
        { adelantoId: "a1", codigo: "A", fecha: "2026-08-01", saldo: 0.1, modalidad: "CUENTA_CORRIENTE" },
        { adelantoId: "a2", codigo: "B", fecha: "2026-08-02", saldo: 0.2, modalidad: "CUENTA_CORRIENTE" },
      ],
    });
    expect(saldosDe(p).adelantosTeDebe).toBe(0.3);
    const r = plan(p, intencion({ pago: { direccion: "recibido", monto: 0.3, metodo: "efectivo", moverCaja: false } }));
    expect(r.despues).toEqual({ adelantosTeDebe: 0, maderaSaldo: 0, neto: 0 });
  });
});

describe("el mismo neto que la fila de la persona", () => {
  it("saldosDe coincide con unificarCuentas (sin EXCEDIDO)", () => {
    const [fila] = unificarCuentas({
      beneficiarios: [{ id: "b1", nombre: "Juana", documento: "12345678", telefono: null, forestPartyId: "p1" }],
      adelantos: [{ beneficiarioId: "b1", status: "ABIERTO", saldoPendiente: 1000, moneda: "PEN", cantidad: 2 }],
      partes: [{ id: "p1", nombre: "Juana", docNumero: "12345678", telefono: null }],
      movimientos: [mov()],
    });
    expect(saldosDe(partidas()).neto).toBe(fila.neto);
  });
});

describe("la cuenta forestal", () => {
  it("la deuda está viva desde el último momento en que volvió a cero", () => {
    const movs = [
      mov({ id: "1", fecha: "2026-08-01", tipo: "cargo", monto: 100 }),
      mov({ id: "2", fecha: "2026-08-05", tipo: "abono", monto: 100 }),
      mov({ id: "3", fecha: "2026-08-09", tipo: "cargo", monto: 50 }),
    ];
    expect(fechaDeudaViva(movs)).toBe("2026-08-09");
    expect(fechaDeudaViva(movs.slice(0, 2))).toBeNull();
  });

  it("lo que se paga cubre por antigüedad", () => {
    const movs = [
      mov({ id: "1", fecha: "2026-08-01", tipo: "abono", monto: 500 }),
      mov({ id: "2", fecha: "2026-08-05", tipo: "abono", monto: 300 }),
    ];
    expect(cargosCubiertosPorAntiguedad(movs, 600).map((c) => [c.movimientoId, c.cubierto])).toEqual([["1", 500], ["2", 100]]);
  });

  it("el acta congela cada pata con el código del acto", () => {
    const p = plan(partidas(), intencion({ compensar: 800 }));
    const d = detalleDeLiquidacion(p, { codigo: "LIQ-2026-0001", entregaIds: ["e1", "e2"], movimientoIds: ["m9"] });
    expect(d.v).toBe(1);
    expect(d.entregas[0]).toMatchObject({ entregaId: "e1", descripcion: "Cruce LIQ-2026-0001 con la cuenta forestal" });
    expect(d.movimientos[0].notas).toMatch(/^LIQ-2026-0001 · /);
  });
});

describe("entrada", () => {
  it("pide algo que liquidar y una clave de idempotencia", () => {
    const base = { persona: { beneficiarioId: "b1" }, fecha: "2026-09-01", huella: "abcd1234" };
    expect(liquidacionInputSchema.safeParse({ ...base, idempotencyKey: crypto.randomUUID(), compensar: 0, pago: null }).success).toBe(false);
    expect(liquidacionInputSchema.safeParse({ ...base, idempotencyKey: "no-es-uuid", compensar: 10, pago: null }).success).toBe(false);
    expect(liquidacionInputSchema.safeParse({ ...base, idempotencyKey: crypto.randomUUID(), compensar: 10, pago: null }).success).toBe(true);
  });
});

describe("la huella mira las fechas", () => {
  it("cambiar la fecha de un movimiento o de un adelanto cambia la huella: el reparto FIFO sale de ellas", () => {
    const a = partidas();
    const movMovido = partidas({ forestal: { saldo: -800, desde: "2026-07-01T00:00:00.000Z", movimientos: [mov({ fecha: "2026-07-01T00:00:00.000Z" })] } });
    expect(huellaDe(movMovido)).not.toBe(huellaDe(a));
    const adelantoMovido = partidas({ adelantos: [{ ...a.adelantos[0], fecha: "2026-08-20T12:00:00.000Z" }, a.adelantos[1]] });
    expect(huellaDe(adelantoMovido)).not.toBe(huellaDe(a));
  });
});

describe("fecha de la liquidación", () => {
  const base = { idempotencyKey: crypto.randomUUID(), persona: { beneficiarioId: "b1" }, compensar: 10, pago: null, huella: "abcd1234" };

  it("una fecha futura se rechaza, con el motivo en tuteo", () => {
    const r = liquidacionInputSchema.safeParse({ ...base, fecha: "2999-01-01" });
    expect(r.success).toBe(false);
    expect(r.success ? "" : r.error.issues[0]?.message).toBe("La fecha no puede ser futura: usa la de hoy o una pasada.");
  });

  it("hoy (Lima) y una fecha pasada se aceptan", () => {
    expect(liquidacionInputSchema.safeParse({ ...base, fecha: limaDateKey() }).success).toBe(true);
    expect(liquidacionInputSchema.safeParse({ ...base, fecha: "2026-01-02" }).success).toBe(true);
  });
});
