/**
 * `ForestVincularTrozasDB` contra la BASE REAL — tenant `main`, prefijo `TEST-VT-`.
 *
 * Por qué no con mocks: lo que importa es que el lote nuevo, el movimiento de
 * las trozas y la vinculación queden en UNA transacción, que los locks cierren
 * la carrera y que un rechazo deje la base intacta (sin lote huérfano). Cada
 * rechazo se verifica mirando la base después.
 *
 * La especie es ÚNICA por corrida del test (`Vt<runId>`): el diagnóstico lee el
 * patio entero de `main`, y otra QA con Cachimbo cambiaría la propuesta.
 * Fechas en abril de 2099: un mes sin datos reales ni cierres.
 *
 * Para correr:
 *   node --env-file=.env.local node_modules/.bin/vitest run __tests__/forestal-vincular-trozas-db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.AUDIT_CHAIN_ENABLED ??= "false";

import { prisma } from "@/lib/prisma";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { ForestVincularTrozasDB } from "@/lib/db/forest-vincular-trozas.db";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";
import { esChoqueDeLocks } from "@/lib/forestal/ctp-api-errors";

const TENANT = "main";
const runId = Math.random().toString(36).slice(2, 8);
const P = `TEST-VT-${runId}`;
const ESPECIE = `Vt${runId}`;
const OTRA_ESPECIE = `Vtotra${runId}`;
const PERMISO = `${P}-PERMISO-A`;
const LLEGADA = new Date("2099-04-01T12:00:00.000Z");
const DIA_CORRIDA = new Date("2099-04-10T12:00:00.000Z");

let n = 0;

async function guia(vol: number, opts: { especie?: string; permiso?: string; status?: "validado" | "pendiente" } = {}) {
  const w = await WoodEntriesDB.create(TENANT, {
    gtfNumber: `${P}-G${++n}`,
    providerName: `${P} proveedor`,
    speciesCommonName: opts.especie ?? ESPECIE,
    speciesCites: false,
    volumeM3: vol,
    costoTotal: null,
    moneda: "PEN",
    createdBy: P,
  });
  await prisma.woodEntry.update({
    where: { id: w.id },
    data: { status: opts.status ?? "validado", originCode: opts.permiso ?? PERMISO },
  });
  return w;
}

async function troza(woodEntryId: string, vol: number, llegada: Date = LLEGADA, especie = ESPECIE) {
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

/** Una corrida como la deja Declarar (ADR-429): con producción, SIN origen, con su permiso. */
async function corrida(producidoM3: number, opts: { fecha?: Date; permiso?: string | null; volumenEntrada?: number } = {}) {
  return prisma.forestCtpEntry.create({
    data: {
      tenantId: TENANT,
      section: "produccion",
      lineNo: 98_500 + ++n,
      entryDate: opts.fecha ?? DIA_CORRIDA,
      speciesCommon: ESPECIE,
      productType: `${P}-prod`,
      quantity: producidoM3,
      unit: "m3",
      moneda: "PEN",
      status: "registrado",
      originCode: opts.permiso === undefined ? PERMISO : opts.permiso,
      volumeInputM3: opts.volumenEntrada ?? null,
      createdBy: P,
    },
  });
}

/** Lo que un rechazo NO debe haber dejado: ni consumo, ni volumen, ni piezas, ni lote nuevo. */
async function nadaEscrito(corridaId: string, trozaIds: string[]) {
  const [c, consumos, trozas, lotes] = await Promise.all([
    prisma.forestCtpEntry.findUnique({ where: { id: corridaId }, select: { volumeInputM3: true, lineNo: true } }),
    prisma.forestCtpConsumo.count({ where: { tenantId: TENANT, ctpEntryId: corridaId } }),
    prisma.woodEntryTroza.findMany({ where: { id: { in: trozaIds } }, select: { consumidaEnId: true, loteAserrioId: true } }),
    prisma.forestLoteAserrio.count({ where: { tenantId: TENANT, createdBy: P, produccionEntryId: corridaId } }),
  ]);
  expect(c?.volumeInputM3).toBeNull();
  expect(consumos).toBe(0);
  expect(trozas.every((t) => t.consumidaEnId == null && t.loteAserrioId == null)).toBe(true);
  expect(lotes).toBe(0);
  const huerfanos = await prisma.forestLoteAserrio.count({
    where: { tenantId: TENANT, createdBy: P, notes: { contains: `N° ${c?.lineNo} ` } },
  });
  expect(huerfanos).toBe(0);
}

