/**
 * `vincularCorrida` (ADR-441) contra la BASE REAL — tenant `main`, prefijo `TEST-VINC-`.
 *
 * ── Qué se prueba y por qué no con mocks ──────────────────────────────────
 * Lo que importa es que TODO quede en una transacción y que los locks cierren
 * las carreras: un mock prueba que se llamó al `where` correcto, no que Postgres
 * bloquee la troza, ni que un 422 deje la base intacta. Por eso cada rechazo se
 * verifica mirando la base después: ni volumen, ni consumos, ni piezas.
 *
 *  · 2 lotes → 1 corrida: el consumo por guía suma lo que suman sus trozas, I2
 *    se sostiene, el lote vaciado se cierra y el parcial sigue abierto.
 *  · producido > trozas, T3 y mes cerrado → 422 y NADA escrito.
 *  · dos vinculaciones simultáneas de la misma troza → exactamente una gana.
 *  · otro tenant no ve la corrida.
 *
 * Fechas en 2099 (febrero/marzo): meses sin datos reales, así cerrar uno para
 * la prueba no toca nada vivo (mismo criterio que forestal-ctp-consumo.test.ts,
 * que usa enero 2099: acá se usa marzo para no pisarle el KV).
 *
 * Para correr:
 *   node --env-file=.env.local node_modules/.bin/vitest run __tests__/forestal-vincular-corrida.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

process.env.AUDIT_CHAIN_ENABLED ??= "false";

import { prisma } from "@/lib/prisma";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { ForestLoteAserrioDB } from "@/lib/db/forest-lote-aserrio.db";
import { ForestVincularCorridaDB } from "@/lib/db/forest-vincular-corrida.db";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";

const TENANT = "main";
const runId = Math.random().toString(36).slice(2, 8);
const P = `TEST-VINC-${runId}`;
/** Llegada de la madera al patio: antes de todas las corridas de la prueba. */
const LLEGADA = new Date("2099-02-01T12:00:00.000Z");
const DIA_CORRIDA = new Date("2099-02-10T12:00:00.000Z");

let n = 0;

/** Una guía de ingreso validada (= recibida), con su permiso. */
async function guia(vol: number, especie: string, permiso: string) {
  const w = await WoodEntriesDB.create(TENANT, {
    gtfNumber: `${P}-G${++n}`,
    providerName: `${P} proveedor`,
    speciesCommonName: especie,
    speciesCites: false,
    volumeM3: vol,
    costoTotal: null,
    moneda: "PEN",
    createdBy: P,
  });
  await prisma.woodEntry.update({ where: { id: w.id }, data: { status: "validado", originCode: permiso } });
  return w;
}

async function troza(woodEntryId: string, vol: number, especie: string, llegada: Date = LLEGADA) {
  return prisma.woodEntryTroza.create({
    data: {
      tenantId: TENANT,
      woodEntryId,
      orden: ++n,
      codificacion: `${P}-T${n}`,
      especieComun: especie,
      volumenM3: vol,
      fechaRecepcion: llegada,
    },
  });
}

/** Un lote abierto con sus trozas, por la puerta de siempre (`agregarTrozas`). */
async function lote(especie: string, trozaIds: string[]) {
  const l = await ForestLoteAserrioDB.create(TENANT, { speciesCommon: especie, code: `${P}-L${++n}`, createdBy: P });
  const r = await ForestLoteAserrioDB.agregarTrozas(TENANT, l.id, trozaIds, P);
  expect(r.rechazadas).toEqual([]);
  return l;
}

/** Una corrida como la deja Declarar (ADR-429): con producción y SIN origen. */
async function corrida(producidoM3: number, especie: string, fecha: Date = DIA_CORRIDA) {
  return prisma.forestCtpEntry.create({
    data: {
      tenantId: TENANT,
      section: "produccion",
      lineNo: 97_000 + ++n,
      entryDate: fecha,
      speciesCommon: especie,
      productType: `${P}-prod`,
      quantity: producidoM3,
      unit: "m3",
      moneda: "PEN",
      status: "registrado",
      createdBy: P,
    },
  });
}

