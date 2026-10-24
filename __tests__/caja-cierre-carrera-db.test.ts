/**
 * El cierre de caja y los movimientos que entran a la vez (F4, 3ª pasada de
 * seguridad de ADR-448), contra la base REAL en el tenant de pruebas `main`.
 * Blas no se toca.
 *
 * EL HUECO. Nada bloqueaba la fila de la caja: el cierre leía sus movimientos
 * sin lock y un alta/entrega/anulación de adelanto (o una liquidación) que se
 * confirmaba en ese instante quedaba FUERA del esperado — o entraba en una
 * caja ya cerrada. En los dos casos el arqueo descuadra por el monto exacto.
 *
 * Cada carrera se arma con barreras y `pg_blocking_pids`, no con `sleep`: la
 * prueba sabe cuándo un lado está esperando al otro.
 *
 *   1. mover primero → el cierre ESPERA y cuenta el movimiento;
 *   2. cerrar primero → el movimiento que llega ve la caja cerrada: `sinCaja`;
 *   3. la liquidación mueve la caja DENTRO de su transacción (y la anulación
 *      revierte dentro de la suya); repetir no mueve dos veces;
 *   4. un egreso por Yape no se resta del efectivo: cierre y Resumen de Mi Plata
 *      (`saldoEsperadoDeCaja`) dan lo mismo.
 *
 * Todo lleva el prefijo `TEST-CAJALOCK-`; las cajas terminan cerradas con
 * diferencia 0 y se purgan antes y después (sus movimientos caen en cascada).
 *
 *   node --env-file=.env.local node_modules/.bin/vitest run __tests__/caja-cierre-carrera-db.test.ts
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.AUDIT_CHAIN_ENABLED ??= "false";

import { prisma } from "@/lib/prisma";
import { limaDateKey } from "@/lib/utils";
import { CashRegistersDB } from "@/lib/db/sales.db";
import { CajaNoAbiertaError, CashRegistersMovementsDB } from "@/lib/db/cash-registers-movements.db";
import { moverCajaEnTx } from "@/lib/adelantos/movimiento-caja";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { LiquidacionCuentaDB } from "@/lib/db/liquidacion-cuenta.db";
import { huellaDe } from "@/lib/cuentas/liquidacion";
import { otrosMediosDeCaja, saldoEsperadoDeCaja } from "@/lib/caja/saldo-esperado";
import { cuentasDeCajaParaPantalla } from "@/lib/caja/cuentas-de-pantalla";
import { resumenCierreDeCaja } from "@/lib/caja/resumen-cierre";

const T = "main";
const PREFIJO = "TEST-CAJALOCK-";
const runId = Math.random().toString(36).slice(2, 7);
const NOTA = `${PREFIJO}${runId}`;
const USUARIO = NOTA;
const hoy = limaDateKey();

function diferido<V = void>() {
  let resolve!: (v: V) => void;
  const promise = new Promise<V>((r) => (resolve = r));
  return { promise, resolve };
}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** El pid de la conexión de ESTA transacción (el que los demás ven como bloqueador). */
async function pidDe(tx: { $queryRaw: typeof prisma.$queryRaw }): Promise<number> {
  const r = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
  return Number(r[0]?.pid);
}