async function consumidoVigente(woodEntryId: string) {
  const r = await prisma.forestCtpConsumo.aggregate({
    where: { tenantId: TENANT, woodEntryId, ctpEntry: { status: "registrado", deletedAt: null } },
    _sum: { volumeM3: true },
  });
  return Number(r._sum.volumeM3 ?? 0);
}

/** Barre por PATRÓN, incluida la basura de una corrida anterior que murió sin limpiar. */
async function purgar() {
  const wood = { gtfNumber: { startsWith: "TEST-VT-" } };
  const linea = { tenantId: TENANT, createdBy: { startsWith: "TEST-VT-" } };
  await prisma.forestCtpConsumo.deleteMany({
    where: { OR: [{ ctpEntry: linea }, { woodEntry: wood }, { createdBy: { startsWith: "TEST-VT-" } }] },
  });
  await prisma.forestLoteAserrio.deleteMany({
    where: { tenantId: TENANT, OR: [{ createdBy: { startsWith: "TEST-VT-" } }, { code: { startsWith: "TEST-VT-" } }] },
  });
  await prisma.forestCtpEntry.deleteMany({ where: linea });
  await prisma.woodEntry.deleteMany({ where: wood }); // las trozas caen en cascada
  await prisma.activityLog.deleteMany({ where: { tenantId: TENANT, user: { startsWith: "TEST-VT-" } } });
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
  } finally {
    await prisma.$disconnect();
  }
}, 60_000);

