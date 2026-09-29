/**
 * ADR-448 — Adelantos en las dos direcciones: todo lo PURO.
 *
 * El adelanto sólo sabía «el negocio da». Con RECIBIDO, cada lector que suma
 * saldos tiene que saber de qué lado está la plata, o un pago adelantado por el
 * aserrío se cobra como deuda. Acá: la tabla dirección × estado, las cuentas por
 * persona con el caso real de WASACO en Blas, la liquidación (que nunca cobra lo
 * recibido), el estado de cuenta, el recibo, el CSV y la cobranza.
 */

import { describe, expect, it } from "vitest";
import {
  cajaAlCrear,
  cajaAlDevolver,
  cuentaParaTope,
  problemaDeDireccion,
  quienDebe,
  saldoConSigno,
  whereDireccion,
  SOLO_DADOS,
} from "@/lib/adelantos/direccion";
import { cumplimientoDe, resumirPersona } from "@/lib/adelantos/saldo-persona";
import { unificarCuentas } from "@/lib/adelantos/cuenta-unificada";
import {
  clasificarAdelantos,
  huellaDe,
  intencionDejarEnCero,
  planLiquidacion,
  saldosDe,
  type PartidasDePersona,
} from "@/lib/cuentas/liquidacion";
import { limpiarMotivo, motivoLegible } from "@/lib/forestal/motivo";
import { mensajeMovioCaja, movimientoDelAlta } from "@/lib/adelantos/direccion";
import { estadoCuentaUnificado, totalesDeEstadoCuenta } from "@/lib/adelantos/estado-cuenta-unificado";
import { movimientosDePersona } from "@/lib/adelantos/estado-cuenta";
import { textosDelComprobante } from "@/lib/adelantos/comprobante";
import { adelantosACsv } from "@/lib/adelantos/exportar-csv";
import { deudoresDeCobranza } from "@/lib/adelantos/urgencia-cobranza";
import { proximosVencimientos } from "@/lib/adelantos/proximos-vencimientos";
import { adelantosDe, sugerirRepetir, yaTuvoAdelantoHoy } from "@/lib/adelantos/sugerencias";
import { resumirBalance, type BalanceContrato } from "@/lib/forestal/contratos";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import type { MovimientoCuenta } from "@/lib/forestal/cuenta-corriente";

// ── 1. La tabla ──────────────────────────────────────────────────────────────

describe("quién le debe a quién (dirección × estado)", () => {
  const casos: [string, string, number, "te-debe" | "le-debes" | null, number][] = [
    ["DADO", "ABIERTO", 100, "te-debe", 100],
    ["DADO", "EXCEDIDO", -40, "le-debes", -40],
    ["DADO", "LIQUIDADO", 0, null, 0],
    ["DADO", "CANCELADO", 100, null, 0],
    ["RECIBIDO", "ABIERTO", 100, "le-debes", -100],
    ["RECIBIDO", "EXCEDIDO", -40, "te-debe", 40],
    ["RECIBIDO", "LIQUIDADO", 0, null, 0],
    ["RECIBIDO", "CANCELADO", 100, null, 0],
  ];
  it.each(casos)("%s %s saldo %d → %s (%d con signo)", (direccion, status, saldo, quien, conSigno) => {
    const a = { direccion, status, saldoPendiente: saldo };
    expect(quienDebe(a)).toBe(quien);
    expect(saldoConSigno(a)).toBe(conSigno);
  });

  it("sin dirección (las filas de antes) se lee DADO", () => {
    expect(quienDebe({ status: "ABIERTO", saldoPendiente: 50 })).toBe("te-debe");
  });

  it("la caja: dar saca, recibir entra; devolver va al revés", () => {
    expect(cajaAlCrear("DADO")).toBe("egreso");
    expect(cajaAlCrear("RECIBIDO")).toBe("ingreso");
    expect(cajaAlDevolver("DADO")).toBe("ingreso");
    expect(cajaAlDevolver("RECIBIDO")).toBe("egreso");
  });

  it("el tope sólo cuenta lo DADO abierto en soles", () => {
    expect(cuentaParaTope({ direccion: "DADO", status: "ABIERTO", moneda: "PEN" })).toBe(true);
    expect(cuentaParaTope({ direccion: "RECIBIDO", status: "ABIERTO", moneda: "PEN" })).toBe(false);
    expect(cuentaParaTope({ direccion: "DADO", status: "ABIERTO", moneda: "USD" })).toBe(false);
  });

  it("la misma regla que el CHECK de la base", () => {
    expect(problemaDeDireccion({ direccion: "DADO" })).toBeNull();
    expect(problemaDeDireccion({})).toBeNull();
    expect(problemaDeDireccion({ direccion: "DADO", conceptoRecibido: "SERVICIO" })).toMatch(/no lleva concepto/);
    expect(problemaDeDireccion({ direccion: "RECIBIDO" })).toMatch(/Elige/);
    expect(problemaDeDireccion({ direccion: "RECIBIDO", conceptoRecibido: "OTRO" })).toMatch(/Elige/);
    expect(
      problemaDeDireccion({ direccion: "RECIBIDO", conceptoRecibido: "PRESTAMO", modalidad: "DESCUENTO_PLANILLA" }),
    ).toMatch(/planilla/);
    expect(problemaDeDireccion({ direccion: "RECIBIDO", conceptoRecibido: "SERVICIO", modalidad: "CUENTA_CORRIENTE" })).toBeNull();
  });

  it("el filtro de lectura: sin pedir nada, sólo lo dado", () => {
    expect(SOLO_DADOS).toEqual({ direccion: "DADO" });
    expect(whereDireccion(undefined)).toEqual({ direccion: "DADO" });
    expect(whereDireccion("RECIBIDO")).toEqual({ direccion: "RECIBIDO" });
    expect(whereDireccion("todas")).toEqual({});
  });
});

