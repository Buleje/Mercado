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
import { ForestGtfDB, GtfDuplicateError } from "@/lib/db/forest-gtf.db";

const TENANT = "main";
const runId = Math.random().toString(36).slice(2, 8);
const P = `TEST-GTF-${runId}`;

function emitir(gtfNumber: string) {
  return ForestGtfDB.create(TENANT, { gtfNumber, items: [{ code: "x", volumeM3: 1 }], createdBy: P });
}

async function purgar() {
  await prisma.forestGtf.deleteMany({ where: { tenantId: TENANT, createdBy: { startsWith: "TEST-GTF-" } } });
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

  it("sugerirNumero deriva el siguiente correlativo del máximo de la serie", async () => {
    const serie = `${P}-S`;
    await emitir(`${serie}-000005`);
    expect(await ForestGtfDB.sugerirNumero(TENANT, serie)).toBe(`${serie}-000006`);
    // Serie sin GTF previa → arranca en 000001
    expect(await ForestGtfDB.sugerirNumero(TENANT, `${P}-NUEVA`)).toBe(`${P}-NUEVA-000001`);
  });
});
