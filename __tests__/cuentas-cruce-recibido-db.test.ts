/**
 * ADR-449 contra la base REAL, en el tenant de pruebas `main`. Blas no se toca.
 *
 * El recorrido de WASACO a escala real: una ficha de Adelantos con dos
 * adelantos RECIBIDOS (1 731 + 1 300, la misma fecha) y uno DADO (3 217), su
 * parte del directorio con aserríos por 12 323,02, el vínculo, y:
 *
 *   · cruzar 3 031 → las dos entregas LIBRE y el abono `compensacion`, en la
 *     MISMA transacción, sin caja;
 *   · repetir con la misma clave → la misma liquidación, nada más escrito;
 *   · la huella de antes del cruce → 409 (`PlanCambioError`);
 *   · «Corregir dirección» queda bloqueada (entrega viva);
 *   · anular → los adelantos vuelven a 1 731 y 1 300, el abono se da de baja;
 *   · «Dejar en cero» (la intención de la función, no armada a mano) deja todo
 *     en 0 y se anula igual;
 *   · otro negocio no ve a la persona.
 *
 * Revisión (28-09): el abono y el cobro llevan el PERMISO de los aserríos (el
 * balance del permiso baja; lo recibido, en SU permiso, también); la misma
 * clave con otro cruce da `LiquidacionIdempotenciaDistintaError`; anular un
 * adelanto cruzado da `con_liquidacion`; «Corregir dirección» nombra el LIQ.
 *
 * Todo lleva el prefijo `TEST-CRUCE449-` y se purga antes y después.
 *
 *   node --env-file=.env.local node_modules/.bin/vitest run __tests__/cuentas-cruce-recibido-db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.AUDIT_CHAIN_ENABLED ??= "false";

import { prisma } from "@/lib/prisma";
import { limaDateKey } from "@/lib/utils";
import { AdelantoConLiquidacionError, AdelantosDB, DireccionNoCorregibleError } from "@/lib/db/adelantos.db";
import { ForestContratoDB } from "@/lib/db/forest-contrato.db";
import { ForestCuentaDB } from "@/lib/db/forest-cuenta.db";
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import {
  LiquidacionCuentaDB,
  LiquidacionIdempotenciaDistintaError,
  PersonaNoEncontradaError,
  PlanCambioError,
} from "@/lib/db/liquidacion-cuenta.db";
import { huellaDe, intencionDejarEnCero } from "@/lib/cuentas/liquidacion";
import { resumirBalance } from "@/lib/forestal/contratos";

const T = "main";
const PREFIJO = "TEST-CRUCE449-";
const runId = Math.random().toString(36).slice(2, 7);
const USUARIO = `${PREFIJO}${runId}`;
const hoy = limaDateKey();

async function purgar() {
  const benefs = await prisma.adelantoBeneficiario.findMany({ where: { tenantId: T, nombre: { startsWith: PREFIJO } }, select: { id: true } });
  const ids = benefs.map((b) => b.id);
  if (ids.length > 0) {
    await prisma.adelantoEntrega.deleteMany({ where: { adelanto: { tenantId: T, beneficiarioId: { in: ids } } } });
    await prisma.liquidacionCuenta.deleteMany({ where: { tenantId: T, beneficiarioId: { in: ids } } });
    await prisma.adelanto.deleteMany({ where: { tenantId: T, beneficiarioId: { in: ids } } });
    await prisma.adelantoBeneficiario.deleteMany({ where: { tenantId: T, id: { in: ids } } });
  }
  await prisma.forestCuentaMov.deleteMany({ where: { tenantId: T, parteNombre: { startsWith: PREFIJO } } });
  await prisma.forestParty.deleteMany({ where: { tenantId: T, nombre: { startsWith: PREFIJO } } });
  await prisma.forestContrato.deleteMany({ where: { tenantId: T, codigo: { startsWith: PREFIJO } } });
  await prisma.activityLog.deleteMany({ where: { tenantId: T, user: { startsWith: PREFIJO } } });
}

const HAS_DB: boolean = await prisma
  .$queryRaw`SELECT 1`
  .then(() => prisma.tenant.count({ where: { id: T } }))
  .then((n) => n === 1)
  .catch(() => false);

beforeAll(async () => {
  if (HAS_DB) await purgar();
}, 60_000);

afterAll(async () => {
  if (!HAS_DB) return;
  try {
    await purgar();
  } finally {
    await prisma.$disconnect();
  }
}, 60_000);

describe.skipIf(!HAS_DB)("ADR-449 · cruzar lo recibido contra los aserríos (base real, tenant main)", () => {
  const s: { benef: string; parte: string; a2: string; fmp: string; plt: string } = { benef: "", parte: "", a2: "", fmp: "", plt: "" };
  /** El balance del permiso (ADR-421) con la MISMA función que la ficha del permiso. */
  const balanceDe = async (contratoId: string) => resumirBalance(await ForestContratoDB.balance(T, contratoId));

  /** Cuál de los dos recibidos es el de 1 731 (los ids salen de la base). */
  const ids = async () => {
    const r = await prisma.adelanto.findMany({ where: { tenantId: T, beneficiarioId: s.benef, direccion: "RECIBIDO" }, select: { id: true, montoAdelantado: true } });
    return { r1: r.find((x) => Number(x.montoAdelantado) === 1731)?.id ?? "", r2: r.find((x) => Number(x.montoAdelantado) === 1300)?.id ?? "" };
  };

  const saldoDe = async (id: string) => {
    const a = await prisma.adelanto.findFirst({ where: { tenantId: T, id }, select: { saldoPendiente: true, status: true } });
    return { saldo: Number(a?.saldoPendiente), status: a?.status };
  };

  it("siembra: ficha + 2 recibidos + 1 dado, parte con 12 323,02 de aserríos, vinculadas", async () => {
    /* Dos permisos como en Blas: los aserríos en uno (FMP), lo que adelantó en otro (PLT). */
    const permiso = (sufijo: string) =>
      prisma.forestContrato.create({
        data: { tenantId: T, codigo: `${PREFIJO}${runId}-${sufijo}`, codigoNorm: `${PREFIJO}${runId}-${sufijo}`.toLowerCase(), titularNombre: "WASACO QA", createdBy: USUARIO },
        select: { id: true },
      });
    s.fmp = (await permiso("FMP")).id;
    s.plt = (await permiso("PLT")).id;
    const b = await AdelantosDB.createBeneficiario(T, { nombre: `${PREFIJO}${runId} Wasaco` });
    s.benef = b.id;
    const fecha = `${hoy}T12:00:00-05:00`;
    const rec = (monto: number) =>
      AdelantosDB.create(T, { beneficiarioId: b.id, montoAdelantado: monto, fechaAdelanto: fecha, direccion: "RECIBIDO", conceptoRecibido: "SERVICIO", contratoId: s.plt });
    const r1 = await rec(1731);
    await rec(1300);
    const d = await AdelantosDB.create(T, { beneficiarioId: b.id, montoAdelantado: 3217, fechaAdelanto: fecha });
    s.a2 = d.id;
    expect(r1.caja).toBeNull();

    const parte = await ForestDirectorioDB.guardarParte(T, { roles: ["cliente"], nombre: `${PREFIJO}${runId} WASACO S.A.C.` }, USUARIO);
    s.parte = parte.id;
    for (const monto of [5000, 4323.02, 3000]) {
      await ForestCuentaDB.guardar(
        T,
        { parteId: parte.id, parteNombre: parte.nombre, fecha: hoy, tipo: "cargo", concepto: "aserrio_prestado", monto },
        USUARIO,
      );
    }
    /* El cargo de aserrío lleva el permiso de su corrida (ADR-430); acá se le pone a mano. */
    await prisma.forestCuentaMov.updateMany({ where: { tenantId: T, parteId: parte.id }, data: { contratoId: s.fmp } });
    const v = await AdelantosDB.vincularParte(T, b.id, parte.id);
    /* La parte de antes viaja para la auditoría del vínculo. */
    expect(v?.forestPartyIdAnterior).toBeNull();
    expect((await balanceDe(s.fmp)).porRecuperar).toBe(12323.02);
    expect((await balanceDe(s.plt)).porDevolver).toBe(3031);
  }, 60_000);

  it("las partidas traen lo recibido para cruzar, y otro negocio no ve a la persona", async () => {
    const p = await LiquidacionCuentaDB.partidas(T, { beneficiarioId: s.benef });
    expect(p?.cruzable).toBe(true);
    expect(p?.forestal?.saldo).toBe(12323.02);
    /* Misma fecha: el FIFO desempata por id. */
    const { r1, r2 } = await ids();
    const esperado = [[r1, 1731], [r2, 1300]].sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1));
    expect(p?.recibidos?.map((r) => [r.adelantoId, r.saldo])).toEqual(esperado);
    expect(p?.adelantos.map((a) => a.saldo)).toEqual([3217]);
    expect(await LiquidacionCuentaDB.partidas("tenant-que-no-existe-449", { beneficiarioId: s.benef })).toBeNull();
    await expect(
      LiquidacionCuentaDB.crear(
        "tenant-que-no-existe-449",
        { idempotencyKey: crypto.randomUUID(), persona: { beneficiarioId: s.benef }, fecha: hoy, compensar: 0, cruzarRecibido: 1, pago: null, huella: "x" },
        USUARIO,
      ),
    ).rejects.toBeInstanceOf(PersonaNoEncontradaError);
  }, 60_000);

  it("cruzar 3 031: entregas + abono en una transacción, sin caja; repetir no escribe; la huella vieja da 409; «Corregir dirección» queda bloqueada; anular lo devuelve", async () => {
    const { r1, r2 } = await ids();
    const p = await LiquidacionCuentaDB.partidas(T, { beneficiarioId: s.benef });
    if (!p) throw new Error("sin partidas");
    const huellaAntes = huellaDe(p);
    const clave = crypto.randomUUID();
    const input = { idempotencyKey: clave, persona: { beneficiarioId: s.benef }, fecha: hoy, compensar: 0, cruzarRecibido: 3031, pago: null, huella: huellaAntes };

    const r = await LiquidacionCuentaDB.crear(T, input, USUARIO);
    expect(r.repetida).toBe(false);
    expect(r.caja).toBeNull();
    expect(r.liquidacion.compensado).toBe(3031);
    expect(r.liquidacion.detalle.cruceRecibido).toBe(3031);
    expect(r.liquidacion.caja.resultado).toBe("no_mover");
    const codigo = r.liquidacion.codigo;

    expect(await saldoDe(r1)).toEqual({ saldo: 0, status: "LIQUIDADO" });
    expect(await saldoDe(r2)).toEqual({ saldo: 0, status: "LIQUIDADO" });
    expect(await saldoDe(s.a2)).toEqual({ saldo: 3217, status: "ABIERTO" });
    const entregas = await prisma.adelantoEntrega.findMany({ where: { liquidacionId: r.liquidacion.id }, select: { valor: true, tipo: true, descripcion: true } });
    expect(entregas.map((e) => [Number(e.valor), e.tipo, e.descripcion]).sort()).toEqual(
      [[1300, "LIBRE", `Cruce ${codigo} con sus aserríos`], [1731, "LIBRE", `Cruce ${codigo} con sus aserríos`]].sort(),
    );
    const abonos = await prisma.forestCuentaMov.findMany({ where: { tenantId: T, liquidacionId: r.liquidacion.id }, select: { tipo: true, concepto: true, monto: true, deletedAt: true } });
    expect(abonos.map((m) => [m.tipo, m.concepto, Number(m.monto)])).toEqual([["abono", "compensacion", 3031]]);
    /* El permiso de los aserríos ve lo cruzado; lo recibido, en su permiso, baja a 0. */
    const conPermiso = await prisma.forestCuentaMov.findMany({ where: { tenantId: T, liquidacionId: r.liquidacion.id }, select: { contratoId: true } });
    expect(conPermiso.map((m) => m.contratoId)).toEqual([s.fmp]);
    expect((await balanceDe(s.fmp)).porRecuperar).toBe(9292.02);
    expect((await balanceDe(s.plt)).porDevolver).toBe(0);
    expect(await prisma.$transaction((tx) => ForestCuentaDB.saldoDeParteEnTx(tx, T, s.parte))).toBe(9292.02);
    /* No toca la caja: ningún movimiento nombra el código. */
    expect(await prisma.cashMovement.count({ where: { cashRegister: { tenantId: T }, description: { contains: codigo } } })).toBe(0);

    // Repetir con la misma clave: la misma liquidación, nada nuevo.
    const otra = await LiquidacionCuentaDB.crear(T, input, USUARIO);
    expect(otra.repetida).toBe(true);
    expect(otra.liquidacion.id).toBe(r.liquidacion.id);
    expect(await prisma.adelantoEntrega.count({ where: { adelanto: { beneficiarioId: s.benef } } })).toBe(2);
    expect(await prisma.forestCuentaMov.count({ where: { tenantId: T, parteId: s.parte, concepto: "compensacion" } })).toBe(1);

    // La misma clave con OTRO cruce no es un reintento: 422 en la ruta.
    await expect(LiquidacionCuentaDB.crear(T, { ...input, cruzarRecibido: 3000 }, USUARIO)).rejects.toBeInstanceOf(LiquidacionIdempotenciaDistintaError);

    // La huella de antes ya no es la cuenta: 409.
    await expect(LiquidacionCuentaDB.crear(T, { ...input, idempotencyKey: crypto.randomUUID() }, USUARIO)).rejects.toBeInstanceOf(PlanCambioError);

    // «Corregir dirección» con la entrega viva: bloqueada.
    const corregir = AdelantosDB.corregirDireccion(T, r1, { direccion: "DADO", motivo: "prueba de QA", usuario: USUARIO });
    await expect(corregir).rejects.toBeInstanceOf(DireccionNoCorregibleError);
    await expect(corregir).rejects.toMatchObject({ code: "con_entregas" });
    /* …y dice CUÁL liquidación y dónde se anula (revisión: «anúlalas» solo no decía dónde). */
    await expect(corregir).rejects.toThrow(new RegExp(`${codigo}.*Cuenta por persona`));

    // Anular: todo vuelve.
    const anulada = await LiquidacionCuentaDB.anular(T, r.liquidacion.id, { motivo: "prueba de QA ADR-449", devolucionCaja: null }, USUARIO);
    expect(anulada?.anulada?.motivo).toBe("prueba de QA ADR-449");
    expect(await saldoDe(r1)).toEqual({ saldo: 1731, status: "ABIERTO" });
    expect(await saldoDe(r2)).toEqual({ saldo: 1300, status: "ABIERTO" });
    expect(await prisma.$transaction((tx) => ForestCuentaDB.saldoDeParteEnTx(tx, T, s.parte))).toBe(12323.02);
    const trasAnular = await prisma.forestCuentaMov.findFirst({ where: { tenantId: T, liquidacionId: r.liquidacion.id }, select: { deletedAt: true } });
    expect(trasAnular?.deletedAt).not.toBeNull();
  }, 120_000);

  it("«Dejar en cero» con la intención de la función: cruce 3 031 + cobro 12 509,02 (sin caja), todo en 0; y se anula igual", async () => {
    const p = await LiquidacionCuentaDB.partidas(T, { beneficiarioId: s.benef });
    if (!p) throw new Error("sin partidas");
    const i = intencionDejarEnCero(p, hoy, "transferencia", false);
    expect(i).toEqual({ fecha: hoy, compensar: 0, cruzarRecibido: 3031, pago: { direccion: "recibido", monto: 12509.02, metodo: "transferencia", moverCaja: false } });
    if (!i) return;
    const r = await LiquidacionCuentaDB.crear(
      T,
      { idempotencyKey: crypto.randomUUID(), persona: { beneficiarioId: s.benef }, fecha: i.fecha, compensar: i.compensar, cruzarRecibido: i.cruzarRecibido, pago: i.pago, huella: huellaDe(p) },
      USUARIO,
    );
    expect(r.liquidacion.detalle.despues).toEqual({ adelantosTeDebe: 0, maderaSaldo: 0, recibidoLeDebes: 0, recibidoTeDebe: 0, neto: 0 });
    expect(await prisma.$transaction((tx) => ForestCuentaDB.saldoDeParteEnTx(tx, T, s.parte))).toBe(0);
    /* El cruce Y el cobro llevan el permiso de los aserríos: el permiso queda sin nada por recuperar. */
    const patas = await prisma.forestCuentaMov.findMany({ where: { tenantId: T, liquidacionId: r.liquidacion.id }, select: { concepto: true, monto: true, contratoId: true } });
    expect(patas.map((m) => [m.concepto, Number(m.monto), m.contratoId]).sort()).toEqual([["compensacion", 3031, s.fmp], ["pago", 9292.02, s.fmp]].sort());
    expect((await balanceDe(s.fmp)).porRecuperar).toBe(0);
    const despues = await LiquidacionCuentaDB.partidas(T, { beneficiarioId: s.benef });
    expect(despues?.adelantos).toEqual([]);
    expect(despues?.recibidos ?? []).toEqual([]);

    await LiquidacionCuentaDB.anular(T, r.liquidacion.id, { motivo: "prueba de QA ADR-449 (cero)", devolucionCaja: null }, USUARIO);
    const vuelta = await LiquidacionCuentaDB.partidas(T, { beneficiarioId: s.benef });
    expect(vuelta?.forestal?.saldo).toBe(12323.02);
    expect((vuelta?.recibidos ?? []).reduce((a, x) => a + x.saldo, 0)).toBe(3031);
    expect(vuelta?.adelantos.map((a) => a.saldo)).toEqual([3217]);
  }, 120_000);

  it("anular un adelanto con un cruce vivo: 409 `con_liquidacion`; anulada la liquidación, se puede", async () => {
    const { r1, r2 } = await ids();
    const primero = [r1, r2].sort()[0];
    const p = await LiquidacionCuentaDB.partidas(T, { beneficiarioId: s.benef });
    if (!p) throw new Error("sin partidas");
    /* 1 000 por FIFO: el primero queda ABIERTO con una entrega viva de la liquidación. */
    const r = await LiquidacionCuentaDB.crear(
      T,
      { idempotencyKey: crypto.randomUUID(), persona: { beneficiarioId: s.benef }, fecha: hoy, compensar: 0, cruzarRecibido: 1000, pago: null, huella: huellaDe(p) },
      USUARIO,
    );
    expect((await saldoDe(primero)).status).toBe("ABIERTO");
    const cancelar = AdelantosDB.cancel(T, primero);
    await expect(cancelar).rejects.toBeInstanceOf(AdelantoConLiquidacionError);
    await expect(cancelar).rejects.toMatchObject({ code: "con_liquidacion", liquidacion: r.liquidacion.codigo });
    expect((await saldoDe(primero)).status).toBe("ABIERTO");

    await LiquidacionCuentaDB.anular(T, r.liquidacion.id, { motivo: "prueba de QA ADR-449 (anular adelanto)", devolucionCaja: null }, USUARIO);
    /* Sin entregas vivas de una liquidación, anular el adelanto vuelve a poderse. */
    const anulado = await AdelantosDB.cancel(T, primero);
    expect(anulado?.status).toBe("CANCELADO");
  }, 120_000);
});