// ── 2. Saldo por persona: WASACO en Blas ─────────────────────────────────────

/** Blas, 28-09: ADL-0002 «deuda anterior» dada; ADL-0003/4 pagos por aserrío, como SERÍAN re-marcados. */
const WASACO = [
  { montoAdelantado: 3217, saldoPendiente: 3217, moneda: "PEN", status: "ABIERTO", direccion: "DADO", fechaAdelanto: "2026-09-27T15:00:00.000Z" },
  { montoAdelantado: 1731, saldoPendiente: 1731, moneda: "PEN", status: "ABIERTO", direccion: "RECIBIDO", fechaAdelanto: "2026-09-27T15:10:00.000Z" },
  { montoAdelantado: 1300, saldoPendiente: 1300, moneda: "PEN", status: "ABIERTO", direccion: "RECIBIDO", fechaAdelanto: "2026-09-27T15:20:00.000Z" },
];

describe("resumirPersona con lo recibido (2.6)", () => {
  it("WASACO: te debe 3 217, le debes 3 031, neto 186", () => {
    const r = resumirPersona(WASACO);
    expect(r.teDebe).toEqual({ PEN: 3217 });
    expect(r.leDebes).toEqual({ PEN: 3031 });
    expect(r.neto).toEqual({ PEN: 186 });
    expect(r.recibidoPendiente).toEqual({ PEN: 3031 });
    expect(r.recibidosAbiertos).toBe(2);
  });

  it("los campos de siempre siguen siendo lo DADO: el tope no ve lo recibido", () => {
    const r = resumirPersona(WASACO);
    expect(r.saldoPendiente).toEqual({ PEN: 3217 });
    expect(r.adelantosAbiertos).toBe(1);
    expect(r.totalAdelantado).toEqual({ PEN: 3217 });
    // «último adelanto» es lo último que se le DIO, no lo que te dio.
    expect(r.ultimoAdelanto).toBe("2026-09-27T15:00:00.000Z");
  });

  it("el cumplimiento se mide sólo con lo dado", () => {
    const sinRecibidos = resumirPersona([{ montoAdelantado: 1000, saldoPendiente: 250, moneda: "PEN", status: "ABIERTO" }]);
    const conRecibidos = resumirPersona([
      { montoAdelantado: 1000, saldoPendiente: 250, moneda: "PEN", status: "ABIERTO" },
      { montoAdelantado: 9000, saldoPendiente: 9000, moneda: "PEN", status: "ABIERTO", direccion: "RECIBIDO" },
    ]);
    expect(cumplimientoDe(sinRecibidos)).toBe(75);
    expect(cumplimientoDe(conRecibidos)).toBe(75);
  });

  it("un recibido EXCEDIDO (le diste de más) va a «te debe», y un recibido anulado no pesa", () => {
    const r = resumirPersona([
      { montoAdelantado: 500, saldoPendiente: -80, moneda: "PEN", status: "EXCEDIDO", direccion: "RECIBIDO" },
      { montoAdelantado: 700, saldoPendiente: 700, moneda: "PEN", status: "CANCELADO", direccion: "RECIBIDO" },
    ]);
    expect(r.teDebe).toEqual({ PEN: 80 });
    expect(r.leDebes).toEqual({});
    expect(r.adelantosCancelados).toBe(0);
  });
});

