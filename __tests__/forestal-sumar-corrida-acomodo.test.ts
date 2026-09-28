/**
 * «Acomodar trozas» desde el acta de un lote vs. sumar/consumir ese lote —
 * contra la BASE REAL, tenant `main`, prefijo `TEST-SC-`.
 *
 * ── La carrera (revisión 27-09) ──────────────────────────────────────────
 * El acomodo (ADR-435, `AcomodarTrozasDB.aplicar` con `loteId`) cambia la FILA
 * de una troza apartada en un lote abierto: de la fila de otra especie de su
 * guía a la de la suya. Sumar/consumir anotan los m³ POR FILA y marcan las
 * piezas. Si el acomodo entra entre la lectura y la escritura, el m³ queda en
 * la fila vieja y la pieza consumida en la nueva: el libro partido, sin aviso.
 *
 *  · `sumarACorrida`: ahora bloquea lote y piezas ANTES de leerlos y escribe
 *    volumen, m³ y piezas en UNA transacción. Un acomodo lanzado en la mitad
 *    ESPERA; cuando entra, las piezas ya están consumidas y no las mueve.
 *  · `consumir`: lee fuera de la tx y compara bajo lock (TROZA_CAMBIO_DE_FILA).
 *    Los m³ ahora van en la MISMA tx: el rechazo no deja atribución escrita y el
 *    reintento (la corrida que `POST /ctp` deja viva) entra limpio.
 *
 * El «en la mitad» se provoca espiando la función que corre entre la lectura y
 * la escritura, que existe tanto en el código viejo como en el nuevo
 * (`setConsumosEnTx`, `ForestCtpCierreDB.list`): el mismo test falla sin el
 * arreglo.
 *
 * Fechas en abril de 2099: un mes sin datos reales (vincular usa feb/mar, el
 * de consumos enero).
 *
 * Para correr:
 *   node --env-file=.env.local node_modules/.bin/vitest run __tests__/forestal-sumar-corrida-acomodo.test.ts
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.AUDIT_CHAIN_ENABLED ??= "false";

import { prisma } from "@/lib/prisma";
import { ForestLoteAserrioDB } from "@/lib/db/forest-lote-aserrio.db";
import { AcomodarTrozasDB } from "@/lib/db/acomodar-trozas.db";
import { CtpInvariantError, ForestCtpConsumoDB } from "@/lib/db/forest-ctp-consumo.db";
import { ForestCtpCierreDB } from "@/lib/db/forest-ctp-cierre.db";

const TENANT = "main";
const runId = Math.random().toString(36).slice(2, 8);
const P = `TEST-SC-${runId}`;
const LLEGADA = new Date("2099-04-01T12:00:00.000Z");
const DIA_CORRIDA = new Date("2099-04-10T12:00:00.000Z");

let n = 0;

/**
 * Una guía de DOS especies (dos filas, mismo número) con dos trozas de
 * Cachimbo colgadas de la fila de Tornillo — el caso de LA-2026-011 en Blas —
 * y un lote de Cachimbo abierto con esas dos trozas.
 */
async function guiaConTrozasEnOtraFila() {
  const gtf = `${P}-G${++n}`;
  const fila = (especie: string) =>
    prisma.woodEntry.create({
      data: {
        tenantId: TENANT,
        gtfNumber: gtf,
        providerName: `${P} proveedor`,
        speciesCommonName: especie,
        volumeM3: 10,
        status: "validado",
        entryDate: LLEGADA,
        createdBy: P,
      },
    });
  const tornillo = await fila("Tornillo");
  const cachimbo = await fila("Cachimbo");
  const troza = (vol: number) =>
    prisma.woodEntryTroza.create({
      data: {
        tenantId: TENANT,
        woodEntryId: tornillo.id, // mal puesta: es Cachimbo
        orden: ++n,
        codificacion: `${P}-T${n}`,
        especieComun: "Cachimbo",
        volumenM3: vol,
        fechaRecepcion: LLEGADA,
      },
    });
  const t1 = await troza(1.5);
  const t2 = await troza(1.0);
  const lote = await ForestLoteAserrioDB.create(TENANT, {
    speciesCommon: "Cachimbo",
    code: `${P}-L${++n}`,
    createdBy: P,
  });
  const r = await ForestLoteAserrioDB.agregarTrozas(TENANT, lote.id, [t1.id, t2.id], P);
  expect(r.rechazadas).toEqual([]);
  return { tornillo, cachimbo, trozaIds: [t1.id, t2.id], lote };
}

