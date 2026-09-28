/**
 * Vincular en tanda (ADR-447 §1 y §4) contra la BASE REAL — tenant QA forestal
 * `inversiones-agroforestales-blas-sociedad-op-qa-ui`, prefijo `TEST-VTT-`.
 *
 * Escenario sintético: dos corridas de la misma especie y permiso compitiendo
 * por UNA troza, una con la madera llegada después, una de otro permiso, más
 * las piezas sueltas para las tandas. Todo en mayo de 2099 (sin cierres ni
 * datos reales) y con una especie única por corrida del test (`Vtt<runId>`):
 * el diagnóstico lee el patio entero del tenant.
 *
 * Lo que importa y sólo se ve en la base: una tx por corrida (la rechazada no
 * deshace las otras), el lock de la tanda, la idempotencia, que una troza no
 * quede en dos corridas y que el permiso lo frene el NÚCLEO (`vincularCorridaEnTx`),
 * también por la puerta de Lotes.
 *
 * Para correr:
 *   node --env-file=.env.local node_modules/.bin/vitest run __tests__/forestal-vincular-tanda-db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.AUDIT_CHAIN_ENABLED ??= "false";

import { prisma } from "@/lib/prisma";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { ForestLoteAserrioDB } from "@/lib/db/forest-lote-aserrio.db";
import { ForestVincularCorridaDB } from "@/lib/db/forest-vincular-corrida.db";
import { ForestVincularTrozasDB, TandaEnCursoError } from "@/lib/db/forest-vincular-trozas.db";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";

const SLUG = "inversiones-agroforestales-blas-sociedad-op-qa-ui";
const runId = Math.random().toString(36).slice(2, 8);
const P = `TEST-VTT-${runId}`;
const ESPECIE = `Vtt${runId}`;
const PERMISO_A = `${P}-PERMISO-A`;
const PERMISO_B = `${P}-PERMISO-B`;
const LLEGADA = new Date("2099-05-01T12:00:00.000Z");
const dia = (d: string) => new Date(`2099-05-${d}T12:00:00.000Z`);

let TENANT = "";
let n = 0;

async function guia(vol: number, opts: { permiso?: string; especie?: string } = {}) {
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
  await prisma.woodEntry.update({ where: { id: w.id }, data: { status: "validado", originCode: opts.permiso ?? PERMISO_A } });
  return w;
}

async function troza(woodEntryId: string, vol: number, llegada: Date = LLEGADA, especie = ESPECIE) {
  return prisma.woodEntryTroza.create({
    data: { tenantId: TENANT, woodEntryId, orden: ++n, codificacion: `${P}-T${n}`, especieComun: especie, volumenM3: vol, fechaRecepcion: llegada },
  });
}

async function corrida(producidoM3: number, fecha: Date, permiso: string | null = PERMISO_A) {
  return prisma.forestCtpEntry.create({
    data: {
      tenantId: TENANT,
      section: "produccion",
      lineNo: 96_000 + ++n,
      entryDate: fecha,
      speciesCommon: ESPECIE,
      productType: `${P}-prod`,
      quantity: producidoM3,
      unit: "m3",
      moneda: "PEN",
      status: "registrado",
      originCode: permiso,
      createdBy: P,
    },
  });
}

async function consumidoVigente(woodEntryId: string) {
  const r = await prisma.forestCtpConsumo.aggregate({
    where: { tenantId: TENANT, woodEntryId, ctpEntry: { status: "registrado", deletedAt: null } },
    _sum: { volumeM3: true },
  });
  return Number(r._sum.volumeM3 ?? 0);
}

/** Lo que una corrida rechazada NO debe haber dejado: ni volumen, ni consumo, ni piezas. */
async function nadaEscrito(corridaId: string) {
  const [c, consumos, piezas] = await Promise.all([
    prisma.forestCtpEntry.findUnique({ where: { id: corridaId }, select: { volumeInputM3: true } }),
    prisma.forestCtpConsumo.count({ where: { tenantId: TENANT, ctpEntryId: corridaId } }),
    prisma.woodEntryTroza.count({ where: { tenantId: TENANT, consumidaEnId: corridaId } }),
  ]);
  expect(c?.volumeInputM3).toBeNull();
  expect(consumos).toBe(0);
  expect(piezas).toBe(0);
}