/** Lo que una vinculación rechazada NO debe haber dejado escrito. */
async function nadaEscrito(corridaId: string, trozaIds: string[], loteIds: string[]) {
  const [c, consumos, trozas, lotes] = await Promise.all([
    prisma.forestCtpEntry.findUnique({ where: { id: corridaId }, select: { volumeInputM3: true, rendimientoPct: true } }),
    prisma.forestCtpConsumo.count({ where: { tenantId: TENANT, ctpEntryId: corridaId } }),
    prisma.woodEntryTroza.findMany({ where: { id: { in: trozaIds } }, select: { consumidaEnId: true, fechaConsumo: true } }),
    prisma.forestLoteAserrio.findMany({ where: { id: { in: loteIds } }, select: { status: true, produccionEntryId: true } }),
  ]);
  expect(c?.volumeInputM3).toBeNull();
  expect(c?.rendimientoPct).toBeNull();
  expect(consumos).toBe(0);
  expect(trozas.every((t) => t.consumidaEnId == null && t.fechaConsumo == null)).toBe(true);
  expect(lotes.every((l) => l.status === "abierto" && l.produccionEntryId == null)).toBe(true);
}

/** Barre por PATRÓN, incluida la basura de una corrida anterior que murió sin limpiar. */
async function purgar() {
  const wood = { gtfNumber: { startsWith: "TEST-VINC-" } };
  const linea = { tenantId: TENANT, createdBy: { startsWith: "TEST-VINC-" } };
  await prisma.forestCtpConsumo.deleteMany({
    where: { OR: [{ ctpEntry: linea }, { woodEntry: wood }, { createdBy: { startsWith: "TEST-VINC-" } }] },
  });
  await prisma.forestLoteAserrio.deleteMany({ where: { tenantId: TENANT, code: { startsWith: "TEST-VINC-" } } });
  await prisma.forestCtpEntry.deleteMany({ where: linea });
  await prisma.woodEntry.deleteMany({ where: wood }); // las trozas caen en cascada
  await prisma.activityLog.deleteMany({ where: { tenantId: TENANT, user: { startsWith: "TEST-VINC-" } } });
}

/* Top-level await, no `beforeAll`: `skipIf` se evalúa al coleccionar. */
const HAS_DB: boolean = await prisma.$queryRaw`SELECT 1`
  .then(() => prisma.forestLoteAserrio.count({ where: { tenantId: TENANT } }))
  .then(() => true)
  .catch(() => false);

beforeAll(async () => {
  if (HAS_DB) await purgar();
}, 60_000);

afterAll(async () => {
  if (!HAS_DB) return;
  try {
    await purgar();
  } catch (err) {
    console.error("\n🔴 LA LIMPIEZA FALLÓ — quedan datos TEST-VINC- en `main`. Corré de nuevo (el beforeAll purga).\n", err);
    throw err;
  }
}, 60_000);

