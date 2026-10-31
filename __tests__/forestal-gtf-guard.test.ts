/**
 * ForestGtfDB · guard de unicidad + sugerencia de correlativo — REAL DB (R6).
 *
 * Una GTF no se anota dos veces (integridad de la cadena de custodia: un
 * fiscalizador que ve el mismo N° repetido no puede cruzar el documento). El
 * guard se serializa con pg_advisory_xact_lock, así que dos emisiones
 * concurrentes del MISMO número nuevo tampoco lo duplican.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

process.env.AUDIT_CHAIN_ENABLED ??= "false";

import { prisma } from "@/lib/prisma";
import { ForestGtfDB, GtfDuplicateError, GtfSpeciesNotAuthorizedError } from "@/lib/db/forest-gtf.db";

const TENANT = "main";
const runId = Math.random().toString(36).slice(2, 8);
const P = `TEST-GTF-${runId}`;

function emitir(gtfNumber: string) {
  return ForestGtfDB.create(TENANT, { gtfNumber, items: [{ code: "x", volumeM3: 1 }], createdBy: P });
}

async function purgar() {
  await prisma.forestGtf.deleteMany({ where: { tenantId: TENANT, createdBy: { startsWith: "TEST-GTF-" } } });
  const testPlans = await prisma.forestPlan.findMany({
    where: { tenantId: TENANT, createdBy: { startsWith: "TEST-GTF-" } },
    select: { id: true },
  });
  if (testPlans.length > 0) {
    await prisma.forestPlanSpecies.deleteMany({ where: { planId: { in: testPlans.map((p) => p.id) } } });
  }
  await prisma.forestPlan.deleteMany({ where: { tenantId: TENANT, createdBy: { startsWith: "TEST-GTF-" } } });
  await prisma.activityLog.deleteMany({ where: { tenantId: TENANT, user: { startsWith: "TEST-GTF-" } } });
}

const HAS_DB: boolean = await prisma
  .$queryRaw`SELECT 1`
  .then(() => prisma.forestGtf.count({ where: { tenantId: TENANT } }))
  .then(() => true)
  .catch(() => false);

beforeAll(async () => { if (HAS_DB) await purgar(); }, 30_000);
afterAll(async () => { if (HAS_DB) { try { await purgar(); } catch (e) { console.error("cleanup gtf", e); } } }, 30_000);

describe.skipIf(!HAS_DB)("ForestGtfDB · unicidad de GTF (R6)", () => {
  it("no se anota dos veces la misma GTF", async () => {
    const n = `${P}-100`;
    await emitir(n);
    await expect(emitir(n)).rejects.toBeInstanceOf(GtfDuplicateError);
  });

  it("dos emisiones concurrentes del mismo número: exactamente una pasa", async () => {
    const n = `${P}-200`;
    const res = await Promise.allSettled([emitir(n), emitir(n)]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(res.filter((r) => r.status === "rejected")).toHaveLength(1);
  });

  it("no se emite una GTF con una especie fuera del plan de manejo", async () => {
    const plan = await prisma.forestPlan.create({
      data: { tenantId: TENANT, titularName: `${P} titular`, createdBy: P, estado: "vigente" },
    });
    await prisma.forestPlanSpecies.create({
      data: { tenantId: TENANT, planId: plan.id, speciesCommon: `Autorizada-${runId}`, volumenAutorizadoM3: 100 },
    });
    // Especie NO autorizada en la guía → bloqueo.
    await expect(ForestGtfDB.create(TENANT, {
      gtfNumber: `${P}-SP1`, planId: plan.id, createdBy: P,
      items: [{ code: "z1", species: `Prohibida-${runId}`, volumeM3: 2 }],
    })).rejects.toBeInstanceOf(GtfSpeciesNotAuthorizedError);
    // La especie autorizada pasa — match case-insensitive.
    const ok = await ForestGtfDB.create(TENANT, {
      gtfNumber: `${P}-SP2`, planId: plan.id, createdBy: P,
      items: [{ code: "z2", species: `AUTORIZADA-${runId}`, volumeM3: 2 }],
    });
    expect(ok.gtfNumber).toBe(`${P}-SP2`);
  });

  it("sin plan atado, la GTF con cualquier especie NO se bloquea", async () => {
    const ok = await ForestGtfDB.create(TENANT, {
      gtfNumber: `${P}-FREE`, createdBy: P,
      items: [{ code: "z3", species: `Cualquiera-${runId}`, volumeM3: 1 }],
    });
    expect(ok.gtfNumber).toBe(`${P}-FREE`);
  });

  it("sugerirNumero deriva el siguiente correlativo del máximo de la serie", async () => {
    const serie = `${P}-S`;
    await emitir(`${serie}-000005`);
    expect(await ForestGtfDB.sugerirNumero(TENANT, serie)).toBe(`${serie}-000006`);
    // Serie sin GTF previa → arranca en 000001
    expect(await ForestGtfDB.sugerirNumero(TENANT, `${P}-NUEVA`)).toBe(`${P}-NUEVA-000001`);
  });
});