/** Barre por PATRÓN, incluida la basura de una corrida anterior que murió sin limpiar. */
async function purgar() {
  if (!TENANT) return;
  const wood = { tenantId: TENANT, gtfNumber: { startsWith: "TEST-VTT-" } };
  const linea = { tenantId: TENANT, createdBy: { startsWith: "TEST-VTT-" } };
  await prisma.forestCtpConsumo.deleteMany({
    where: { tenantId: TENANT, OR: [{ ctpEntry: linea }, { woodEntry: wood }, { createdBy: { startsWith: "TEST-VTT-" } }] },
  });
  await prisma.woodEntryTroza.updateMany({ where: { tenantId: TENANT, entry: wood }, data: { loteAserrioId: null, consumidaEnId: null } });
  await prisma.forestLoteAserrio.deleteMany({
    where: { tenantId: TENANT, OR: [{ createdBy: { startsWith: "TEST-VTT-" } }, { code: { startsWith: "TEST-VTT-" } }] },
  });
  await prisma.forestCtpEntry.deleteMany({ where: linea });
  await prisma.woodEntry.deleteMany({ where: wood }); // las trozas caen en cascada
  await prisma.activityLog.deleteMany({ where: { tenantId: TENANT, user: { startsWith: "TEST-VTT-" } } });
}

/* Top-level await, no `beforeAll`: `skipIf` se evalúa al coleccionar. */
const HAS_DB: boolean = await prisma.tenant
  .findFirst({ where: { slug: SLUG }, select: { id: true } })
  .then((t) => {
    TENANT = t?.id ?? "";
    return Boolean(TENANT);
  })
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
}, 120_000);

