/**
 * Medidas de troza (Oxapampa + D1/D2 en planta) y actas del conteo del patio —
 * REAL DB integration (Brandon 2026-09-26).
 *
 * Contra la base real porque lo que importa acá lo decide Postgres: que el
 * `COALESCE` del UPDATE no pise el centímetro de SERFOR, que el pt quede
 * congelado en `Decimal(12,2)`, que un id de otro negocio no escriba y que el
 * índice único `(tenantId, iniciadoEn)` vuelva idempotente el guardado del acta.
 *
 * Tenant `main` (el de QA). Todo lo creado lleva `TEST-OXA-` y se purga antes y
 * después. Para correr:
 *   node --env-file=.env.local node_modules/.bin/vitest run __tests__/forestal-medidas-conteo-db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.AUDIT_CHAIN_ENABLED ??= "false";

import { prisma } from "@/lib/prisma";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { ForestCtpCierreDB } from "@/lib/db/forest-ctp-cierre.db";
import { ForestPatioConteoDB } from "@/lib/db/forest-patio-conteo.db";
import type { CtpCierrePeriodo } from "@/lib/forestal/ctp-cierre-types";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { aTrozaDelConteo, anotarDesconocido, anotarTroza, nuevoConteo } from "@/lib/forestal/conteo-patio";

const TENANT = "main";
const runId = Math.random().toString(36).slice(2, 8);
const P = `TEST-OXA-${runId}`;

async function purgar() {
  /* Las trozas caen en cascada con su ingreso. */
  await prisma.woodEntry.deleteMany({ where: { tenantId: TENANT, gtfNumber: { startsWith: "TEST-OXA-" } } });
  await prisma.forestPatioConteo.deleteMany({ where: { tenantId: TENANT, hechoPor: { startsWith: "TEST-OXA-" } } });
  await prisma.activityLog.deleteMany({ where: { tenantId: TENANT, user: { startsWith: "TEST-OXA-" } } });
}

/* Top-level await (NO beforeAll): `skipIf` se evalúa al coleccionar. */
const HAS_DB: boolean = await prisma
  .$queryRaw`SELECT 1`
  .then(() => prisma.forestPatioConteo.count({ where: { tenantId: TENANT } }))
  .then(() => true)
  .catch(() => false);

beforeAll(async () => {
  if (HAS_DB) await purgar();
}, 30_000);

afterAll(async () => {
  vi.restoreAllMocks();
  if (!HAS_DB) return;
  try {
    await purgar();
  } catch (err) {
    console.error("\n🔴 LA LIMPIEZA FALLÓ — quedan datos TEST-OXA- en main. Corré de nuevo el test.\n", err);
    throw err;
  }
}, 30_000);

/** Una guía de dos trozas: una SIN D1/D2 (como 77 de 84 en Blas) y una con los de SERFOR. */
async function guiaDePrueba(entryDate?: Date) {
  const w = await WoodEntriesDB.create(TENANT, {
    ...(entryDate ? { entryDate } : {}),
    gtfNumber: `${P}-${Math.random().toString(36).slice(2, 6)}`,
    providerName: `${P} proveedor`,
    speciesCommonName: "Tornillo",
    volumeM3: 5,
    createdBy: P,
    trozas: [
      { orden: 1, codificacion: `${P}-A`, especieComun: "Tornillo", especieCientifica: null, dimensiones: null, largoM: 6.53, diametroCm: null, d1Cm: null, d2Cm: null, cantidad: 1, volumenM3: 2.808 },
      { orden: 2, codificacion: `${P}-B`, especieComun: "Tornillo", especieCientifica: null, dimensiones: null, largoM: 5, diametroCm: 65.5, d1Cm: 73, d2Cm: 58, cantidad: 1, volumenM3: 2.192 },
    ],
  });
  const trozas = await prisma.woodEntryTroza.findMany({
    where: { tenantId: TENANT, woodEntryId: w.id },
    orderBy: { orden: "asc" },
    select: { id: true },
  });
  return { entryId: w.id, sinCm: trozas[0].id, conCm: trozas[1].id };
}

const leer = (id: string) => prisma.woodEntryTroza.findFirstOrThrow({ where: { tenantId: TENANT, id } });

