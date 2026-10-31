/**
 * F12 (2026-09-29) — «Por cobrar» por moneda y con el cruce de «Lo que debo».
 *
 * 1. La cuenta forestal sumaba cargos y abonos de TODAS las monedas juntas
 *    (`saldosPorParte`): S/ 1 000 − USD 200 salía «debe 800», un número que no
 *    está en ninguna moneda.
 * 2. Quien está en las dos listas (te debe y le debes) no mostraba su neto en
 *    «Por cobrar». El cruce reusa las cifras de `armarPorPagar` para esa
 *    persona: acá se fija que las filas lo encuentran por la unión de «Cuenta
 *    por persona» (nunca por el nombre) y que el «te debe» que se muestra es
 *    la suma de las filas de esa persona en esta misma lista.
 *
 * La fixture WASACO es la de Blas (ADL-2026-0003/0004 = S/ 3 031 cuando se
 * corrijan a RECIBIDO; su parte, +S/ 12 323,02 a favor del CTP).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { armarPorPagar, type AdelantoParaPagar, type GrupoAdelanto } from "@/lib/finance/por-pagar";
import { unificarCuentas, type BeneficiarioParaUnificar } from "@/lib/adelantos/cuenta-unificada";
import type { MovimientoCuenta } from "@/lib/forestal/cuenta-corriente";

const H = vi.hoisted(() => ({
  fiados: [] as unknown[],
  prestamos: [] as unknown[],
  adelantos: [] as unknown[],
  movs: [] as unknown[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fiado: { findMany: async () => H.fiados },
    prestamo: { findMany: async () => H.prestamos },
    adelanto: { findMany: async () => H.adelantos },
    forestCuentaMov: { findMany: async () => H.movs },
  },
}));

const { PorCobrarDB, cruzarConLoQueDebes, resumirPorCobrar, saldosPorParte } = await import("@/lib/db/por-cobrar.db");

const HOY = "2026-09-29";
const WASACO_BENEF = "b-wasaco";
const WASACO_PARTE = "cmudjt95w001qtavznqmyfv42";

let n = 0;
const mov = (m: Partial<MovimientoCuenta> & Pick<MovimientoCuenta, "parteId" | "fecha" | "tipo" | "concepto" | "monto">): MovimientoCuenta => ({
  id: m.id ?? `m${++n}`,
  parteNombre: m.parteNombre ?? m.parteId,
  moneda: "PEN",
  referencia: null,
  fleteId: null,
  notas: null,
  gtfNumber: null,
  ...m,
});

/** La misma fila, como la devuelve Prisma a `getDetalle` (fecha como `Date`). */
const comoFila = (m: MovimientoCuenta) => ({
  parteId: m.parteId, parteNombre: m.parteNombre, tipo: m.tipo, monto: m.monto, fecha: new Date(m.fecha), moneda: m.moneda,
});

const benef = (id: string, extra: Partial<BeneficiarioParaUnificar> = {}): BeneficiarioParaUnificar => ({
  id, nombre: `Persona ${id}`, documento: null, telefono: null, forestPartyId: null, ...extra,
});

const adelanto = (a: Partial<AdelantoParaPagar> & Pick<AdelantoParaPagar, "id" | "beneficiarioId" | "direccion" | "status" | "saldoPendiente">): AdelantoParaPagar => ({
  beneficiarioNombre: null, codigoOperacion: null, reciboManual: null, conceptoRecibido: null,
  moneda: "PEN", fechaAdelanto: "2026-09-01", fechaVencimiento: null, ...a,
});

/** «Lo que debo» armado como lo arma su DB class: la unión sale de `unificarCuentas`. */
function loQueDebo(e: { beneficiarios: BeneficiarioParaUnificar[]; grupos: GrupoAdelanto[]; adelantos: AdelantoParaPagar[]; movimientos: MovimientoCuenta[] }) {
  return armarPorPagar({
    hoy: HOY,
    personas: unificarCuentas({
      beneficiarios: e.beneficiarios,
      adelantos: e.grupos.map((g) => ({ ...g, cantidad: 1 })),
      partes: [],
      movimientos: e.movimientos,
    }),
    grupos: e.grupos,
    adelantos: e.adelantos,
    cuentasPorPagar: [],
    prestamos: [],
  });
}