/** Una corrida de Cachimbo abierta (sin producción declarada). */
async function corrida(volumeInputM3: number | null) {
  return prisma.forestCtpEntry.create({
    data: {
      tenantId: TENANT,
      section: "produccion",
      lineNo: 96_700 + ++n,
      entryDate: DIA_CORRIDA,
      speciesCommon: "Cachimbo",
      productType: `${P}-prod`,
      volumeInputM3,
      unit: "m3",
      moneda: "PEN",
      status: "registrado",
      createdBy: P,
    },
  });
}

const r4 = (x: number) => Math.round(x * 10000) / 10000;

/**
 * El libro NO partido: por cada fila, los m³ atribuidos a la corrida son lo
 * que suman las piezas de esa fila que la corrida consumió.
 */
async function porFila(corridaId: string) {
  const consumos = await prisma.forestCtpConsumo.findMany({
    where: { tenantId: TENANT, ctpEntryId: corridaId },
    select: { woodEntryId: true, volumeM3: true },
  });
  const piezas = await prisma.woodEntryTroza.findMany({
    where: { tenantId: TENANT, consumidaEnId: corridaId },
    select: { woodEntryId: true, volumenM3: true },
  });
  const m3 = Object.fromEntries(consumos.map((c) => [c.woodEntryId, r4(Number(c.volumeM3))]));
  const pz: Record<string, number> = {};
  for (const p of piezas) pz[p.woodEntryId] = r4((pz[p.woodEntryId] ?? 0) + Number(p.volumenM3));
  return { m3, piezas: pz };
}

/** Barre por PATRÓN, incluida la basura de una corrida anterior que murió sin limpiar. */
async function purgar() {
  const wood = { tenantId: TENANT, gtfNumber: { startsWith: "TEST-SC-" } };
  const linea = { tenantId: TENANT, createdBy: { startsWith: "TEST-SC-" } };
  await prisma.forestCtpConsumo.deleteMany({
    where: { OR: [{ ctpEntry: linea }, { woodEntry: wood }, { createdBy: { startsWith: "TEST-SC-" } }] },
  });
  await prisma.forestLoteAserrio.deleteMany({ where: { tenantId: TENANT, code: { startsWith: "TEST-SC-" } } });
  await prisma.forestCtpEntry.deleteMany({ where: linea });
  await prisma.woodEntry.deleteMany({ where: wood }); // las trozas caen en cascada
  await prisma.activityLog.deleteMany({ where: { tenantId: TENANT, user: { startsWith: "TEST-SC-" } } });
}

/* Top-level await, no `beforeAll`: `skipIf` se evalúa al coleccionar. */
const HAS_DB: boolean = await prisma.$queryRaw`SELECT 1`
  .then(() => prisma.forestLoteAserrio.count({ where: { tenantId: TENANT } }))
  .then(() => true)
  .catch(() => false);

beforeAll(async () => {
  if (HAS_DB) await purgar();
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  if (!HAS_DB) return;
  try {
    await purgar();
  } catch (err) {
    console.error("\n🔴 LA LIMPIEZA FALLÓ — quedan datos TEST-SC- en `main`. Corré de nuevo (el beforeAll purga).\n", err);
    throw err;
  }
}, 60_000);