describe.skipIf(!HAS_DB)("WoodEntriesDB.guardarMedidasTrozas (base real)", () => {
  it("guarda Oxapampa, el SERVIDOR calcula y congela el pt; no toca volumenM3", async () => {
    const g = await guiaDePrueba();
    const r = await WoodEntriesDB.guardarMedidasTrozas(
      TENANT,
      [{ id: g.sinCm, oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12 }],
      `${P}-user`,
    );
    expect(r.rechazadas).toEqual([]);
    expect(r.trozas).toHaveLength(1);
    expect(r.trozas[0]).toMatchObject({ oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12, oxPt: 195.92, oxMedidoPor: `${P}-user` });
    expect(typeof r.trozas[0].oxMedidoEn).toBe("string");

    const t = await leer(g.sinCm);
    expect(Number(t.oxPt)).toBe(195.92);
    expect(Number(t.volumenM3)).toBe(2.808);
  }, 30_000);

  it("D1/D2 en cm: llena el vacío y marca planta; al de SERFOR no lo pisa", async () => {
    const g = await guiaDePrueba();
    const r = await WoodEntriesDB.guardarMedidasTrozas(
      TENANT,
      [
        { id: g.sinCm, d1Cm: 60, d2Cm: 55 },
        { id: g.conCm, d1Cm: 37, d2Cm: 58 },
      ],
      `${P}-user`,
    );
    const sin = await leer(g.sinCm);
    expect(Number(sin.d1Cm)).toBe(60);
    expect(Number(sin.d2Cm)).toBe(55);
    expect(Number(sin.diametroCm)).toBe(57.5);
    expect(sin.d1d2MedidoEnPlanta).toBe(true);

    const con = await leer(g.conCm);
    expect(Number(con.d1Cm)).toBe(73);
    expect(con.d1d2MedidoEnPlanta).toBe(false);
    expect(r.rechazadas).toEqual([{ id: g.conCm, motivo: "D1 ya tiene 73 cm cargado: no se pisa." }]);
  }, 30_000);

  it("mes cerrado: frena los cm (del libro) pero NO la Oxapampa (comercial)", async () => {
    const g = await guiaDePrueba();
    /* Los cierres se leen UNA vez con `list` y se miran pieza por pieza con la
       función pura (antes se memorizaba por mes UTC: revisión 26-09). */
    const cerrado = {
      periodKey: "todo",
      label: "septiembre de 2026",
      from: "2000-01-01T00:00:00.000Z",
      to: "2100-01-01T00:00:00.000Z",
    } as CtpCierrePeriodo;
    const spy = vi.spyOn(ForestCtpCierreDB, "list").mockResolvedValue([cerrado]);
    try {
      const r = await WoodEntriesDB.guardarMedidasTrozas(
        TENANT,
        [{ id: g.sinCm, d1Cm: 60, d2Cm: 55, oxD1Pulg: 20, oxD2Pulg: 20, oxLargoPies: 12 }],
        `${P}-user`,
      );
      expect(r.trozas[0].oxPt).toBe(195.92);
      expect(r.rechazadas.map((x) => x.motivo).join(" ")).toContain("septiembre de 2026");
      const t = await leer(g.sinCm);
      expect(t.d1Cm).toBeNull();
      expect(t.d1d2MedidoEnPlanta).toBe(false);
    } finally {
      spy.mockRestore();
    }
  }, 30_000);

  it("el cierre se mira por GUÍA, no por mes UTC: agosto cerrado frena la del 01-09 (31-08 en Lima) y no la del 15-09, en cualquier orden", async () => {
    /* Agosto cerrado en hora de Lima, como lo guarda el cierre. Las guías se
       guardan a 00:00Z: la del 01-09 es el 31-08 a las 19:00 en Pucallpa. */
    const agosto = {
      periodKey: "2026-08",
      label: "agosto de 2026",
      from: "2026-08-01T05:00:00.000Z",
      to: "2026-09-01T04:59:59.999Z",
    } as CtpCierrePeriodo;
    /* Las guías se crean ANTES de simular el cierre: el alta también lo mira. */
    const guias = [];
    for (let i = 0; i < 2; i++) {
      guias.push({
        g1: await guiaDePrueba(new Date("2026-09-01T00:00:00.000Z")),
        g15: await guiaDePrueba(new Date("2026-09-15T00:00:00.000Z")),
      });
    }
    const spy = vi.spyOn(ForestCtpCierreDB, "list").mockResolvedValue([agosto]);
    try {
      for (const [i, orden] of (["primero-el-1", "primero-el-15"] as const).entries()) {
        const { g1, g15 } = guias[i]!;
        const pedido = [
          { id: g1.sinCm, d1Cm: 60, d2Cm: 55 },
          { id: g15.sinCm, d1Cm: 61, d2Cm: 56 },
        ];
        const r = await WoodEntriesDB.guardarMedidasTrozas(
          TENANT,
          orden === "primero-el-1" ? pedido : [...pedido].reverse(),
          `${P}-user`,
        );
        /* Un rechazo por D1 y otro por D2, los dos de la guía del 01-09. */
        const rechazos = r.rechazadas.map((x) => `${x.id === g1.sinCm ? "g1" : "g15"}: ${x.motivo}`);
        expect(rechazos.length, orden).toBeGreaterThan(0);
        for (const x of rechazos) expect(x, orden).toMatch(/^g1: .*agosto de 2026/);
        expect((await leer(g1.sinCm)).d1Cm, orden).toBeNull();
        expect(Number((await leer(g15.sinCm)).d1Cm), orden).toBe(61);
      }
    } finally {
      spy.mockRestore();
    }
  }, 60_000);

  it("un id de este negocio pedido desde OTRO tenant no escribe nada", async () => {
    const g = await guiaDePrueba();
    const r = await WoodEntriesDB.guardarMedidasTrozas(
      "tenant-que-no-existe",
      [{ id: g.sinCm, oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12, d1Cm: 60 }],
      `${P}-user`,
    );
    expect(r.trozas).toEqual([]);
    expect(r.rechazadas).toEqual([{ id: g.sinCm, motivo: "No existe en este negocio." }]);
    const t = await leer(g.sinCm);
    expect(t.oxPt).toBeNull();
    expect(t.d1Cm).toBeNull();
  }, 30_000);

  it("borrar las tres medidas borra el pt, cuándo y quién", async () => {
    const g = await guiaDePrueba();
    await WoodEntriesDB.guardarMedidasTrozas(TENANT, [{ id: g.sinCm, oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12 }], `${P}-user`);
    await WoodEntriesDB.guardarMedidasTrozas(
      TENANT,
      [{ id: g.sinCm, oxD1Pulg: null, oxD2Pulg: null, oxLargoPies: null }],
      `${P}-user`,
    );
    const t = await leer(g.sinCm);
    expect([t.oxPt, t.oxMedidoEn, t.oxMedidoPor]).toEqual([null, null, null]);
  }, 30_000);
});