describe.skipIf(!HAS_DB)("vincularCorrida · 2 lotes, 1 corrida", () => {
  it("escribe volumen, consumo por guía y piezas; I2 se sostiene; cierra sólo el lote vaciado", async () => {
    /* Mashonaste de DOS permisos (el caso del mixto de Blas): dos guías, dos lotes. */
    const g1 = await guia(3, "Mashonaste", `${P}-P1`);
    const g2 = await guia(2, "Mashonaste", `${P}-P2`);
    const a = await troza(g1.id, 1.2, "Mashonaste");
    const b = await troza(g1.id, 0.8, "Mashonaste");
    const d = await troza(g1.id, 0.5, "Mashonaste"); // se queda en el lote: saldo
    const c = await troza(g2.id, 1.0, "Mashonaste");
    const l1 = await lote("Mashonaste", [a.id, b.id, d.id]);
    const l2 = await lote("Mashonaste", [c.id]);
    const cor = await corrida(1.5, "Mashonaste");

    const r = await ForestVincularCorridaDB.vincularCorrida(
      TENANT,
      { corridaId: cor.id, partes: [{ loteId: l1.id, trozaIds: [a.id, b.id] }, { loteId: l2.id, trozaIds: [c.id] }] },
      P,
    );

    expect(r).toMatchObject({
      piezas: 3,
      volumenM3: 3,
      volumenTotalM3: 3,
      rendimientoPct: 50,
      sobreElTope: false,
      lotesConsumidos: [{ id: l2.id, code: l2.code }],
    });
    expect(r.partes).toEqual([
      { loteId: l1.id, code: l1.code, piezas: 2, volumenM3: 2, loteConsumido: false },
      { loteId: l2.id, code: l2.code, piezas: 1, volumenM3: 1, loteConsumido: true },
    ]);

    /* El consumo por guía es lo que suman SUS trozas, y cuadra con el acta. */
    const consumos = await prisma.forestCtpConsumo.findMany({
      where: { tenantId: TENANT, ctpEntryId: cor.id },
      select: { woodEntryId: true, volumeM3: true },
    });
    const porGuia = Object.fromEntries(consumos.map((x) => [x.woodEntryId, Number(x.volumeM3)]));
    expect(porGuia).toEqual({ [g1.id]: 2, [g2.id]: 1 });
    const acta = await prisma.forestCtpEntry.findUnique({
      where: { id: cor.id },
      select: { volumeInputM3: true, rendimientoPct: true },
    });
    expect(Number(acta?.volumeInputM3)).toBe(3);
    expect(Number(acta?.rendimientoPct)).toBe(50);

    /* I2: ninguna guía consumida por encima de lo que declara. */
    for (const g of [g1, g2]) {
      const s = await prisma.forestCtpConsumo.aggregate({
        where: { tenantId: TENANT, woodEntryId: g.id },
        _sum: { volumeM3: true },
      });
      expect(Number(s._sum.volumeM3 ?? 0)).toBeLessThanOrEqual(Number(g.volumeM3));
    }

    /* Las piezas: las tres elegidas, con el día de la corrida; la cuarta, libre. */
    const piezas = await prisma.woodEntryTroza.findMany({
      where: { id: { in: [a.id, b.id, c.id, d.id] } },
      select: { id: true, consumidaEnId: true, fechaConsumo: true },
    });
    const pieza = Object.fromEntries(piezas.map((t) => [t.id, t]));
    for (const t of [a, b, c]) {
      expect(pieza[t.id]!.consumidaEnId).toBe(cor.id);
      expect(pieza[t.id]!.fechaConsumo?.toISOString()).toBe(DIA_CORRIDA.toISOString());
    }
    expect(pieza[d.id]!.consumidaEnId).toBeNull();

    const lotes = await prisma.forestLoteAserrio.findMany({
      where: { id: { in: [l1.id, l2.id] } },
      select: { id: true, status: true, produccionEntryId: true },
    });
    const est = Object.fromEntries(lotes.map((l) => [l.id, l]));
    expect(est[l1.id]).toMatchObject({ status: "abierto", produccionEntryId: null });
    expect(est[l2.id]).toMatchObject({ status: "consumido", produccionEntryId: cor.id });

    /* Después del commit, el libro lo narra — y los dos renglones se ESPERAN
       antes de responder (en Vercel lo que sigue después de la respuesta puede
       no terminar): apenas vuelve `vincularCorrida`, ya están, sin reintentos. */
    const renglones = await prisma.activityLog.findMany({
      where: { tenantId: TENANT, entityId: cor.id, action: { in: ["ctp_consumos_set", "ctp_corrida_vincular"] } },
      select: { action: true, detail: true },
    });
    expect(renglones.map((x) => x.action).sort()).toEqual(["ctp_consumos_set", "ctp_corrida_vincular"]);
    const log = renglones.find((x) => x.action === "ctp_corrida_vincular");
    expect(log?.detail).toMatch(/3 trozas/);
    expect(log?.detail).toMatch(/rendimiento 50 %/);

    /* Y ya no se puede volver a vincular: tiene origen (ADR-364). */
    await expect(
      ForestVincularCorridaDB.vincularCorrida(TENANT, { corridaId: cor.id, partes: [{ loteId: l1.id, trozaIds: [d.id] }] }, P),
    ).rejects.toMatchObject({ code: "LINEA_NO_EDITABLE" });
  }, 90_000);
});

