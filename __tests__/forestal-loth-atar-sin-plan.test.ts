/**
 * Libro TH · atar las líneas sin permiso (ADR-459, 02-10-2026) — REAL DB.
 *
 * Una línea sin plan cuenta en el saldo de TODOS los permisos. `atarSinPlan`
 * la ata: la tala al permiso elegido, el trozado y el despacho al de su fuente.
 * Corre en un negocio SINTÉTICO (`test-atar-<runId>`, sin FK): atar es «todo lo
 * sin plan del negocio», y en `main` se llevaría las líneas de otras suites que
 * corren en paralelo. Todo lleva `createdBy` TEST-LOTH-* y se purga por patrón.
 *
 *   node --env-file=.env.local node_modules/.bin/vitest run __tests__/forestal-loth-atar-sin-plan.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

process.env.AUDIT_CHAIN_ENABLED ??= "false";

import { prisma } from "@/lib/prisma";
import { ForestLothDB, LothInvariantError, type LothEntryCreateInput } from "@/lib/db/forest-loth.db";
import { ForestLothCierreDB } from "@/lib/db/forest-loth-cierre.db";
import { monthRange } from "@/lib/forestal/loth-cierre-types";

const runId = Math.random().toString(36).slice(2, 8);
const TENANT = `test-atar-${runId}`;
const OTRO = `test-atar-otro-${runId}`;
const P = `TEST-LOTH-ATAR-${runId}`;
const SP = `EspAtar-${runId}`;

const crear = (input: Omit<LothEntryCreateInput, "createdBy">, tenant = TENANT) =>
  ForestLothDB.create(tenant, { ...input, createdBy: P });
const plan = (nombre: string, tenant = TENANT, extra: Record<string, unknown> = {}) =>
  prisma.forestPlan.create({ data: { tenantId: tenant, titularName: `${P} ${nombre}`, planNumber: `PO-${nombre}`, createdBy: P, estado: "vigente", ...extra } });
const planDe = async (id: string) => (await prisma.forestLothEntry.findUniqueOrThrow({ where: { id }, select: { planId: true } })).planId;

async function purgar() {
  for (const t of [TENANT, OTRO]) {
    const ps = await prisma.forestPlan.findMany({ where: { tenantId: t }, select: { id: true } });
    if (ps.length) await prisma.forestPlanSpecies.deleteMany({ where: { planId: { in: ps.map((p) => p.id) } } });
    await prisma.forestLothEntry.deleteMany({ where: { tenantId: t } });
    await prisma.forestPlan.deleteMany({ where: { tenantId: t } });
    await prisma.activityLog.deleteMany({ where: { tenantId: t } });
    await prisma.platformSetting.deleteMany({ where: { key: `loth-cierre:${t}` } });
  }
}

const HAS_DB: boolean = await prisma
  .$queryRaw`SELECT 1`
  .then(() => prisma.forestLothEntry.count({ where: { tenantId: TENANT } }))
  .then(() => true)
  .catch(() => false);

beforeAll(async () => { if (HAS_DB) await purgar(); });
afterAll(async () => { if (HAS_DB) { await purgar(); await prisma.$disconnect(); } });

describe.skipIf(!HAS_DB)("ForestLothDB.atarSinPlan (DB real)", () => {
  it("la tala toma el elegido; trozado y despacho siguen a su fuente; sin fuente, el elegido", async () => {
    const [elegido, otro] = await Promise.all([plan("A1"), plan("B1")]);
    // Tala SIN plan → su trozado y su despacho (sin plan) deben ir al elegido.
    const t1 = `${P}-1`;
    const tala1 = await crear({ section: "tala", treeCode: t1, speciesCommon: SP, volumeM3: 5 });
    const troz1 = await crear({ section: "trozado", treeCode: t1, trozaCode: `${t1}-A`, speciesCommon: SP, volumeM3: 4 });
    const desp1 = await crear({ section: "despacho_troza", trozaCode: `${t1}-A`, gtfNumber: `${P}-G1` });
    // Tala YA del otro plan + su trozado sin plan (importador viejo): hereda el de su tala, no el elegido.
    const t2 = `${P}-2`;
    await crear({ section: "tala", treeCode: t2, speciesCommon: SP, volumeM3: 5, planId: otro.id });
    const troz2 = await prisma.forestLothEntry.create({
      data: { tenantId: TENANT, section: "trozado", lineNo: 99, treeCode: t2, trozaCode: `${t2}-A`, speciesCommon: SP, volumeM3: 3, planId: null, createdBy: P, status: "registrado" },
    });
    // Trozado sin tala en el libro → el elegido.
    const huerfano = await crear({ section: "trozado", treeCode: `${P}-X`, trozaCode: `${P}-X-A`, speciesCommon: SP, volumeM3: 1 });

    const vista = await ForestLothDB.atarSinPlan(TENANT, elegido.id, P, { simular: true });
    expect(vista.simulado).toBe(true);
    expect(vista.total).toBe(5);
    expect(vista.atadas).toBe(5);
    expect(await planDe(tala1.id)).toBeNull(); // simular no escribe
    const tr = vista.porSeccion.find((s) => s.section === "trozado");
    expect(tr?.porPlan).toEqual(expect.arrayContaining([
      { planId: elegido.id, n: 2, heredado: 0 },
      { planId: otro.id, n: 1, heredado: 1 },
    ]));

    const r = await ForestLothDB.atarSinPlan(TENANT, elegido.id, P);
    expect(r.simulado).toBe(false);
    expect(r.atadas).toBe(5);
    expect(await planDe(tala1.id)).toBe(elegido.id);
    expect(await planDe(troz1.id)).toBe(elegido.id);
    expect(await planDe(desp1.id)).toBe(elegido.id);
    expect(await planDe(troz2.id)).toBe(otro.id);
    expect(await planDe(huerfano.id)).toBe(elegido.id);

    // Idempotente: lo atado no vuelve a contar.
    const otra = await ForestLothDB.atarSinPlan(TENANT, elegido.id, P);
    expect(otra.total).toBe(0);
    expect(otra.atadas).toBe(0);
    expect((await ForestLothDB.conteoAtarSinPlan(TENANT)).total).toBe(0);

    // Auditoría con antes/después (fire-and-forget: se espera a que caiga).
    let log: { detail: string | null } | null = null;
    for (let i = 0; i < 20 && !log; i++) {
      log = await prisma.activityLog.findFirst({ where: { tenantId: TENANT, action: "loth_linea_atar_plan" }, select: { detail: true } });
      if (!log) await new Promise((res) => setTimeout(res, 150));
    }
    expect(log?.detail).toContain("antes: sin plan");
    expect(log?.detail).toContain(elegido.id);
  });

  it("no toca anuladas, ni líneas de otro negocio; plan ajeno o de baja → PLAN_NO_EXISTE", async () => {
    const mio = await plan("A2");
    const ajeno = await plan("Z2", OTRO);
    const baja = await plan("D2", TENANT, { deletedAt: new Date() });
    const anulada = await crear({ section: "tala", treeCode: `${P}-AN`, speciesCommon: SP, volumeM3: 1 });
    await prisma.forestLothEntry.update({ where: { id: anulada.id }, data: { status: "anulado" } });
    const deOtro = await crear({ section: "tala", treeCode: `${P}-OT`, speciesCommon: SP, volumeM3: 1 }, OTRO);

    for (const id of [ajeno.id, baja.id, "no-existe"]) {
      await expect(ForestLothDB.atarSinPlan(TENANT, id, P)).rejects.toMatchObject({ code: "PLAN_NO_EXISTE" });
      await expect(ForestLothDB.atarSinPlan(TENANT, id, P)).rejects.toBeInstanceOf(LothInvariantError);
    }
    await ForestLothDB.atarSinPlan(TENANT, mio.id, P);
    expect(await planDe(anulada.id)).toBeNull();
    expect(await planDe(deOtro.id)).toBeNull();
  });

  it("un mes cerrado no se toca: se cuenta aparte y se nombra", async () => {
    const mio = await plan("A3");
    const julio = new Date(Date.UTC(2026, 6, 15, 12));
    const hoy = new Date();
    const cerrada = await crear({ section: "tala", treeCode: `${P}-CE`, speciesCommon: SP, volumeM3: 1, entryDate: julio });
    const abierta = await crear({ section: "tala", treeCode: `${P}-AB`, speciesCommon: SP, volumeM3: 1, entryDate: hoy });
    const { from, to, periodKey, label } = monthRange(2026, 6);
    await ForestLothCierreDB.save(TENANT, {
      periodKey, from: from.toISOString(), to: to.toISOString(), label,
      closedAt: new Date().toISOString(), closedBy: P, totales: { lineasCount: 1, taladoM3: 1, trozadoM3: 0 },
    }, P);

    expect(await ForestLothDB.conteoAtarSinPlan(TENANT)).toEqual({ total: 2, cerradas: 1 });
    const r = await ForestLothDB.atarSinPlan(TENANT, mio.id, P);
    expect(r.atadas).toBe(1);
    expect(r.cerradas).toEqual({ n: 1, periodos: [label] });
    expect(await planDe(cerrada.id)).toBeNull();
    expect(await planDe(abierta.id)).toBe(mio.id);
  });

  it("avisa (no bloquea) las líneas con especie fuera del registro del plan", async () => {
    const mio = await plan("A4");
    await prisma.forestPlanSpecies.create({ data: { tenantId: TENANT, planId: mio.id, speciesCommon: `Otra-${runId}`, volumenAutorizadoM3: 50 } });
    const t = `${P}-FR`;
    await crear({ section: "tala", treeCode: t, speciesCommon: SP, volumeM3: 2 });
    await crear({ section: "trozado", treeCode: t, trozaCode: `${t}-A`, speciesCommon: SP, volumeM3: 2 });
    await crear({ section: "despacho_troza", trozaCode: `${t}-A`, gtfNumber: `${P}-GFR` });
    const r = await ForestLothDB.atarSinPlan(TENANT, mio.id, P);
    expect(r.atadas).toBe(3);
    // La tala sólo se juzga en plantación (como T7); el despacho sí, en todo plan.
    expect(r.fueraDelRegistro).toEqual({ n: 1, especies: [SP] });
  });

  it("dos atados a la vez no se pisan: la suma atada es el total, una sola vez", async () => {
    const [a, b] = await Promise.all([plan("A5"), plan("B5")]);
    for (let i = 0; i < 6; i++) await crear({ section: "tala", treeCode: `${P}-R${i}`, speciesCommon: SP, volumeM3: 1 });
    const rs = await Promise.allSettled([ForestLothDB.atarSinPlan(TENANT, a.id, P), ForestLothDB.atarSinPlan(TENANT, b.id, P)]);
    const atadas = rs.reduce((n, x) => n + (x.status === "fulfilled" ? x.value.atadas : 0), 0);
    expect(atadas).toBe(6);
    const filas = await prisma.forestLothEntry.findMany({ where: { tenantId: TENANT, treeCode: { startsWith: `${P}-R` } }, select: { planId: true } });
    expect(filas.every((f) => f.planId === a.id || f.planId === b.id)).toBe(true);
    expect(filas).toHaveLength(6);
  });
});