describe.skipIf(!HAS_DB)("vincular en tanda (base real, op-qa-ui)", () => {
  it("dos corridas por UNA troza, una llegada después y una de otro permiso: diagnóstico, propuesta y tanda", async () => {
    const g = await guia(5);
    const t1 = await troza(g.id, 1.2);
    const tarde = await troza(g.id, 1, dia("20"));
    await guia(3, { permiso: PERMISO_B, especie: `${ESPECIE}otra` }); // el permiso B existe en el libro (con otra especie)
    const c1 = await corrida(0.5, dia("10"));
    const c2 = await corrida(0.5, dia("11"));
    /* Del 25/04: toda la madera de la guía llegó el 01/05 o después. */
    const cTarde = await corrida(0.3, new Date("2099-04-25T12:00:00.000Z"));
    const cOtro = await corrida(0.4, dia("12"), PERMISO_B);

    /* De a una: c1 y c2 «listas» (las dos ven t1); cTarde por la llegada; cOtro, otro permiso. */
    const diag = await ForestVincularTrozasDB.diagnostico(TENANT);
    const mias = new Map(diag.corridas.filter((c) => [c1.id, c2.id, cTarde.id, cOtro.id].includes(c.corridaId)).map((c) => [c.corridaId, c]));
    expect(mias.get(c1.id)?.motivo).toBe("lista");
    expect(mias.get(c2.id)?.motivo).toBe("lista");
    expect(mias.get(cTarde.id)).toMatchObject({ motivo: "llegada_posterior", arreglo: { tipo: "corregir_llegada" } });
    expect(mias.get(cOtro.id)).toMatchObject({ motivo: "permiso_distinto", arreglo: { tipo: "corregir_corrida", campo: "permiso" } });

    /* En tanda: t1 va a UNA (la más vieja); c2 queda fuera. */
    const { propuesta } = await ForestVincularTrozasDB.tanda(TENANT);
    const grupo = propuesta.grupos.find((x) => x.especie === ESPECIE && x.permiso === PERMISO_A)!;
    expect(grupo.corridas.map((c) => c.corridaId)).toEqual([c1.id]);
    expect(grupo.corridas[0]!.trozas.map((t) => t.trozaId)).toEqual([t1.id]);
    expect(grupo.fuera.map((c) => c.corridaId)).toEqual([c2.id]);
    const pedido = propuesta.pedido.filter((p) => [c1.id, c2.id].includes(p.corridaId));
    expect(pedido).toEqual([{ corridaId: c1.id, trozaIds: [t1.id] }]);

    /* Una tanda con la de la llegada posterior PRIMERO (es la más vieja): se
       frena por T3 y la otra se vincula igual. */
    const r = await ForestVincularTrozasDB.vincularTanda(TENANT, [...pedido, { corridaId: cTarde.id, trozaIds: [tarde.id] }], P);
    expect(r.corridas.map((c) => [c.corridaId, c.estado])).toEqual([
      [cTarde.id, "bloqueada"],
      [c1.id, "vinculada"],
    ]);
    expect(r.corridas[0]).toMatchObject({ codigo: "T3_ASERRADA_ANTES_DE_LLEGAR" });
    expect(r.resumen).toMatchObject({ vinculadas: 1, bloqueadas: 1, trozas: 1, m3: 1.2 });
    await nadaEscrito(cTarde.id);
    expect(await consumidoVigente(g.id)).toBeCloseTo(1.2, 4);
    const pieza = await prisma.woodEntryTroza.findUnique({ where: { id: t1.id }, select: { consumidaEnId: true } });
    expect(pieza?.consumidaEnId).toBe(c1.id);

    /* Reintento (doble clic, red caída): «ya vinculada», las mismas, nada nuevo. */
    const otra = await ForestVincularTrozasDB.vincularTanda(TENANT, pedido, P);
    expect(otra.corridas).toEqual([expect.objectContaining({ corridaId: c1.id, estado: "ya_vinculada", mismas: true, trozas: 1 })]);
    expect(await consumidoVigente(g.id)).toBeCloseTo(1.2, 4);

    /* La que compite por la MISMA troza: el libro la frena (T1), no se escribe. */
    const c2r = await ForestVincularTrozasDB.vincularTanda(TENANT, [{ corridaId: c2.id, trozaIds: [t1.id] }], P);
    expect(c2r.corridas[0]).toMatchObject({ estado: "bloqueada", codigo: "T1_TROZA_NO_CONSUMIBLE" });
    await nadaEscrito(c2.id);

    /* La de otro permiso con una troza del permiso A: frenada, con el permiso en la frase. */
    const libre = await troza(g.id, 1);
    const cOtroR = await ForestVincularTrozasDB.vincularTanda(TENANT, [{ corridaId: cOtro.id, trozaIds: [libre.id] }], P);
    expect(cOtroR.corridas[0]).toMatchObject({ estado: "bloqueada" });
    expect((cOtroR.corridas[0] as { mensaje: string }).mensaje).toContain(`es del permiso ${PERMISO_A}`);
    await nadaEscrito(cOtro.id);
  }, 120_000);

  it("dos pestañas con la misma tanda: la troza queda en UNA corrida y el consumo no pasa lo de la guía", async () => {
    const g = await guia(1);
    const t = await troza(g.id, 1);
    const c = await corrida(0.5, dia("15"));
    const pedido = [{ corridaId: c.id, trozaIds: [t.id] }];
    const res = await Promise.allSettled([
      ForestVincularTrozasDB.vincularTanda(TENANT, pedido, P),
      ForestVincularTrozasDB.vincularTanda(TENANT, pedido, P),
    ]);
    const estados = res.map((x) =>
      x.status === "fulfilled" ? x.value.corridas[0]!.estado : x.reason instanceof TandaEnCursoError ? "TANDA_EN_CURSO" : String(x.reason),
    );
    /* Una escribe; la otra, o llega durante (409) o después (ya vinculada). Nunca dos «vinculada». */
    expect(estados.filter((e) => e === "vinculada")).toHaveLength(1);
    expect(estados.every((e) => ["vinculada", "ya_vinculada", "TANDA_EN_CURSO"].includes(e))).toBe(true);
    expect(await consumidoVigente(g.id)).toBeLessThanOrEqual(1 + 1e-9);
    expect(await prisma.forestCtpConsumo.count({ where: { tenantId: TENANT, ctpEntryId: c.id } })).toBe(1);
  }, 120_000);

  it("con otra tanda escribiendo, la primera corrida no espera: 409 y nada escrito", async () => {
    const g = await guia(2);
    const t = await troza(g.id, 1);
    const c = await corrida(0.5, dia("16"));
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ctp-vincular-tanda:${TENANT}`}))`;
        await expect(ForestVincularTrozasDB.vincularTanda(TENANT, [{ corridaId: c.id, trozaIds: [t.id] }], P)).rejects.toBeInstanceOf(
          TandaEnCursoError,
        );
      },
      { timeout: 60_000, maxWait: 15_000 },
    );
    await nadaEscrito(c.id);
  }, 120_000);

  it("«ya_vinculada» repone el renglón `ctp_corrida_vincular` si el corte cayó entre el commit y la auditoría (y no lo duplica)", async () => {
    const g = await guia(2);
    const t = await troza(g.id, 1);
    const c = await corrida(0.5, dia("19"));
    const pedido = [{ corridaId: c.id, trozaIds: [t.id] }];
    expect((await ForestVincularTrozasDB.vincularTanda(TENANT, pedido, P)).corridas[0]).toMatchObject({ estado: "vinculada" });
    const renglones = () => prisma.activityLog.count({ where: { tenantId: TENANT, action: "ctp_corrida_vincular", entityId: c.id } });
    expect(await renglones()).toBe(1);
    /* El corte: la vinculación quedó escrita y su renglón no. */
    await prisma.activityLog.deleteMany({ where: { tenantId: TENANT, action: "ctp_corrida_vincular", entityId: c.id } });
    const reintento = await ForestVincularTrozasDB.vincularTanda(TENANT, pedido, P);
    expect(reintento.corridas[0]).toMatchObject({ estado: "ya_vinculada", mismas: true });
    expect((reintento.corridas[0] as { mensaje: string }).mensaje).toMatch(/se repuso/);
    expect(await renglones()).toBe(1);
    const detalle = await prisma.activityLog.findFirst({ where: { tenantId: TENANT, action: "ctp_corrida_vincular", entityId: c.id }, select: { detail: true } });
    expect(detalle?.detail).toMatch(/con 1 troza: .* 1 pz · 1[.,]000 m³ = 1[.,]000 m³ .*renglón repuesto/);
    /* Otro reintento ya no escribe nada. */
    await ForestVincularTrozasDB.vincularTanda(TENANT, pedido, P);
    expect(await renglones()).toBe(1);
  }, 120_000);

  it("pasado el plazo del pedido no se empieza otra corrida: las que faltan vuelven «pendiente» sin tocarse", async () => {
    const g = await guia(3);
    const [t1, t2] = [await troza(g.id, 1), await troza(g.id, 1)];
    const [a, b] = [await corrida(0.5, dia("24")), await corrida(0.5, dia("25"))];
    const r = await ForestVincularTrozasDB.vincularTanda(
      TENANT,
      [
        { corridaId: a.id, trozaIds: [t1.id] },
        { corridaId: b.id, trozaIds: [t2.id] },
      ],
      P,
      { plazoMs: 0 },
    );
    expect(r.corridas.map((x) => [x.corridaId, x.estado])).toEqual([
      [a.id, "vinculada"],
      [b.id, "pendiente"],
    ]);
    expect(r.resumen).toMatchObject({ vinculadas: 1, pendientes: 1 });
    await nadaEscrito(b.id);
  }, 120_000);

  it("otro negocio: una corrida ajena rechaza la tanda entera (404) sin escribir; una troza repetida es 400", async () => {
    const g = await guia(2);
    const t = await troza(g.id, 1);
    const c = await corrida(0.5, dia("17"));
    await expect(
      ForestVincularTrozasDB.vincularTanda("tenant-que-no-existe", [{ corridaId: c.id, trozaIds: [t.id] }], P),
    ).rejects.toMatchObject({ code: "TENANT_MISMATCH" });
    const c2 = await corrida(0.5, dia("18"));
    await expect(
      ForestVincularTrozasDB.vincularTanda(TENANT, [
        { corridaId: c.id, trozaIds: [t.id] },
        { corridaId: c2.id, trozaIds: [t.id] },
      ], P),
    ).rejects.toMatchObject({ code: "VALIDACION" });
    await nadaEscrito(c.id);
    await nadaEscrito(c2.id);
  }, 60_000);
});