// ── 7. Cuenta unificada: neto 12 509,02 ──────────────────────────────────────

describe("unificarCuentas resta lo recibido", () => {
  const movsAserrio: MovimientoCuenta[] = [
    {
      id: "m1",
      parteId: "p-wasaco",
      parteNombre: "WASACO",
      fecha: "2026-09-20T00:00:00.000Z",
      tipo: "cargo",
      concepto: "aserrio_prestado",
      monto: 12323.02,
      referencia: "32 corridas",
      moneda: "PEN",
    } as MovimientoCuenta,
  ];
  const filas = unificarCuentas({
    beneficiarios: [{ id: "b-wasaco", nombre: "Wasaco", documento: null, telefono: null, forestPartyId: "p-wasaco" }],
    adelantos: [
      { beneficiarioId: "b-wasaco", status: "ABIERTO", moneda: "PEN", saldoPendiente: 3217, cantidad: 1, direccion: "DADO" },
      { beneficiarioId: "b-wasaco", status: "ABIERTO", moneda: "PEN", saldoPendiente: 3031, cantidad: 2, direccion: "RECIBIDO" },
    ],
    partes: [{ id: "p-wasaco", nombre: "WASACO", docNumero: null, telefono: null }],
    movimientos: movsAserrio,
  });

  it("WASACO vinculada: 3 217 − 3 031 + 12 323,02 = 12 509,02 te debe", () => {
    expect(filas).toHaveLength(1);
    expect(filas[0].neto).toBe(12509.02);
    expect(filas[0].adelantos).toMatchObject({ teDebe: 3217, recibidoPendiente: 3031, leDebes: 3031, neto: 186, abiertos: 1, recibidosAbiertos: 2 });
  });

  it("una persona que sólo te dio plata no desaparece de la lista", () => {
    const solo = unificarCuentas({
      beneficiarios: [{ id: "b1", nombre: "Ana", documento: null, telefono: null, forestPartyId: null }],
      adelantos: [{ beneficiarioId: "b1", status: "ABIERTO", moneda: "PEN", saldoPendiente: 500, cantidad: 1, direccion: "RECIBIDO" }],
      partes: [],
      movimientos: [],
    });
    expect(solo[0].neto).toBe(-500);
    expect(solo[0].adelantos?.leDebes).toBe(500);
  });
});

// ── 6. Liquidar la cuenta: lo recibido nunca se cobra ────────────────────────