describe.skipIf(!HAS_DB)("vincularCorrida · un rechazo no deja NADA escrito", () => {
  it("producido > trozas → VOLUMEN_INSUFICIENTE", async () => {
    const g = await guia(4, "Tornillo", `${P}-P3`);
    const t1 = await troza(g.id, 1.5, "Tornillo");
    const t2 = await troza(g.id, 1.5, "Tornillo");
    const l = await lote("Tornillo", [t1.id, t2.id]);
    const cor = await corrida(3.2, "Tornillo"); // 3,2 m³ de producto con 3,0 de troza

    const err = await ForestVincularCorridaDB.vincularCorrida(
      TENANT,
      { corridaId: cor.id, partes: [{ loteId: l.id, trozaIds: [t1.id, t2.id] }] },
      P,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CtpInvariantError);
    expect(err).toMatchObject({ code: "VOLUMEN_INSUFICIENTE", detail: { declarado: 3.2, propuesto: 3 } });
    await nadaEscrito(cor.id, [t1.id, t2.id], [l.id]);
  }, 60_000);

  it("T3: una troza que llegó DESPUÉS de la corrida → T3_ASERRADA_ANTES_DE_LLEGAR", async () => {
    const g = await guia(4, "Tornillo", `${P}-P3`);
    const aTiempo = await troza(g.id, 1.2, "Tornillo");
    const tarde = await troza(g.id, 1.2, "Tornillo", new Date("2099-02-15T12:00:00.000Z"));
    const l = await lote("Tornillo", [aTiempo.id, tarde.id]);
    const cor = await corrida(1, "Tornillo"); // 10/02

    await expect(
      ForestVincularCorridaDB.vincularCorrida(
        TENANT,
        { corridaId: cor.id, partes: [{ loteId: l.id, trozaIds: [aTiempo.id, tarde.id] }] },
        P,
      ),
    ).rejects.toMatchObject({ code: "T3_ASERRADA_ANTES_DE_LLEGAR" });
    await nadaEscrito(cor.id, [aTiempo.id, tarde.id], [l.id]);
  }, 60_000);

  it("día de consumo: ni después de la corrida, ni antes de que la troza llegue", async () => {
    const g = await guia(4, "Tornillo", `${P}-P3`);
    const t = await troza(g.id, 2, "Tornillo"); // llegó el 01/02
    const l = await lote("Tornillo", [t.id]);
    const cor = await corrida(1, "Tornillo"); // 10/02
    const partes = [{ loteId: l.id, trozaIds: [t.id] }];

    await expect(
      ForestVincularCorridaDB.vincularCorrida(
        TENANT,
        { corridaId: cor.id, partes, fecha: new Date("2099-02-12T12:00:00.000Z") },
        P,
      ),
    ).rejects.toMatchObject({ code: "VALIDACION", detail: { fecha: "2099-02-12", fechaCorrida: "2099-02-10" } });
    await expect(
      ForestVincularCorridaDB.vincularCorrida(
        TENANT,
        { corridaId: cor.id, partes, fecha: new Date("2099-01-25T12:00:00.000Z") },
        P,
      ),
    ).rejects.toMatchObject({ code: "T3_ASERRADA_ANTES_DE_LLEGAR" });
    await nadaEscrito(cor.id, [t.id], [l.id]);

    /* Un día entre la llegada y la corrida sí: la sierra arrancó antes de declarar. */
    await ForestVincularCorridaDB.vincularCorrida(
      TENANT,
      { corridaId: cor.id, partes, fecha: new Date("2099-02-08T12:00:00.000Z") },
      P,
    );
    const pieza = await prisma.woodEntryTroza.findUnique({ where: { id: t.id }, select: { fechaConsumo: true } });
    expect(pieza?.fechaConsumo?.toISOString()).toBe("2099-02-08T12:00:00.000Z");
  }, 90_000);

  it("mes cerrado → PERIODO_CERRADO; con el mes abierto, el MISMO pedido pasa", async () => {
    const KEY = `ctp-cierre:${TENANT}`;
    const { PlatformSettingsDB } = await import("@/lib/db/platform-settings.db");
    const { ForestCtpCierreDB } = await import("@/lib/db/forest-ctp-cierre.db");
    const { monthRange } = await import("@/lib/forestal/ctp-cierre-types");

    const g = await guia(4, "Tornillo", `${P}-P3`);
    const t = await troza(g.id, 2, "Tornillo");
    const l = await lote("Tornillo", [t.id]);
    const cor = await corrida(1, "Tornillo", new Date("2099-03-15T12:00:00.000Z"));
    const pedido = { corridaId: cor.id, partes: [{ loteId: l.id, trozaIds: [t.id] }] };

    const previo: unknown = await PlatformSettingsDB.get(KEY);
    try {
      const { from, to, periodKey, label } = monthRange(2099, 2); // marzo 2099
      await ForestCtpCierreDB.save(
        TENANT,
        {
          periodKey, from: from.toISOString(), to: to.toISOString(), label,
          closedAt: new Date().toISOString(), closedBy: P,
          saldoCierre: { materiaPrima: [], productos: [] },
          totales: { corridas: 0, despachos: 0, ingresosCount: 0, volumenIngresado: 0, corridasCongeladas: 0, corridasSinCostear: 0, especiesEnNegativo: 0 },
        },
        P,
      );
      await expect(ForestVincularCorridaDB.vincularCorrida(TENANT, pedido, P)).rejects.toMatchObject({
        code: "PERIODO_CERRADO",
      });
    } finally {
      /* Se restaura el KV entero: un mes cerrado de más rompería otros tests. */
      await PlatformSettingsDB.set(KEY, previo ?? [], P);
    }
    await nadaEscrito(cor.id, [t.id], [l.id]);

    /* El guard no bloquea de más: reabierto el mes, pasa. */
    await expect(ForestVincularCorridaDB.vincularCorrida(TENANT, pedido, P)).resolves.toMatchObject({
      piezas: 1,
      rendimientoPct: 50,
    });
  }, 90_000);

  it("una troza que no está en el lote citado → T1, con su código, y nada escrito", async () => {
    const g = await guia(4, "Tornillo", `${P}-P3`);
    const enLote = await troza(g.id, 1, "Tornillo");
    const suelta = await troza(g.id, 1, "Tornillo");
    const l = await lote("Tornillo", [enLote.id]);
    const cor = await corrida(0.5, "Tornillo");

    const err = await ForestVincularCorridaDB.vincularCorrida(
      TENANT,
      { corridaId: cor.id, partes: [{ loteId: l.id, trozaIds: [enLote.id, suelta.id] }] },
      P,
    ).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "T1_TROZA_NO_CONSUMIBLE" });
    expect((err as Error).message).toContain(`${suelta.codificacion} (no está en el lote ${l.code})`);
    await nadaEscrito(cor.id, [enLote.id, suelta.id], [l.id]);
  }, 60_000);

  it("otro tenant no ve la corrida: TENANT_MISMATCH, y nada escrito", async () => {
    const g = await guia(2, "Tornillo", `${P}-P3`);
    const t = await troza(g.id, 1, "Tornillo");
    const l = await lote("Tornillo", [t.id]);
    const cor = await corrida(0.5, "Tornillo");
    await expect(
      ForestVincularCorridaDB.vincularCorrida(
        "tenant-ajeno-test-vinc",
        { corridaId: cor.id, partes: [{ loteId: l.id, trozaIds: [t.id] }] },
        P,
      ),
    ).rejects.toMatchObject({ code: "TENANT_MISMATCH" });
    await nadaEscrito(cor.id, [t.id], [l.id]);
  }, 60_000);
});