describe.skipIf(!HAS_DB)("vincular trozas sueltas (base real)", () => {
  it("arma UN lote con las sueltas, vincula, escribe el consumo por guía y cierra el lote", async () => {
    const g = await guia(5);
    const [t1, t2] = [await troza(g.id, 0.6), await troza(g.id, 0.6)];
    const c = await corrida(0.5);

    const diag = await ForestVincularTrozasDB.diagnosticoDeCorrida(TENANT, c.id);
    expect(diag.ok && diag.diagnostico.motivo).toBe("lista");
    expect(diag.ok && diag.diagnostico.propuesta.map((t) => t.trozaId).sort()).toEqual([t1.id, t2.id].sort());

    const r = await ForestVincularTrozasDB.vincularTrozas(TENANT, { corridaId: c.id, trozaIds: [t1.id, t2.id] }, P);
    expect(r).toMatchObject({ corridaId: c.id, trozas: 2, m3: 1.2 });
    expect(r.lotesArmados).toHaveLength(1);

    const [cor, trozas, lote] = await Promise.all([
      prisma.forestCtpEntry.findUnique({ where: { id: c.id }, select: { volumeInputM3: true } }),
      prisma.woodEntryTroza.findMany({ where: { id: { in: [t1.id, t2.id] } }, select: { consumidaEnId: true, loteAserrioId: true } }),
      prisma.forestLoteAserrio.findFirst({
        where: { tenantId: TENANT, code: r.lotesArmados[0] },
        select: { id: true, status: true, produccionEntryId: true, permiso: true, speciesCommon: true },
      }),
    ]);
    expect(Number(cor?.volumeInputM3)).toBeCloseTo(1.2, 4);
    expect(await consumidoVigente(g.id)).toBeCloseTo(1.2, 4);
    expect(lote).toMatchObject({ status: "consumido", produccionEntryId: c.id, permiso: PERMISO, speciesCommon: ESPECIE });
    expect(trozas.every((t) => t.consumidaEnId === c.id && t.loteAserrioId === lote?.id)).toBe(true);

    const despues = await ForestVincularTrozasDB.diagnosticoDeCorrida(TENANT, c.id);
    expect(despues).toMatchObject({ ok: false, error: "ya_tiene_origen" });
  });

  it("doble pedido con la misma troza: exactamente uno gana y el consumo no pasa lo de la guía", async () => {
    const g = await guia(1);
    const t = await troza(g.id, 1);
    const [a, b] = [await corrida(0.5), await corrida(0.5)];

    const res = await Promise.allSettled([
      ForestVincularTrozasDB.vincularTrozas(TENANT, { corridaId: a.id, trozaIds: [t.id] }, P),
      ForestVincularTrozasDB.vincularTrozas(TENANT, { corridaId: b.id, trozaIds: [t.id] }, P),
    ]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const rechazo = (res.find((x) => x.status === "rejected") as PromiseRejectedResult).reason;
    /* Lo que la ruta devuelve como 409: una invariante del libro (no un 400 ni
       un 404) o un choque de locks. */
    const es409 =
      (rechazo instanceof CtpInvariantError && !["VALIDACION", "TENANT_MISMATCH"].includes(rechazo.code)) ||
      esChoqueDeLocks(rechazo);
    expect(es409).toBe(true);
    expect(await consumidoVigente(g.id)).toBeLessThanOrEqual(1 + 1e-9);
    /* Y la perdedora no dejó un lote a medias. */
    const perdedora = res[0]!.status === "rejected" ? a : b;
    await expect(
      prisma.forestLoteAserrio.count({ where: { tenantId: TENANT, createdBy: P, produccionEntryId: perdedora.id } }),
    ).resolves.toBe(0);
  }, 60_000);

  it("una corrida ANULADA libera sus trozas: otra corrida las vincula desde su lote muerto", async () => {
    const g = await guia(2);
    const t = await troza(g.id, 1);
    const a = await corrida(0.5);
    const primero = await ForestVincularTrozasDB.vincularTrozas(TENANT, { corridaId: a.id, trozaIds: [t.id] }, P);
    await ForestCtpDB.annul(TENANT, a.id, "prueba: se anuló la corrida", P);

    const b = await corrida(0.4);
    const r = await ForestVincularTrozasDB.vincularTrozas(TENANT, { corridaId: b.id, trozaIds: [t.id] }, P);
    expect(r.trozas).toBe(1);
    expect(r.lotesArmados).toHaveLength(1);
    expect(r.lotesArmados[0]).not.toBe(primero.lotesArmados[0]);
    const pieza = await prisma.woodEntryTroza.findUnique({ where: { id: t.id }, select: { consumidaEnId: true } });
    expect(pieza?.consumidaEnId).toBe(b.id);
    expect(await consumidoVigente(g.id)).toBeCloseTo(1, 4);
  }, 60_000);

  it("otro permiso → rechazo con el permiso en la frase, y nada escrito", async () => {
    const g = await guia(3, { permiso: `${P}-PERMISO-B` });
    const t = await troza(g.id, 1);
    const c = await corrida(0.5);
    const err = await ForestVincularTrozasDB.vincularTrozas(TENANT, { corridaId: c.id, trozaIds: [t.id] }, P).catch((e) => e);
    expect(err).toBeInstanceOf(CtpInvariantError);
    expect(err.code).toBe("T1_TROZA_NO_CONSUMIBLE");
    expect(err.message).toContain(`es del permiso ${P}-PERMISO-B`);
    await nadaEscrito(c.id, [t.id]);
  });

  it("T3: la troza llegó DESPUÉS de la corrida → rechazo, y el lote que se iba a armar no queda", async () => {
    const g = await guia(3);
    const t = await troza(g.id, 1, new Date("2099-04-20T12:00:00.000Z"));
    const c = await corrida(0.5);
    await expect(
      ForestVincularTrozasDB.vincularTrozas(TENANT, { corridaId: c.id, trozaIds: [t.id] }, P),
    ).rejects.toMatchObject({ code: "T3_ASERRADA_ANTES_DE_LLEGAR" });
    await nadaEscrito(c.id, [t.id]);
    const diag = await ForestVincularTrozasDB.diagnosticoDeCorrida(TENANT, c.id);
    expect(diag.ok && diag.diagnostico.motivo).toBe("llegada_posterior");
  });

  it("corrida de inventario (ya declara materia prima sin trozas) → rechazo; el diagnóstico dice «apertura»", async () => {
    const g = await guia(3);
    const t = await troza(g.id, 1);
    const c = await corrida(0.5, { volumenEntrada: 0.9 });
    await prisma.forestLoteAserrio.create({
      data: { tenantId: TENANT, code: `${P}-INV${++n}`, speciesCommon: ESPECIE, status: "consumido", produccionEntryId: c.id, createdBy: P },
    });
    await expect(
      ForestVincularTrozasDB.vincularTrozas(TENANT, { corridaId: c.id, trozaIds: [t.id] }, P),
    ).rejects.toMatchObject({ code: "LINEA_NO_EDITABLE" });
    const pieza = await prisma.woodEntryTroza.findUnique({ where: { id: t.id }, select: { consumidaEnId: true, loteAserrioId: true } });
    expect(pieza).toEqual({ consumidaEnId: null, loteAserrioId: null });
    const diag = await ForestVincularTrozasDB.diagnosticoDeCorrida(TENANT, c.id);
    expect(diag.ok && diag.diagnostico.motivo).toBe("apertura");
  });

  it("anotada en la fila de otra especie → rechazo que dice dónde acomodarla", async () => {
    const g = await guia(3, { especie: OTRA_ESPECIE });
    const t = await troza(g.id, 1);
    const c = await corrida(0.5);
    const err = await ForestVincularTrozasDB.vincularTrozas(TENANT, { corridaId: c.id, trozaIds: [t.id] }, P).catch((e) => e);
    expect(err.code).toBe("T1_TROZA_NO_CONSUMIBLE");
    expect(err.message).toContain(`fila de ${OTRA_ESPECIE}`);
    await nadaEscrito(c.id, [t.id]);
  });

  it("otro negocio no ve la corrida ni las trozas: TENANT_MISMATCH", async () => {
    const g = await guia(3);
    const t = await troza(g.id, 1);
    const c = await corrida(0.5);
    await expect(
      ForestVincularTrozasDB.vincularTrozas("tenant-que-no-existe", { corridaId: c.id, trozaIds: [t.id] }, P),
    ).rejects.toMatchObject({ code: "TENANT_MISMATCH" });
    expect(await ForestVincularTrozasDB.diagnosticoDeCorrida("tenant-que-no-existe", c.id)).toMatchObject({
      ok: false,
      error: "no_existe",
    });
    await nadaEscrito(c.id, [t.id]);
  });

  it("la propuesta ANTES de que exista la corrida usa las mismas reglas", async () => {
    const g = await guia(3);
    const t = await troza(g.id, 1);
    const r = await ForestVincularTrozasDB.propuesta(TENANT, {
      especie: ESPECIE,
      fecha: "2099-04-10",
      m3: 0.3,
      permiso: PERMISO,
    });
    expect(r.ok && r.motivo).toBe("lista");
    /* Otras trozas libres de la especie (de los casos de arriba) llegaron el
       mismo día y pueden ir primero en el orden de la sierra: lo que se afirma
       es que la propuesta sale de la especie y alcanza para lo pedido ÷ 56 %. */
    expect(r.ok && r.propuesta.length).toBeGreaterThan(0);
    expect(r.ok && r.propuesta.every((p) => p.especie === ESPECIE)).toBe(true);
    expect(r.ok && r.m3Propuesto).toBeGreaterThanOrEqual(0.3 / 0.56 - 0.01);
    /* Sin producido conocido (0) se propone TODA la madera usable: la de este caso entra. */
    const toda = await ForestVincularTrozasDB.propuesta(TENANT, { especie: ESPECIE, fecha: "2099-04-10", m3: 0, permiso: PERMISO });
    expect(toda.ok && toda.propuesta.some((p) => p.trozaId === t.id)).toBe(true);
    const otro = await ForestVincularTrozasDB.propuesta(TENANT, { especie: ESPECIE, fecha: "2099-04-10", m3: 0.3, permiso: "OTRO-PERMISO" });
    expect(otro.ok && otro.motivo).toBe("sin_trozas_de_la_especie");
    await expect(
      ForestVincularTrozasDB.propuesta(TENANT, { especie: ESPECIE, fecha: "2099-04-10", m3: 0.3, contratoId: "ctr_de_otro_negocio" }),
    ).resolves.toMatchObject({ ok: false, error: "contrato_no_existe" });
  });
});