beforeEach(() => {
  H.fiados = [];
  H.prestamos = [];
  H.adelantos = [];
  H.movs = [];
});

describe("saldosPorParte — una fila por parte Y moneda", () => {
  it("S/ 1 000 de cargo y USD 200 de abono son dos saldos, no «debe 800»", () => {
    const saldos = saldosPorParte([
      { parteId: "p1", parteNombre: "Maderera", tipo: "cargo", monto: 1000, fecha: new Date("2026-09-01T00:00:00Z"), moneda: "PEN" },
      { parteId: "p1", parteNombre: "Maderera", tipo: "abono", monto: 200, fecha: new Date("2026-09-02T00:00:00Z"), moneda: "USD" },
    ]);
    expect(saldos.map((s) => [s.parteId, s.moneda, s.saldo])).toEqual([
      ["p1", "PEN", 1000],
      ["p1", "USD", -200],
    ]);
  });

  it("sin moneda o con moneda vacía es soles (el default del schema), en minúscula también", () => {
    const saldos = saldosPorParte([
      { parteId: "p1", parteNombre: "X", tipo: "cargo", monto: 100, fecha: new Date("2026-09-01T00:00:00Z") },
      { parteId: "p1", parteNombre: "X", tipo: "cargo", monto: 50, fecha: new Date("2026-09-01T00:00:00Z"), moneda: "" },
      { parteId: "p1", parteNombre: "X", tipo: "abono", monto: 30, fecha: new Date("2026-09-01T00:00:00Z"), moneda: "pen" },
    ]);
    expect(saldos).toHaveLength(1);
    expect(saldos[0]).toMatchObject({ moneda: "PEN", saldo: 120 });
  });
});

describe("resumirPorCobrar — cada moneda aparte", () => {
  it("los totales van por moneda (soles arriba) y los montos de siempre quedan en soles", () => {
    const fila = (id: string, tipo: "fiado" | "adelanto" | "madera", monto: number, moneda: string) =>
      ({ id, tipo, quien: id, monto, moneda, desde: null, vence: null, nota: null });
    const r = resumirPorCobrar([
      fila("u1", "adelanto", 100, "USD"),
      fila("a1", "adelanto", 500, "PEN"),
      fila("f1", "fiado", 30, "PEN"),
      fila("m1", "madera", 12323.02, "PEN"),
    ]);
    expect(r.totales).toEqual([
      { moneda: "PEN", total: 12853.02, count: 3 },
      { moneda: "USD", total: 100, count: 1 },
    ]);
    expect(r.porTipo.map((x) => [x.tipo, x.moneda, x.total])).toEqual([
      ["fiado", "PEN", 30],
      ["adelanto", "PEN", 500],
      ["adelanto", "USD", 100],
      ["madera", "PEN", 12323.02],
    ]);
    // Lo que lee el cron con «S/»: sin los USD 100.
    expect(r.adelantos).toEqual({ total: 500, count: 1 });
    expect(r.totalGeneral).toBe(12853.02);
  });
});

describe("getDetalle — cada fila con su moneda", () => {
  it("un adelanto en dólares y la madera en dos monedas no se suman como soles", async () => {
    H.adelantos = [
      { id: "a1", beneficiarioId: "b1", codigoOperacion: "ADL-1", reciboManual: null, moneda: "USD", saldoPendiente: 100, fechaAdelanto: null, fechaVencimiento: null, beneficiario: { nombre: "Don Julio" } },
    ];
    H.movs = [
      comoFila(mov({ parteId: "p1", parteNombre: "Maderera", fecha: "2026-09-01T00:00:00Z", tipo: "cargo", concepto: "madera", monto: 1000 })),
      comoFila(mov({ parteId: "p1", parteNombre: "Maderera", fecha: "2026-09-02T00:00:00Z", tipo: "cargo", concepto: "madera", monto: 40, moneda: "USD" })),
    ];
    const d = await PorCobrarDB.getDetalle("t1");
    expect(d.items.map((f) => [f.tipo, f.moneda, f.monto])).toEqual(
      expect.arrayContaining([["adelanto", "USD", 100], ["madera", "PEN", 1000], ["madera", "USD", 40]]),
    );
    expect(d.totales).toEqual([
      { moneda: "PEN", total: 1000, count: 1 },
      { moneda: "USD", total: 140, count: 2 },
    ]);
    expect(d.items.find((f) => f.tipo === "adelanto")?.beneficiarioId).toBe("b1");
  });
});