describe.skipIf(!HAS_DB)("vincularCorrida · dos vinculaciones, una troza", () => {
  /**
   * La carrera que `sumarACorrida` tiene documentada: bloquea la corrida pero no
   * las trozas, así que dos corridas DISTINTAS que piden la misma pieza no se
   * ven. Acá la troza va con `FOR UPDATE ORDER BY id` dentro de la misma tx que
   * escribe: la segunda espera, la lee tomada y se rechaza por la REGLA.
   */
  it("exactamente una corrida se queda con la pieza, y la otra no escribe nada", async () => {
    const g = await guia(5, "Cumala", `${P}-P4`);
    const disputada = await troza(g.id, 1.5, "Cumala");
    const otra = await troza(g.id, 1.5, "Cumala"); // el lote no se vacía: el perdedor choca por T1
    const l = await lote("Cumala", [disputada.id, otra.id]);
    const x = await corrida(0.6, "Cumala");
    const y = await corrida(0.6, "Cumala");

    const res = await Promise.allSettled(
      [x, y].map((c) =>
        ForestVincularCorridaDB.vincularCorrida(
          TENANT,
          { corridaId: c.id, partes: [{ loteId: l.id, trozaIds: [disputada.id] }] },
          P,
        ),
      ),
    );
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rechazo = res.find((r) => r.status === "rejected") as PromiseRejectedResult;
    /* Por la regla, no por un deadlock de Postgres. */
    expect(rechazo.reason).toBeInstanceOf(CtpInvariantError);
    expect(rechazo.reason).toMatchObject({ code: "T1_TROZA_NO_CONSUMIBLE" });

    const final = await prisma.woodEntryTroza.findUnique({ where: { id: disputada.id }, select: { consumidaEnId: true } });
    const ganadora = final?.consumidaEnId;
    expect([x.id, y.id]).toContain(ganadora);
    const perdedora = ganadora === x.id ? y : x;
    await nadaEscrito(perdedora.id, [otra.id], []);

    /* I2 en m³ también: la guía no se consumió dos veces. */
    const s = await prisma.forestCtpConsumo.aggregate({
      where: { tenantId: TENANT, woodEntryId: g.id },
      _sum: { volumeM3: true },
    });
    expect(Number(s._sum.volumeM3 ?? 0)).toBe(1.5);
  }, 90_000);
});