describe.skipIf(!HAS_DB)("el permiso en el núcleo: `vincularCorridaEnTx` (ADR-447 §1)", () => {
  it("lote de OTRO permiso → PERMISO_DISTINTO por la puerta de Lotes, y nada escrito", async () => {
    const g = await guia(3);
    const t = await troza(g.id, 1);
    const l = await ForestLoteAserrioDB.create(TENANT, { speciesCommon: ESPECIE, code: `${P}-L${++n}`, permiso: PERMISO_A, createdBy: P });
    expect((await ForestLoteAserrioDB.agregarTrozas(TENANT, l.id, [t.id], P)).rechazadas).toEqual([]);
    const c = await corrida(0.5, dia("20"), PERMISO_B);
    const err = await ForestVincularCorridaDB.vincularCorrida(TENANT, { corridaId: c.id, partes: [{ loteId: l.id, trozaIds: [t.id] }] }, P).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(CtpInvariantError);
    expect(err).toMatchObject({ code: "PERMISO_DISTINTO" });
    expect((err as Error).message).toContain(`es del permiso ${PERMISO_A}`);
    await nadaEscrito(c.id);
    const lote = await prisma.forestLoteAserrio.findUnique({ where: { id: l.id }, select: { status: true, produccionEntryId: true } });
    expect(lote).toEqual({ status: "abierto", produccionEntryId: null });
  }, 60_000);

  it("lote «de todos los permisos» con una troza de otro: la GUÍA de la troza manda → PERMISO_DISTINTO", async () => {
    const g = await guia(3);
    const t = await troza(g.id, 1);
    const l = await ForestLoteAserrioDB.create(TENANT, { speciesCommon: ESPECIE, code: `${P}-L${++n}`, createdBy: P });
    expect((await ForestLoteAserrioDB.agregarTrozas(TENANT, l.id, [t.id], P)).rechazadas).toEqual([]);
    const c = await corrida(0.5, dia("21"), PERMISO_B);
    await expect(
      ForestVincularCorridaDB.vincularCorrida(TENANT, { corridaId: c.id, partes: [{ loteId: l.id, trozaIds: [t.id] }] }, P),
    ).rejects.toMatchObject({ code: "PERMISO_DISTINTO" });
    await nadaEscrito(c.id);
  }, 60_000);

  it("«Elegir a mano» (`sumarACorrida`) con un lote «de todos»: la troza de la guía B no entra a la corrida A", async () => {
    const gB = await guia(3, { permiso: PERMISO_B });
    const t = await troza(gB.id, 1);
    const l = await ForestLoteAserrioDB.create(TENANT, { speciesCommon: ESPECIE, code: `${P}-L${++n}`, createdBy: P });
    expect((await ForestLoteAserrioDB.agregarTrozas(TENANT, l.id, [t.id], P)).rechazadas).toEqual([]);
    const c = await corrida(0.5, dia("26"), PERMISO_A);
    const err = await ForestLoteAserrioDB.sumarACorrida(TENANT, { loteId: l.id, corridaId: c.id, trozaIds: [t.id], user: P }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(CtpInvariantError);
    expect(err).toMatchObject({ code: "PERMISO_DISTINTO" });
    expect((err as Error).message).toContain(`guía ${gB.gtfNumber}: ${PERMISO_B}`);
    await nadaEscrito(c.id);
  }, 60_000);

  it("mismo permiso (o corrida sin permiso) → vincula como siempre", async () => {
    const g = await guia(3);
    const [t1, t2] = [await troza(g.id, 1), await troza(g.id, 1)];
    const l = await ForestLoteAserrioDB.create(TENANT, { speciesCommon: ESPECIE, code: `${P}-L${++n}`, permiso: PERMISO_A, createdBy: P });
    expect((await ForestLoteAserrioDB.agregarTrozas(TENANT, l.id, [t1.id, t2.id], P)).rechazadas).toEqual([]);
    const a = await corrida(0.5, dia("22"));
    const r = await ForestVincularCorridaDB.vincularCorrida(TENANT, { corridaId: a.id, partes: [{ loteId: l.id, trozaIds: [t1.id] }] }, P);
    expect(r).toMatchObject({ piezas: 1, volumenM3: 1 });
    const sinPermiso = await corrida(0.5, dia("23"), null);
    const r2 = await ForestVincularCorridaDB.vincularCorrida(TENANT, { corridaId: sinPermiso.id, partes: [{ loteId: l.id, trozaIds: [t2.id] }] }, P);
    expect(r2).toMatchObject({ piezas: 1, volumenM3: 1 });
  }, 60_000);
});