describe.skipIf(!HAS_DB)("sumarACorrida vs. acomodar trozas desde el acta del lote", () => {
  it("el acomodo lanzado entre la lectura y la escritura espera: m³ y piezas quedan en la MISMA fila", async () => {
    const g = await guiaConTrozasEnOtraFila();
    const cor = await corrida(null);

    /* Entre la lectura y la escritura de la suma, alguien abre el acta del
       lote y aprieta «Acomodar trozas». Se le da 2,5 s para terminar antes de
       seguir: sin lock lo logra (y parte el libro); con lock queda esperando. */
    let acomodo: ReturnType<typeof AcomodarTrozasDB.aplicar> | null = null;
    const original = ForestCtpConsumoDB.setConsumosEnTx;
    vi.spyOn(ForestCtpConsumoDB, "setConsumosEnTx").mockImplementationOnce(async (...args) => {
      acomodo = AcomodarTrozasDB.aplicar(TENANT, { woodEntryId: g.tornillo.id }, P, { loteId: g.lote.id });
      /* Sólo se espera: si el acomodo falla, el `await acomodo` de abajo lo tira. */
      const termino = acomodo.then(
        () => "termino",
        () => "fallo",
      );
      await Promise.race([termino, new Promise((ok) => setTimeout(ok, 2_500))]);
      return original.apply(ForestCtpConsumoDB, args);
    });

    const r = await ForestLoteAserrioDB.sumarACorrida(TENANT, {
      loteId: g.lote.id,
      corridaId: cor.id,
      trozaIds: g.trozaIds,
      fecha: DIA_CORRIDA,
      user: P,
    });
    expect(acomodo).not.toBeNull();
    const ac = await acomodo!;

    expect(r).toMatchObject({ piezas: 2, volumenM3: 2.5, volumenTotalM3: 2.5, loteCerrado: true });

    /* El libro no quedó partido: el m³ y las piezas, en la misma fila. */
    const f = await porFila(cor.id);
    expect(f.m3).toEqual(f.piezas);
    expect(f.m3).toEqual({ [g.tornillo.id]: 2.5 });

    /* El acomodo entró DESPUÉS: las piezas ya estaban consumidas y no se mueven
       (su m³ está descontado en la fila donde están). */
    expect(ac.movidas).toBe(0);

    const acta = await prisma.forestCtpEntry.findUnique({ where: { id: cor.id }, select: { volumeInputM3: true } });
    expect(Number(acta?.volumeInputM3)).toBe(2.5);
  }, 90_000);

  it("otro tenant no ve la corrida: rechazo y nada escrito", async () => {
    const g = await guiaConTrozasEnOtraFila();
    const cor = await corrida(null);
    const e = await ForestLoteAserrioDB.sumarACorrida(`${P}-otro-tenant`, {
      loteId: g.lote.id,
      corridaId: cor.id,
      trozaIds: g.trozaIds,
      user: P,
    }).then(
      () => null,
      (err: unknown) => err,
    );
    expect(e).toBeInstanceOf(CtpInvariantError);
    expect((e as CtpInvariantError).code).toBe("LOTE_NO_ENCONTRADO");
    const f = await porFila(cor.id);
    expect(f).toEqual({ m3: {}, piezas: {} });
  }, 60_000);
});

describe.skipIf(!HAS_DB)("consumir vs. acomodar trozas: el rechazo no deja m³ escritos", () => {
  it("TROZA_CAMBIO_DE_FILA → la corrida queda sin atribución; el reintento entra limpio", async () => {
    const g = await guiaConTrozasEnOtraFila();
    /* Como la deja `POST /ctp` con `loteAserrioId`: la corrida ya existe y
       sigue viva si el consumo del lote falla. */
    const cor = await corrida(2.5);

    /* Entre la lectura de las piezas (fuera de la tx) y la transacción, el
       acomodo termina entero: las dos trozas pasan a la fila de Cachimbo. Los
       cierres se leen justo en ese hueco, en el código viejo y en el nuevo. */
    const original = ForestCtpCierreDB.list;
    let movidas = -1;
    vi.spyOn(ForestCtpCierreDB, "list").mockImplementationOnce(async (tenantId: string) => {
      const ac = await AcomodarTrozasDB.aplicar(TENANT, { woodEntryId: g.tornillo.id }, P, { loteId: g.lote.id });
      movidas = ac.movidas;
      return original.call(ForestCtpCierreDB, tenantId);
    });

    const e = await ForestLoteAserrioDB.consumir(TENANT, g.lote.id, cor.id, DIA_CORRIDA, P).then(
      () => null,
      (err: unknown) => err,
    );
    expect(movidas).toBe(2);
    expect(e).toBeInstanceOf(CtpInvariantError);
    expect((e as CtpInvariantError).detail).toMatchObject({ motivo: "TROZA_CAMBIO_DE_FILA" });

    /* Nada escrito: ni m³ por guía, ni piezas, ni el lote cerrado. */
    expect(await porFila(cor.id)).toEqual({ m3: {}, piezas: {} });
    const lote = await prisma.forestLoteAserrio.findUnique({ where: { id: g.lote.id }, select: { status: true } });
    expect(lote?.status).toBe("abierto");
    const trozas = await prisma.woodEntryTroza.findMany({
      where: { id: { in: g.trozaIds } },
      select: { woodEntryId: true, consumidaEnId: true },
    });
    expect(trozas.every((t) => t.woodEntryId === g.cachimbo.id && t.consumidaEnId == null)).toBe(true);

    /* El reintento (sin nadie acomodando) lee la fila nueva y deja el libro
       entero en ella. Con la atribución vieja escrita, `yaAtribuida > 0`
       salteaba el control y partía el libro. */
    const r = await ForestLoteAserrioDB.consumir(TENANT, g.lote.id, cor.id, DIA_CORRIDA, P);
    expect(r).toEqual({ piezas: 2, volumenM3: 2.5 });
    const f = await porFila(cor.id);
    expect(f.m3).toEqual(f.piezas);
    expect(f.m3).toEqual({ [g.cachimbo.id]: 2.5 });
  }, 90_000);
});