describe.skipIf(!HAS_DB)("ForestPatioConteoDB (base real)", () => {
  const T0 = "2026-09-26T15:00:00.000Z";
  const pieza = (id: string, extra: Partial<TrozaConsumible> = {}): TrozaConsumible => ({
    id,
    woodEntryId: "we",
    codificacion: id,
    codigoPlanta: id,
    especieComun: "Tornillo",
    volumenM3: 1.5,
    gtfNumber: "G-1",
    ...extra,
  });

  it("guarda el acta, la lista y la trae entera; el mismo conteo otra vez ACTUALIZA, no duplica", async () => {
    const patio = [pieza(`${P}-1`), pieza(`${P}-2`), pieza(`${P}-3`, { consumidaEnId: "x" })].map(aTrozaDelConteo);
    const iniciadoEn = new Date(Date.parse(T0) + Math.floor(Math.random() * 1e6)).toISOString();
    let c = nuevoConteo({ fecha: "2026-09-26", quien: `${P}-Juan`, trozas: patio, ahora: iniciadoEn });
    c = anotarTroza(c, patio[0], T0);

    const a = await ForestPatioConteoDB.guardar(TENANT, { conteo: c }, `${P}-user`);
    expect(a.creada).toBe(true);
    expect(a.acta).toMatchObject({ esperadas: 2, contadas: 1, faltan: 1, sobrantes: 0, sorpresas: 0, hechoPor: `${P}-Juan` });

    c = anotarTroza(c, patio[2], T0);
    c = anotarDesconocido(c, "ZZ-1", T0);
    const b = await ForestPatioConteoDB.guardar(TENANT, { conteo: { ...c, terminadoEn: T0 }, notas: "lluvia" }, `${P}-user`);
    expect(b.creada).toBe(false);
    expect(b.acta.id).toBe(a.acta.id);
    expect(b.acta).toMatchObject({ faltan: 1, sobrantes: 1, sorpresas: 1, notas: "lluvia", terminadoEn: T0 });

    const filas = await prisma.forestPatioConteo.count({ where: { tenantId: TENANT, iniciadoEn: new Date(iniciadoEn) } });
    expect(filas).toBe(1);

    const hist = await ForestPatioConteoDB.listar(TENANT);
    expect(hist.find((h) => h.id === a.acta.id)).toMatchObject({ faltan: 1, sobrantes: 1, sorpresas: 1, fecha: "2026-09-26" });

    const det = await ForestPatioConteoDB.porId(TENANT, a.acta.id);
    expect(det?.faltantes.map((f) => f.codigo)).toEqual([`${P}-2`]);
    expect(det?.sobrantes[0]).toMatchObject({ trozaId: `${P}-3`, motivo: "ya_consumida" });
    expect(det?.conteo?.lecturas).toHaveLength(3);

    /* Otro negocio no la ve. */
    expect(await ForestPatioConteoDB.porId("tenant-que-no-existe", a.acta.id)).toBeNull();
  }, 30_000);
});