describe("cruzarConLoQueDebes — quien está en las dos listas", () => {
  /* WASACO: le debes S/ 3 031 (dos adelantos RECIBIDOS) y te debe S/ 12 323,02
     de aserrío en la cuenta forestal de SU parte, unida a mano. Además hay un
     cliente de fiado que se llama igual y NO es la misma persona. */
  const movsWasaco = [
    mov({ parteId: WASACO_PARTE, parteNombre: "WASACO", fecha: "2026-09-10T00:00:00Z", tipo: "cargo", concepto: "aserrio_prestado", monto: 12323.02 }),
  ];
  const fixture = () => {
    H.movs = movsWasaco.map(comoFila);
    H.fiados = [{ id: "f1", saldo: 30, descripcion: null, status: "ACTIVO", fechaVence: null, createdAt: new Date("2026-09-01T15:00:00Z"), customer: { name: "WASACO", phone: "999" } }];
    const pp = loQueDebo({
      beneficiarios: [benef(WASACO_BENEF, { nombre: "WASACO", forestPartyId: WASACO_PARTE })],
      grupos: [{ beneficiarioId: WASACO_BENEF, status: "ABIERTO", moneda: "PEN", direccion: "RECIBIDO", saldoPendiente: 3031 }],
      adelantos: [
        adelanto({ id: "r3", beneficiarioId: WASACO_BENEF, direccion: "RECIBIDO", conceptoRecibido: "SERVICIO", status: "ABIERTO", saldoPendiente: 1731, codigoOperacion: "ADL-2026-0003" }),
        adelanto({ id: "r4", beneficiarioId: WASACO_BENEF, direccion: "RECIBIDO", conceptoRecibido: "SERVICIO", status: "ABIERTO", saldoPendiente: 1300, codigoOperacion: "ADL-2026-0004" }),
      ],
      movimientos: movsWasaco,
    });
    return pp;
  };

  it("la madera de su parte lleva el cruce con las cifras de «Lo que debo»; el fiado del homónimo, no", async () => {
    const pp = fixture();
    const r = cruzarConLoQueDebes(await PorCobrarDB.getDetalle("t1"), pp);

    const madera = r.items.find((f) => f.tipo === "madera");
    const fiado = r.items.find((f) => f.tipo === "fiado");
    expect(madera?.cruce).toBe(`benef:${WASACO_BENEF}`);
    expect(fiado?.cruce).toBeNull();
    expect(r.cruces).toEqual([
      {
        clave: `benef:${WASACO_BENEF}`,
        nombre: "WASACO",
        teDebe: [{ moneda: "PEN", monto: 12323.02 }],
        leDebes: [{ moneda: "PEN", monto: 3031 }],
        neto: [{ moneda: "PEN", monto: 9292.02 }],
      },
    ]);
    // El mismo «se cruza en Liquidar» que muestra «Lo que debo».
    expect(r.cruzable).toEqual([{ moneda: "PEN", monto: 3031 }]);
    expect(r.cruzable[0].monto).toBe(pp.totales[0].cruzable);
    expect(r.crucesDisponibles).toBe(true);
  });

  it("nada de doble conteo: el total sigue siendo lo que te deben, y el «te debe» del cruce es la suma de SUS filas", async () => {
    const pp = fixture();
    const sin = await PorCobrarDB.getDetalle("t1");
    const r = cruzarConLoQueDebes(sin, pp);
    expect(r.totales).toEqual(sin.totales);
    expect(r.totalGeneral).toBe(12353.02);
    for (const c of r.cruces) {
      for (const t of c.teDebe) {
        const deSusFilas = r.items.filter((f) => f.cruce === c.clave && f.moneda === t.moneda).reduce((s, f) => s + f.monto, 0);
        expect(Math.round(deSusFilas * 100) / 100).toBe(t.monto);
      }
    }
  });

  it("un adelanto dado se ubica por su persona en Adelantos", async () => {
    H.adelantos = [
      { id: "d1", beneficiarioId: "b1", codigoOperacion: "ADL-9", reciboManual: null, moneda: "PEN", saldoPendiente: 500, fechaAdelanto: null, fechaVencimiento: null, beneficiario: { nombre: "Don Julio" } },
      { id: "d2", beneficiarioId: "b2", codigoOperacion: "ADL-8", reciboManual: null, moneda: "PEN", saldoPendiente: 80, fechaAdelanto: null, fechaVencimiento: null, beneficiario: { nombre: "Otro" } },
    ];
    const pp = loQueDebo({
      beneficiarios: [benef("b1", { nombre: "Don Julio" }), benef("b2", { nombre: "Otro" })],
      grupos: [
        { beneficiarioId: "b1", status: "ABIERTO", moneda: "PEN", direccion: "RECIBIDO", saldoPendiente: 3000 },
        { beneficiarioId: "b1", status: "ABIERTO", moneda: "PEN", direccion: "DADO", saldoPendiente: 500 },
        { beneficiarioId: "b2", status: "ABIERTO", moneda: "PEN", direccion: "DADO", saldoPendiente: 80 },
      ],
      adelantos: [adelanto({ id: "r1", beneficiarioId: "b1", direccion: "RECIBIDO", conceptoRecibido: "PRESTAMO", status: "ABIERTO", saldoPendiente: 3000 })],
      movimientos: [],
    });
    const r = cruzarConLoQueDebes(await PorCobrarDB.getDetalle("t1"), pp);
    expect(r.items.find((f) => f.id === "d1")?.cruce).toBe("benef:b1");
    // b2 sólo te debe: no está en «Lo que debo», no hay nada que cruzar.
    expect(r.items.find((f) => f.id === "d2")?.cruce).toBeNull();
    expect(r.cruces.map((c) => [c.clave, c.neto])).toEqual([["benef:b1", [{ moneda: "PEN", monto: -2500 }]]]);
  });

  it("dos monedas en la misma parte: te debe en soles y le debes en dólares, sin compensarse", async () => {
    const movs = [
      mov({ parteId: "p2", parteNombre: "Aserradero Norte", fecha: "2026-09-01T00:00:00Z", tipo: "cargo", concepto: "madera", monto: 100 }),
      mov({ parteId: "p2", parteNombre: "Aserradero Norte", fecha: "2026-09-02T00:00:00Z", tipo: "abono", concepto: "madera", monto: 50, moneda: "USD" }),
    ];
    H.movs = movs.map(comoFila);
    const pp = loQueDebo({ beneficiarios: [], grupos: [], adelantos: [], movimientos: movs });
    const r = cruzarConLoQueDebes(await PorCobrarDB.getDetalle("t1"), pp);
    expect(r.items.map((f) => [f.tipo, f.moneda, f.monto, f.cruce])).toEqual([["madera", "PEN", 100, "parte:p2"]]);
    expect(r.cruces[0]).toMatchObject({
      teDebe: [{ moneda: "PEN", monto: 100 }],
      leDebes: [{ moneda: "USD", monto: 50 }],
      neto: [{ moneda: "PEN", monto: 100 }, { moneda: "USD", monto: -50 }],
    });
    // Soles contra dólares no se cruzan.
    expect(r.cruzable).toEqual([]);
  });

  it("sin «Lo que debo» (falló la lectura) la lista sale igual, sin cruces", async () => {
    H.movs = movsWasaco.map(comoFila);
    const sin = await PorCobrarDB.getDetalle("t1");
    const r = cruzarConLoQueDebes(sin, null);
    expect(r.items).toEqual(sin.items);
    expect(r.cruces).toEqual([]);
    expect(r.crucesDisponibles).toBe(false);
  });
});