describe("liquidación (ADR-413) con lo recibido", () => {
  const fila = (id: string, direccion: string, saldo: number, status = "ABIERTO") => ({
    id,
    codigo: `ADL-2026-000${id}`,
    fecha: `2026-09-2${id}T15:00:00.000Z`,
    saldo,
    moneda: "PEN",
    modalidad: "CUENTA_CORRIENTE",
    status,
    cuotasPactadas: 0,
    direccion,
  });

  it("lo RECIBIDO no entra al FIFO: el abierto en soles va a `recibidos` (ADR-449), no a `fuera`", () => {
    const { adelantos, recibidos, fuera } = clasificarAdelantos([fila("2", "DADO", 3217), fila("3", "RECIBIDO", 1731), fila("4", "RECIBIDO", 1300)]);
    expect(adelantos.map((a) => a.adelantoId)).toEqual(["2"]);
    expect(recibidos.map((r) => [r.adelantoId, r.saldo])).toEqual([["3", 1731], ["4", 1300]]);
    expect(fuera).toHaveLength(0);
  });

  it("«Dejar en cero» nunca le cobra lo que el negocio le debe", () => {
    const { adelantos, recibidos, fuera } = clasificarAdelantos([fila("2", "DADO", 3217), fila("3", "RECIBIDO", 1731)]);
    const partidas: PartidasDePersona = {
      persona: { beneficiarioId: "b", parteId: null, nombre: "Wasaco", documento: null },
      cruzable: false,
      adelantos,
      recibidos,
      forestal: null,
      fuera,
    };
    const r = planLiquidacion(partidas, {
      fecha: "2026-09-29",
      compensar: 0,
      pago: { direccion: "recibido", monto: 3217, metodo: "efectivo", moverCaja: false },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.entregas.map((e) => e.adelantoId)).toEqual(["2"]);
    // Pedir más que lo dado es rechazado: lo recibido no suma a «te debe».
    const deMas = planLiquidacion(partidas, {
      fecha: "2026-09-29",
      compensar: 0,
      pago: { direccion: "recibido", monto: 3217 + 1731, metodo: "efectivo", moverCaja: false },
    });
    expect(deMas.ok).toBe(false);
  });

  it("la huella cambia si cambia la dirección aunque el monto sea el mismo", () => {
    const base = (f: ReturnType<typeof fila>): PartidasDePersona => {
      const { adelantos, recibidos, fuera } = clasificarAdelantos([f]);
      return { persona: { beneficiarioId: "b", parteId: null, nombre: "X", documento: null }, cruzable: false, adelantos, recibidos, forestal: null, fuera };
    };
    /* Un DADO excedido de 100 y un RECIBIDO abierto de 100 son el mismo monto con
       el mismo código: sin la dirección, la misma huella. Desde ADR-449 el
       recibido va a `recibidos` y el excedido a `fuera`. */
    const dadoExcedido = base(fila("7", "DADO", -100, "EXCEDIDO"));
    const recibidoAbierto = base(fila("7", "RECIBIDO", 100));
    expect(dadoExcedido.fuera[0].monto).toBe(recibidoAbierto.recibidos?.[0].saldo);
    expect(huellaDe(dadoExcedido)).not.toBe(huellaDe(recibidoAbierto));
  });

  it("la huella distingue un recibido abierto de uno excedido del mismo monto", () => {
    const de = (f: ReturnType<typeof fila>): PartidasDePersona => {
      const { adelantos, recibidos, fuera } = clasificarAdelantos([f]);
      return { persona: { beneficiarioId: "b", parteId: null, nombre: "X", documento: null }, cruzable: false, adelantos, recibidos, forestal: null, fuera };
    };
    expect(huellaDe(de(fila("8", "RECIBIDO", 100)))).not.toBe(huellaDe(de(fila("8", "RECIBIDO", -100, "EXCEDIDO"))));
  });

  it("lo anterior a ADR-448 da la misma huella que antes", () => {
    const { adelantos, fuera } = clasificarAdelantos([fila("1", "DADO", -50, "EXCEDIDO")]);
    expect(fuera[0].direccion).toBeUndefined();
    const p: PartidasDePersona = { persona: { beneficiarioId: "b", parteId: null, nombre: "X", documento: null }, cruzable: false, adelantos, forestal: null, fuera };
    const sinCampo = { ...p, fuera: fuera.map(({ direccion: _d, ...f }) => f) };
    expect(huellaDe(p)).toBe(huellaDe(sinCampo));
  });
});

// ── 3 (revisión). «Dejar en cero» y los saldos de la liquidación ─────────────

describe("«Dejar en cero» con plata recibida", () => {
  const f = (id: string, direccion: string, saldo: number, status = "ABIERTO") => ({
    id,
    codigo: `ADL-2026-000${id}`,
    fecha: `2026-09-2${id}T15:00:00.000Z`,
    saldo,
    moneda: "PEN",
    modalidad: "CUENTA_CORRIENTE",
    status,
    cuotasPactadas: 0,
    direccion,
  });
  const partidas = (filas: ReturnType<typeof f>[], forestal: number | null): PartidasDePersona => {
    const { adelantos, recibidos, fuera } = clasificarAdelantos(filas);
    return {
      persona: { beneficiarioId: "b-wasaco", parteId: forestal == null ? null : "p-wasaco", nombre: "WASACO", documento: null },
      cruzable: forestal != null,
      adelantos,
      recibidos,
      forestal: forestal == null ? null : { saldo: forestal, desde: null, movimientos: [] },
      fuera,
    };
  };

  it("WASACO vinculado (dado 3 217, recibido 3 031, aserríos 12 323,02): cruza 3 031 y cobra 12 509,02 (ADR-449)", () => {
    const p = partidas([f("2", "DADO", 3217), f("3", "RECIBIDO", 1731), f("4", "RECIBIDO", 1300)], 12323.02);
    /* ADR-448 lo dejaba en null (cobraba 15 540,02 si no). ADR-449 cruza lo
       recibido contra los aserríos y cobra el resto: nunca más de lo que debe. */
    expect(intencionDejarEnCero(p, "2026-09-29", "efectivo", true)).toEqual({
      fecha: "2026-09-29",
      compensar: 0,
      cruzarRecibido: 3031,
      pago: { direccion: "recibido", monto: 12509.02, metodo: "efectivo", moverCaja: true },
    });
    expect(saldosDe(p)).toEqual({
      adelantosTeDebe: 3217,
      maderaSaldo: 12323.02,
      recibidoLeDebes: 3031,
      recibidoTeDebe: 0,
      neto: 12509.02,
    });
  });

  it("sin cuenta forestal (dado 500, recibido 1 731): no propone cobrar 500 y decir «en cero»", () => {
    const p = partidas([f("2", "DADO", 500), f("3", "RECIBIDO", 1731)], null);
    expect(intencionDejarEnCero(p, "2026-09-29", "efectivo", true)).toBeNull();
    expect(saldosDe(p).neto).toBe(-1231);
  });

  it("sin recibidos, «dejar en cero» sigue igual que siempre", () => {
    const p = partidas([f("2", "DADO", 500)], null);
    expect(intencionDejarEnCero(p, "2026-09-29", "efectivo", true)).toEqual({
      fecha: "2026-09-29",
      compensar: 0,
      pago: { direccion: "recibido", monto: 500, metodo: "efectivo", moverCaja: true },
    });
  });

  it("un pago a mano deja lo recibido en el «después»: el recibo no dice «en cero»", () => {
    const p = partidas([f("2", "DADO", 500), f("3", "RECIBIDO", 1731)], null);
    const r = planLiquidacion(p, { fecha: "2026-09-29", compensar: 0, pago: { direccion: "recibido", monto: 500, metodo: "efectivo", moverCaja: false } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.antes.neto).toBe(-1231);
    expect(r.plan.despues).toMatchObject({ adelantosTeDebe: 0, recibidoLeDebes: 1731, neto: -1731 });
  });

  it("un recibido excedido (le diste de más) suma a lo que te debe", () => {
    const p = partidas([f("3", "RECIBIDO", -80, "EXCEDIDO")], null);
    expect(saldosDe(p)).toMatchObject({ recibidoLeDebes: 0, recibidoTeDebe: 80, neto: 80 });
  });
});

// ── 1 (revisión). ¿El alta movió la caja? ────────────────────────────────────

describe("movimientoDelAlta (guard del doble pago)", () => {
  /* Los movimientos de Blas tal cual (lectura del 28-09). */
  const blas = [
    { type: "egreso", amount: 3642, description: "Adelanto ADL-2026-0001 · MAMA DE ALEX", createdAt: "2026-08-29T00:55:51.106Z" },
    { type: "egreso", amount: 3217, description: "Adelanto ADL-2026-0002 · Wasaco", createdAt: "2026-09-28T00:59:32.271Z" },
  ];
  const adl = (codigoOperacion: string | null, montoAdelantado: number, createdAt: string, direccion: "DADO" | "RECIBIDO" = "DADO") => ({
    codigoOperacion,
    montoAdelantado,
    createdAt,
    direccion,
  });

  it("ADL-0002 (egreso del 27/09) está bloqueado; ADL-0003/4 (sin movimiento) no", () => {
    const m = movimientoDelAlta(adl("ADL-2026-0002", 3217, "2026-09-28T00:59:30Z"), blas);
    expect(m?.description).toBe("Adelanto ADL-2026-0002 · Wasaco");
    expect(mensajeMovioCaja("DADO", m!)).toBe(
      "Esta plata salió de tu caja el 27/09 (S/ 3,217.00). Para cambiarla a recibida, anúlala devolviendo la plata a la caja y regístrala de nuevo como recibida.",
    );
    expect(movimientoDelAlta(adl("ADL-2026-0003", 1731, "2026-09-28T01:01:00Z"), blas)).toBeNull();
    expect(movimientoDelAlta(adl("ADL-2026-0004", 1300, "2026-09-28T01:02:00Z"), blas)).toBeNull();
  });

  it("el código es palabra entera: ADL-2026-000 no calza con ADL-2026-0002", () => {
    expect(movimientoDelAlta(adl("ADL-2026-000", 1, "2026-09-28T01:01:00Z"), blas)).toBeNull();
  });

  it("un recibido que entró a la caja también se bloquea al revés", () => {
    const m = movimientoDelAlta(adl("ADL-2026-0025", 1731, "2026-09-29T06:17:15Z", "RECIBIDO"), [
      { type: "ingreso", amount: 1731, description: "Adelanto recibido ADL-2026-0025 · Wasaco", createdAt: "2026-09-29T06:17:16Z" },
    ]);
    expect(mensajeMovioCaja("RECIBIDO", m!)).toMatch(/^Esta plata entró a tu caja el 29\/09 \(S\/ 1,731\.00\)\. Para cambiarla a dada/);
  });

  it("CON código, un egreso anotado a mano (sin código) del mismo monto ese día también bloquea", () => {
    const manual = [{ type: "egreso", amount: 1731, description: "Pago Wasaco aserrío", createdAt: "2026-09-28T02:10:00Z" }];
    expect(movimientoDelAlta(adl("ADL-2026-0003", 1731, "2026-09-28T01:01:00Z"), manual)).not.toBeNull();
    // Del otro sentido (un ingreso) no es el alta de un dado.
    expect(movimientoDelAlta(adl("ADL-2026-0003", 1731, "2026-09-28T01:01:00Z"), [{ ...manual[0], type: "ingreso" }])).toBeNull();
    // El de OTRO adelanto o de una liquidación se explica por su código.
    expect(movimientoDelAlta(adl("ADL-2026-0003", 1731, "2026-09-28T01:01:00Z"), [{ ...manual[0], description: "Adelanto ADL-2026-0009 · Otro" }])).toBeNull();
    expect(movimientoDelAlta(adl("ADL-2026-0003", 1731, "2026-09-28T01:01:00Z"), [{ ...manual[0], description: "Liquidación LIQ-2026-0002 · Otro" }])).toBeNull();
  });

  it("sin código: monto exacto + mismo día de Lima + el sentido del alta", () => {
    const movs = [{ type: "egreso", amount: 17000, description: "Adelanto · MAMA DE ALEX", createdAt: "2026-08-04T04:35:02Z" }];
    expect(movimientoDelAlta(adl(null, 17000, "2026-08-04T04:35:00Z"), movs)).not.toBeNull();
    // Otro día de Lima: no es el del alta.
    expect(movimientoDelAlta(adl(null, 17000, "2026-08-05T15:00:00Z"), movs)).toBeNull();
    // Otro monto: tampoco.
    expect(movimientoDelAlta(adl(null, 16999, "2026-08-04T04:35:00Z"), movs)).toBeNull();
    // La apertura de caja no es un movimiento del alta.
    expect(movimientoDelAlta(adl(null, 0, "2026-08-04T04:35:00Z"), [{ type: "apertura", amount: 0, description: "Apertura", createdAt: "2026-08-04T04:35:00Z" }])).toBeNull();
  });
});

// ── 8 (revisión). Motivo con invisibles ──────────────────────────────────────

describe("motivo: los invisibles que trim() no quita", () => {
  it.each([
    ["espacio de ancho cero", "\u200B\u200Bab"],
    ["controles de dirección LRE/RLO", "\u202A\u202Eab"],
    ["aislantes LRI/PDI", "\u2066\u2069ab"],
    ["guion blando", "\u00AD\u00ADab"],
    // Los rellenos Hangul: `\p{L}` los cuenta como letras y se ven en blanco.
    ["relleno Hangul (U+3164)", "\u3164\u3164\u3164"],
    ["rellenos Hangul de sílaba (U+115F, U+1160)", "\u115F\u1160\u115F"],
    ["relleno Hangul de ancho medio (U+FFA0)", "\uFFA0\uFFA0\uFFA0"],
  ])("%s no cuentan como letras", (_n, texto) => {
    expect(motivoLegible(texto)).toBe(false);
  });

  it("se quitan de lo que se guarda", () => {
    expect(limpiarMotivo("\u202Eerror\u202C de carga\u00AD")).toBe("error de carga");
    expect(motivoLegible("Era un préstamo")).toBe(true);
  });
});

// ── Estado de cuenta: el signo al revés ──────────────────────────────────────

const adel = (p: Partial<DbAdelanto> & { id: string }): DbAdelanto =>
  ({
    tenantId: "t1",
    beneficiarioId: "b1",
    modalidad: "CUENTA_CORRIENTE",
    montoAdelantado: 1000,
    moneda: "PEN",
    fechaAdelanto: "2026-09-10T17:00:00.000Z",
    status: "ABIERTO",
    saldoPendiente: 1000,
    totalEntregado: 0,
    direccion: "DADO",
    conceptoRecibido: null,
    entregas: [],
    entregasPactadas: [],
    createdAt: "2026-09-10T17:00:00.000Z",
    updatedAt: "2026-09-10T17:00:00.000Z",
    ...p,
  }) as DbAdelanto;

describe("estado de cuenta con lo recibido", () => {
  it("el recibido resta y lo que le das para devolverlo suma; el neto cuadra con la cuenta unificada", () => {
    const lineas = estadoCuentaUnificado(
      [
        { status: "ABIERTO", codigoOperacion: "ADL-1", fechaAdelanto: "2026-09-10T17:00:00.000Z", montoAdelantado: 500, moneda: "PEN", entregas: [] },
        {
          status: "ABIERTO",
          codigoOperacion: "ADL-2",
          fechaAdelanto: "2026-09-11T17:00:00.000Z",
          montoAdelantado: 1731,
          moneda: "PEN",
          direccion: "RECIBIDO",
          entregas: [{ fecha: "2026-09-12T17:00:00.000Z", descripcion: "Aserrío 400 pt", valor: 200 }],
        },
      ],
      [],
    );
    expect(lineas.map((l) => [l.concepto, l.monto])).toEqual([
      ["Adelanto", 500],
      ["Adelanto recibido", -1731],
      ["Aserrío 400 pt", 200],
    ]);
    // 500 − (1731 − 200) = −1031: le debes 1 031.
    expect(totalesDeEstadoCuenta(lineas).neto).toBe(-1031);
  });

  it("el de la ficha (WhatsApp) también", () => {
    const movs = movimientosDePersona([
      adel({ id: "r", direccion: "RECIBIDO", conceptoRecibido: "PRESTAMO", codigoOperacion: "ADL-9", montoAdelantado: 800 }),
    ]);
    expect(movs[0]).toMatchObject({ concepto: "Adelanto recibido ADL-9", monto: -800, saldo: -800 });
  });
});

// ── Recibo, CSV ──────────────────────────────────────────────────────────────

describe("el recibo se invierte en lo recibido", () => {
  const base = { persona: "Wasaco", monto: 1731, fecha: "2026-09-27T15:00:00.000Z", modalidad: "CUENTA_CORRIENTE", negocio: "Inversiones Blas" };

  it("DADO: el papel de siempre, lo firma la persona", () => {
    const t = textosDelComprobante(base);
    expect(t.titulo).toBe("COMPROBANTE DE ADELANTO");
    expect(t.recibiDe).toBe("Inversiones Blas");
    expect(t.nombre).toBe("Wasaco");
    expect(t.declaracion).toMatch(/^Declaro haber recibido/);
  });

  it("RECIBIDO: recibí de la persona, firma y se compromete el negocio", () => {
    const t = textosDelComprobante({ ...base, direccion: "RECIBIDO", conceptoRecibido: "SERVICIO" });
    expect(t.titulo).toBe("COMPROBANTE DE ADELANTO RECIBIDO");
    expect(t.recibiDe).toBe("Wasaco");
    expect(t.nombre).toBe("Inversiones Blas");
    expect(t.declaracion).toMatch(/^Inversiones Blas declara haber recibido .* servicio acordado/);
    expect(t.firmaDerecha).toBe("Recibí conforme · Inversiones Blas");
  });
});

describe("el CSV dice la dirección", () => {
  it("columna «Dirección» con el concepto del recibido", () => {
    const csv = adelantosACsv([
      adel({ id: "d", codigoOperacion: "ADL-1" }),
      adel({ id: "r", codigoOperacion: "ADL-2", direccion: "RECIBIDO", conceptoRecibido: "PRESTAMO" }),
    ]);
    const [cab, dado, recibido] = csv.replace(/^﻿/, "").split("\n").map((l) => l.split(";"));
    const col = cab.indexOf("Dirección");
    expect(col).toBeGreaterThan(-1);
    expect(dado[col]).toBe("Plata que diste");
    expect(recibido[col]).toBe("Plata que recibiste · Préstamo que te hicieron");
  });
});

// ── Cobranza: lo recibido no es un deudor ────────────────────────────────────

describe("la cobranza ignora lo recibido", () => {
  const ahora = new Date("2026-09-29T15:00:00.000Z").getTime();
  const lista = [
    adel({ id: "d", fechaAdelanto: "2026-07-01T15:00:00.000Z", fechaVencimiento: "2026-09-30T00:00:00.000Z" }),
    adel({ id: "r", beneficiarioId: "b2", direccion: "RECIBIDO", conceptoRecibido: "SERVICIO", fechaAdelanto: "2026-07-01T15:00:00.000Z", fechaVencimiento: "2026-09-30T00:00:00.000Z" }),
  ];

  it("urgencia: un solo deudor, el del adelanto dado", () => {
    const deudores = deudoresDeCobranza(lista, ahora);
    expect(deudores.map((d) => d.id)).toEqual(["b1"]);
  });

  it("próximos vencimientos: sólo el dado", () => {
    expect(proximosVencimientos(lista, 7, ahora).map((c) => c.adelantoId)).toEqual(["d"]);
  });

  it("sugerencias dentro de la misma dirección", () => {
    const hoy = [adel({ id: "r2", direccion: "RECIBIDO", conceptoRecibido: "PRESTAMO", fechaAdelanto: new Date(ahora).toISOString() })];
    expect(yaTuvoAdelantoHoy(hoy, "b1", ahora)).toBeNull();
    expect(yaTuvoAdelantoHoy(hoy, "b1", ahora, "RECIBIDO")?.id).toBe("r2");
    expect(sugerirRepetir(hoy, "b1", ahora, "RECIBIDO")).toMatchObject({ monto: 1000, conceptoRecibido: "PRESTAMO" });
    expect(adelantosDe(hoy, "b1")).toEqual([]);
  });
});

// ── Balance del permiso ──────────────────────────────────────────────────────

describe("el balance del permiso no cuenta lo recibido como egreso", () => {
  const bloque = (monto = 0) => ({ documentos: monto > 0 ? 1 : 0, monto });
  const b: BalanceContrato = {
    contratoId: "c1",
    madera: { ...bloque(0), m3: 0 },
    produccion: { ...bloque(0), m3: 0 },
    ventas: bloque(0),
    gastos: bloque(100),
    fletes: bloque(0),
    adelantos: bloque(500),
    adelantosSaldo: 500,
    adelantosRecibidos: bloque(3031),
    adelantosRecibidosSaldo: 3031,
    cuentaCargos: bloque(0),
    cuentaAbonos: bloque(0),
  };

  it("egresos y «por recuperar» son lo dado; lo recibido va a recibido / por devolver", () => {
    const r = resumirBalance(b);
    expect(r.egresos).toBe(600);
    expect(r.porRecuperar).toBe(500);
    expect(r.recibido).toBe(3031);
    expect(r.porDevolver).toBe(3031);
  });

  it("una respuesta en caché de antes (sin el bloque) no rompe", () => {
    const { adelantosRecibidos: _a, adelantosRecibidosSaldo: _s, ...viejo } = b;
    expect(resumirBalance(viejo).recibido).toBe(0);
    expect(resumirBalance(viejo).porDevolver).toBe(0);
  });
});