/** `true` apenas alguna sesión está esperando un lock que tiene `pid`. */
async function alguienEsperaA(pid: number, ms: number): Promise<boolean> {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    const r = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))
    `;
    if (Number(r[0]?.n ?? 0) > 0) return true;
    await dormir(120);
  }
  return false;
}

async function purgar() {
  const benefs = await prisma.adelantoBeneficiario.findMany({ where: { tenantId: T, nombre: { startsWith: PREFIJO } }, select: { id: true } });
  const ids = benefs.map((b) => b.id);
  if (ids.length > 0) {
    await prisma.adelantoEntrega.deleteMany({ where: { adelanto: { tenantId: T, beneficiarioId: { in: ids } } } });
    await prisma.liquidacionCuenta.deleteMany({ where: { tenantId: T, beneficiarioId: { in: ids } } });
    await prisma.adelanto.deleteMany({ where: { tenantId: T, beneficiarioId: { in: ids } } });
    await prisma.adelantoBeneficiario.deleteMany({ where: { tenantId: T, id: { in: ids } } });
  }
  /* Los movimientos de estas cajas se van con ellas (onDelete: Cascade). */
  await prisma.cashRegister.deleteMany({ where: { tenantId: T, notes: { startsWith: PREFIJO } } });
  await prisma.activityLog.deleteMany({ where: { tenantId: T, user: { startsWith: PREFIJO } } });
}

const HAS_DB: boolean = await prisma
  .$queryRaw`SELECT 1`
  .then(() => prisma.tenant.count({ where: { id: T } }))
  .then((n) => n === 1)
  .catch(() => false);

/** Otra caja abierta en `main` (de otro agente) haría que el movimiento caiga allá: se salta, no se miente. */
let otrasAbiertas = 0;

beforeAll(async () => {
  if (!HAS_DB) return;
  await purgar();
  otrasAbiertas = await prisma.cashRegister.count({ where: { tenantId: T, status: "abierta" } });
}, 60_000);

/* Cada prueba con su caja: una que falla a mitad no deja otra abierta que se
   lleve los movimientos de la siguiente. */
afterEach(async () => {
  if (HAS_DB) await prisma.cashRegister.deleteMany({ where: { tenantId: T, notes: { startsWith: PREFIJO } } });
}, 60_000);

afterAll(async () => {
  if (!HAS_DB) return;
  try {
    await purgar();
    const residuos = await prisma.cashRegister.count({ where: { tenantId: T, notes: { startsWith: PREFIJO } } });
    expect(residuos, "quedaron cajas de prueba en main").toBe(0);
  } finally {
    await prisma.$disconnect();
  }
}, 60_000);

const movimientosDe = (cajaId: string) =>
  prisma.cashMovement.findMany({ where: { cashRegisterId: cajaId }, select: { type: true, method: true, amount: true, description: true }, orderBy: { createdAt: "asc" } });

describe.skipIf(!HAS_DB)("F4 · el cierre de caja y los movimientos que entran a la vez (base real, tenant main)", () => {
  it("mover primero: el cierre espera al ingreso que se está confirmando y lo cuenta", async (ctx) => {
    if (otrasAbiertas > 0) return ctx.skip();
    const caja = await CashRegistersDB.open(T, 0, NOTA);

    const listo = diferido<number>();
    const soltar = diferido();
    const mover = prisma.$transaction(
      async (tx) => {
        const r = await moverCajaEnTx(tx, T, { tipo: "ingreso", monto: 150, metodo: "efectivo", etiqueta: `${NOTA} ingreso` });
        listo.resolve(await pidDe(tx));
        await soltar.promise;
        return r;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
    const pid = await listo.promise;
    const cierre = CashRegistersDB.close(T, caja.id, 150, NOTA);
    const espero = await alguienEsperaA(pid, 3_000);
    soltar.resolve();
    const [m, c] = await Promise.all([mover, cierre]);

    /* El invariante primero: si falla, el mensaje dice cuánto calculó sin el ingreso. */
    expect(c?.expectedAmount, "el cierre calculó el esperado SIN el ingreso que estaba entrando").toBe(150);
    expect(c?.difference).toBe(0);
    expect(espero, "el cierre no esperó al movimiento en curso").toBe(true);
    expect(m.sinCaja).toBe(false);
    const movs = await movimientosDe(caja.id);
    expect(movs.filter((x) => x.type === "ingreso").map((x) => Number(x.amount))).toEqual([150]);
  }, 60_000);

  it("cerrar primero: el egreso que llega durante el cierre no entra en la caja cerrada (sinCaja)", async (ctx) => {
    if (otrasAbiertas > 0) return ctx.skip();
    const caja = await CashRegistersDB.open(T, 0, NOTA);

    /* El cierre REAL se detiene justo después de tomar la caja. */
    const tomada = diferido<number>();
    const seguir = diferido();
    const orig = CashRegistersMovementsDB.bloquearCajaParaCerrarEnTx;
    const spy = vi.spyOn(CashRegistersMovementsDB, "bloquearCajaParaCerrarEnTx").mockImplementationOnce(async (tx, tenantId, id) => {
      const r = await orig.call(CashRegistersMovementsDB, tx, tenantId, id);
      tomada.resolve(await pidDe(tx));
      await seguir.promise;
      return r;
    });
    try {
      const cierre = CashRegistersDB.close(T, caja.id, 0, NOTA);
      const pid = await tomada.promise;
      const mover = prisma.$transaction(
        (tx) => moverCajaEnTx(tx, T, { tipo: "egreso", monto: 90, metodo: "efectivo", etiqueta: `${NOTA} egreso tarde` }),
        { timeout: 20_000, maxWait: 10_000 },
      );
      const espero = await alguienEsperaA(pid, 3_000);
      seguir.resolve();
      const [c, m] = await Promise.all([cierre, mover]);

      const tarde = (await movimientosDe(caja.id)).filter((x) => x.description.includes("egreso tarde"));
      expect(tarde, "un egreso entró en una caja YA cerrada").toEqual([]);
      expect(m).toEqual({ sinCaja: true });
      expect(espero, "el movimiento no esperó al cierre en curso").toBe(true);
      expect(c?.status).toBe("cerrada");
      expect(c?.expectedAmount).toBe(0);
      expect(c?.difference).toBe(0);
    } finally {
      spy.mockRestore();
    }
  }, 60_000);

  it("la venta del POS y el movimiento manual que llegan durante el cierre tampoco entran (CajaNoAbiertaError)", async (ctx) => {
    if (otrasAbiertas > 0) return ctx.skip();
    const caja = await CashRegistersDB.open(T, 0, NOTA);
    /* Con la caja abierta anotan; otro negocio no puede anotar en ella. */
    await CashRegistersDB.addMovement(caja.id, { type: "venta", amount: 30, method: "efectivo", description: `${NOTA} venta` }, T);
    await expect(
      CashRegistersDB.addMovement(caja.id, { type: "venta", amount: 1, method: "efectivo", description: `${NOTA} ajena` }, "tenant-que-no-existe-f4"),
    ).rejects.toThrow("caja no pertenece al tenant");
    /* El movimiento manual tampoco: con otro tenant la caja «no está abierta» para él. */
    await expect(
      CashRegistersMovementsDB.createMovement("tenant-que-no-existe-f4", { cashRegisterId: caja.id, type: "ingreso", amount: 1, method: "efectivo", description: `${NOTA} ajena` }),
    ).rejects.toBeInstanceOf(CajaNoAbiertaError);

    const tomada = diferido<number>();
    const seguir = diferido();
    const orig = CashRegistersMovementsDB.bloquearCajaParaCerrarEnTx;
    const spy = vi.spyOn(CashRegistersMovementsDB, "bloquearCajaParaCerrarEnTx").mockImplementationOnce(async (tx, tenantId, id) => {
      const r = await orig.call(CashRegistersMovementsDB, tx, tenantId, id);
      tomada.resolve(await pidDe(tx));
      await seguir.promise;
      return r;
    });
    try {
      const cierre = CashRegistersDB.close(T, caja.id, 30, NOTA);
      const pid = await tomada.promise;
      const venta = CashRegistersDB.addMovement(caja.id, { type: "venta", amount: 40, method: "efectivo", description: `${NOTA} venta tarde` }, T);
      const manual = CashRegistersMovementsDB.createMovement(T, { cashRegisterId: caja.id, type: "egreso", amount: 25, method: "efectivo", description: `${NOTA} manual tarde` });
      const espero = await alguienEsperaA(pid, 3_000);
      seguir.resolve();
      const [c, v, m] = await Promise.allSettled([cierre, venta, manual]);

      const tarde = (await movimientosDe(caja.id)).filter((x) => x.description.includes("tarde"));
      expect(tarde, "un movimiento entró en una caja YA cerrada").toEqual([]);
      expect(v.status === "rejected" && v.reason).toBeInstanceOf(CajaNoAbiertaError);
      expect(m.status === "rejected" && m.reason).toBeInstanceOf(CajaNoAbiertaError);
      expect(espero).toBe(true);
      expect(c.status === "fulfilled" && c.value?.expectedAmount).toBe(30);
      expect(c.status === "fulfilled" && c.value?.difference).toBe(0);
    } finally {
      spy.mockRestore();
    }
  }, 60_000);

  it("la liquidación mueve la caja DENTRO de su transacción; repetir no la mueve dos veces; anular revierte en la suya", async (ctx) => {
    if (otrasAbiertas > 0) return ctx.skip();
    const caja = await CashRegistersDB.open(T, 0, NOTA);
    const b = await AdelantosDB.createBeneficiario(T, { nombre: `${NOTA} Liquida` });
    await AdelantosDB.create(T, { beneficiarioId: b.id, montoAdelantado: 500, fechaAdelanto: `${hoy}T12:00:00-05:00` });
    const p = await LiquidacionCuentaDB.partidas(T, { beneficiarioId: b.id });
    if (!p) throw new Error("sin partidas");
    const input = {
      idempotencyKey: crypto.randomUUID(),
      persona: { beneficiarioId: b.id },
      fecha: hoy,
      compensar: 0,
      pago: { direccion: "recibido" as const, monto: 200, metodo: "efectivo" as const, moverCaja: true },
      huella: huellaDe(p),
    };

    /* Alguien está cerrando la caja (la tiene tomada): la liquidación tiene que
       quedar esperando ANTES de confirmarse, no después. */
    const tomada = diferido<number>();
    const soltar = diferido();
    const cerrando = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "CashRegister" WHERE "id" = ${caja.id} AND "tenantId" = ${T} FOR UPDATE`;
        tomada.resolve(await pidDe(tx));
        await soltar.promise;
      },
      { timeout: 45_000, maxWait: 10_000 },
    );
    const pid = await tomada.promise;
    const liquidar = LiquidacionCuentaDB.crear(T, input, USUARIO);
    const espero = await alguienEsperaA(pid, 25_000);
    const visible = await prisma.liquidacionCuenta.count({ where: { tenantId: T, idempotencyKey: input.idempotencyKey } });
    soltar.resolve();
    await cerrando;
    const r = await liquidar;

    expect(espero, "la liquidación nunca esperó a la caja").toBe(true);
    expect(visible, "la liquidación ya estaba confirmada mientras su movimiento esperaba la caja: va después del commit").toBe(0);
    expect(r.liquidacion.caja.resultado).toBe("movida");
    expect(r.caja?.movimientoId).toBeTruthy();
    expect(r.liquidacion.caja.movimientoId).toBe(r.caja?.movimientoId);
    const codigo = r.liquidacion.codigo;
    const conCodigo = async () => (await movimientosDe(caja.id)).filter((x) => x.description.includes(codigo));
    expect((await conCodigo()).map((x) => [x.type, Number(x.amount), x.method])).toEqual([["ingreso", 200, "efectivo"]]);

    /* El reintento con la misma clave no vuelve a mover la caja. */
    const otra = await LiquidacionCuentaDB.crear(T, input, USUARIO);
    expect(otra.repetida).toBe(true);
    expect(otra.caja).toBeNull();
    expect(await conCodigo()).toHaveLength(1);

    /* Anular devolviendo en efectivo: la reversión va en la transacción de la anulación. */
    const an = await LiquidacionCuentaDB.anular(T, r.liquidacion.id, { motivo: `${NOTA} prueba`, devolucionCaja: "efectivo" }, USUARIO);
    expect(an?.anulada?.reversionCajaId).toBeTruthy();
    expect((await conCodigo()).map((x) => [x.type, Number(x.amount)])).toEqual([
      ["ingreso", 200],
      ["egreso", 200],
    ]);

    const c = await CashRegistersDB.close(T, caja.id, 0, NOTA);
    expect(c?.expectedAmount).toBe(0);
    expect(c?.difference).toBe(0);

    /* Sin caja abierta la liquidación se guarda igual y lo dice. */
    const p2 = await LiquidacionCuentaDB.partidas(T, { beneficiarioId: b.id });
    if (!p2) throw new Error("sin partidas");
    const sin = await LiquidacionCuentaDB.crear(
      T,
      { ...input, idempotencyKey: crypto.randomUUID(), pago: { ...input.pago, monto: 100 }, huella: huellaDe(p2) },
      USUARIO,
    );
    expect(sin.liquidacion.caja).toEqual({ resultado: "sin_caja", movimientoId: null });
  }, 120_000);

  it("un egreso por Yape no sale del cajón: el cierre y el Resumen de Mi Plata dan el mismo esperado", async (ctx) => {
    if (otrasAbiertas > 0) return ctx.skip();
    const caja = await CashRegistersDB.open(T, 0, NOTA);
    await prisma.$transaction(async (tx) => {
      await moverCajaEnTx(tx, T, { tipo: "ingreso", monto: 300, metodo: "efectivo", etiqueta: `${NOTA} ingreso` });
      await moverCajaEnTx(tx, T, { tipo: "egreso", monto: 80, metodo: "yape", etiqueta: `${NOTA} egreso yape` });
      await moverCajaEnTx(tx, T, { tipo: "egreso", monto: 50, metodo: "efectivo", etiqueta: `${NOTA} egreso efectivo` });
    });
    const abierta = await CashRegistersDB.getById(T, caja.id);
    if (!abierta) throw new Error("sin caja");
    const resumen = saldoEsperadoDeCaja(abierta.openingAmount, abierta.movements);

    const c = await CashRegistersDB.close(T, caja.id, 250, NOTA);
    expect(c?.expectedAmount, "el cierre restó del cajón un egreso que salió por Yape").toBe(250);
    expect(c?.difference).toBe(0);
    expect(resumen.esperado).toBe(c?.expectedAmount);
    expect(otrosMediosDeCaja(abierta.movements).porMetodo).toEqual({ yape: { ventas: 0, ingresos: 0, egresos: 80 } });
    /* La misma caja en la pantalla de caja y en el correo de cierre (lo que arma la ruta con la caja cerrada). */
    const pantalla = cuentasDeCajaParaPantalla(abierta.openingAmount, abierta.movements, (n) => `S/ ${n.toFixed(2)}`);
    expect(pantalla.expectedCash).toBe(c?.expectedAmount);
    expect(pantalla.fueraDelCajon).toBe("Por Yape: salieron S/ 80.00 — no está en el cajón");
    if (!c) throw new Error("sin cierre");
    const correo = resumenCierreDeCaja(c, 250, NOTA);
    expect(correo.expectedAmount).toBe(250);
    expect(correo.openingAmount + correo.salesEfectivo + correo.totalIn - correo.totalOut).toBe(250);
    expect(correo.difference).toBe(0);
  }, 60_000);

  it("cierre SIN conteo (null): espera al ingreso en curso y anota como contado el esperado calculado bajo el lock", async (ctx) => {
    if (otrasAbiertas > 0) return ctx.skip();
    const caja = await CashRegistersDB.open(T, 20, NOTA);
    await prisma.$transaction(async (tx) => {
      await moverCajaEnTx(tx, T, { tipo: "egreso", monto: 70, metodo: "yape", etiqueta: `${NOTA} egreso yape` });
    });

    const listo = diferido<number>();
    const soltar = diferido();
    const mover = prisma.$transaction(
      async (tx) => {
        const r = await moverCajaEnTx(tx, T, { tipo: "ingreso", monto: 35, metodo: "efectivo", etiqueta: `${NOTA} ingreso` });
        listo.resolve(await pidDe(tx));
        await soltar.promise;
        return r;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
    const pid = await listo.promise;
    /* Lo que hacen el cron y «Cerrar turno» sin monto: una cuenta hecha ANTES
       del lock habría dado 20 y una diferencia de −35 que nadie contó. */
    const cierre = CashRegistersDB.close(T, caja.id, null, `${NOTA} Cierre automático (prueba)`);
    const espero = await alguienEsperaA(pid, 3_000);
    soltar.resolve();
    const [, c] = await Promise.all([mover, cierre]);

    expect(espero, "el cierre sin conteo no esperó al movimiento en curso").toBe(true);
    expect(c?.expectedAmount, "el egreso por Yape no sale del cajón; el ingreso en curso sí entra").toBe(55);
    expect(c?.closingAmount).toBe(55);
    expect(c?.difference).toBe(0);
    const movs = await movimientosDe(caja.id);
    expect(movs.filter((x) => x.type === "cierre").map((x) => Number(x.amount))).toEqual([55]);
  }, 60_000);
});
