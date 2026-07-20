/**
 * Libro TH · invariantes de cadena de custodia T1–T5 — REAL DB integration (ADR-305).
 *
 * ── Por qué este archivo existe ───────────────────────────────────────────
 * Estas invariantes son la diferencia entre un Libro de Operaciones y una
 * planilla: T1 impide movilizar dos veces la misma troza, que es el patrón de
 * blanqueo que fiscaliza OSINFOR (legitimar madera sin origen contra una guía
 * real). Postgres NO puede garantizarlas — son agregadas y el aislamiento de
 * Buleje es app-level, no RLS. Si `ForestLothDB.create` deja de aplicarlas, no
 * las aplica nadie, y el módulo miente en silencio.
 *
 * ── Por qué DB real y no mocks ────────────────────────────────────────────
 * Un mock prueba que el código llama al `where` correcto, no que Postgres se
 * comporte como creemos bajo Decimal, transacciones y `FOR UPDATE`. El test de
 * concurrencia de abajo es la prueba: si el lock estuviera sobre la fila que se
 * escribe y no sobre la troza disputada, dos despachos paralelos de la misma
 * troza pasarían ambos (el TOCTOU que ya se pagó en el CTP el 2026-07-15).
 *
 * Todo lo creado lleva `createdBy` con prefijo `TEST-LOTH-<runId>` y `afterAll`
 * lo borra por patrón.
 *
 * Para correr:
 *   node --env-file=.env.local node_modules/.bin/vitest run \
 *     __tests__/forestal-loth-invariantes.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

process.env.AUDIT_CHAIN_ENABLED ??= "false";

import { prisma } from "@/lib/prisma";
import { ForestLothDB, LothInvariantError, type LothEntryCreateInput } from "@/lib/db/forest-loth.db";

const TENANT = "main";
const runId = Math.random().toString(36).slice(2, 8);
const P = `TEST-LOTH-${runId}`;
// Especies únicas por corrida: T6 agrega el volumen movilizado tenant-wide POR
// ESPECIE, así que usar una especie real (SP) chocaría con los datos del
// tenant. `SP` no lo autoriza ningún plan (T6 se salta); `SP6` sí, sólo en su test.
const SP = `Especie-${runId}`;
const SP6 = `EspecieT6-${runId}`;

/** Alta de una línea del libro con `createdBy` de prueba. */
function crear(input: Omit<LothEntryCreateInput, "createdBy">) {
  return ForestLothDB.create(TENANT, { ...input, createdBy: P });
}

/** Limpieza por PATRÓN (barre basura de corridas muertas anteriores también). */
async function purgar() {
  await prisma.forestLothEntry.deleteMany({ where: { tenantId: TENANT, createdBy: { startsWith: "TEST-LOTH-" } } });
  // ForestPlanSpecies no tiene relación Prisma (solo FK planId) → borrar por los ids.
  const testPlans = await prisma.forestPlan.findMany({
    where: { tenantId: TENANT, createdBy: { startsWith: "TEST-LOTH-" } },
    select: { id: true },
  });
  if (testPlans.length > 0) {
    await prisma.forestPlanSpecies.deleteMany({ where: { planId: { in: testPlans.map((p) => p.id) } } });
  }
  await prisma.forestPlan.deleteMany({ where: { tenantId: TENANT, createdBy: { startsWith: "TEST-LOTH-" } } });
  await prisma.activityLog.deleteMany({ where: { tenantId: TENANT, user: { startsWith: "TEST-LOTH-" } } });
}

/**
 * OJO — top-level await, NO `beforeAll` (ver forestal-ctp-consumo.test.ts):
 * `describe.skipIf` evalúa en tiempo de COLECCIÓN; con HAS_DB seteado en un hook
 * el suite se saltearía SIEMPRE aun con DB arriba.
 */
const HAS_DB: boolean = await prisma
  .$queryRaw`SELECT 1`
  .then(() => prisma.forestLothEntry.count({ where: { tenantId: TENANT } }))
  .then(() => true)
  .catch(() => false);

beforeAll(async () => {
  if (!HAS_DB) return;
  await purgar();
}, 30_000);

afterAll(async () => {
  if (!HAS_DB) return;
  try {
    await purgar();
  } catch (err) {
    console.error("\n🔴 LA LIMPIEZA DE LOS TESTS LOTH FALLÓ — quedan datos TEST-LOTH- en la DB.\n", err);
  }
}, 30_000);

describe.skipIf(!HAS_DB)("LO-TH · invariantes de cadena de custodia (ADR-305)", () => {
  it("T3 — no se tala dos veces el mismo árbol", async () => {
    const tree = `${P}-A1`;
    await crear({ section: "tala", treeCode: tree, speciesCommon: SP, volumeM3: 8 });
    await expect(crear({ section: "tala", treeCode: tree, speciesCommon: SP, volumeM3: 8 }))
      .rejects.toMatchObject({ name: "LothInvariantError", code: "T3_TALA_DUPLICADA" });
  });

  it("T3 — trozaCode único en Trozado", async () => {
    const troza = `${P}-B1-A`;
    await crear({ section: "trozado", treeCode: `${P}-B1`, trozaCode: troza, speciesCommon: SP, volumeM3: 1 });
    await expect(crear({ section: "trozado", treeCode: `${P}-B1`, trozaCode: troza, speciesCommon: SP, volumeM3: 1 }))
      .rejects.toMatchObject({ code: "T3_TROZA_DUPLICADA" });
  });

  it("T4 — no se troza más de lo tumbado", async () => {
    const tree = `${P}-C1`;
    await crear({ section: "tala", treeCode: tree, speciesCommon: SP, volumeM3: 10 });
    await crear({ section: "trozado", treeCode: tree, trozaCode: `${tree}-A`, speciesCommon: SP, volumeM3: 6 });
    // 6 + 5 = 11 > 10 tumbado → rechazo
    await expect(crear({ section: "trozado", treeCode: tree, trozaCode: `${tree}-B`, speciesCommon: SP, volumeM3: 5 }))
      .rejects.toMatchObject({ code: "T4_TROZADO_SUPERA_TALA" });
    // 6 + 4 = 10 ≤ 10 → pasa (merma cero es válida)
    await expect(crear({ section: "trozado", treeCode: tree, trozaCode: `${tree}-C`, speciesCommon: SP, volumeM3: 4 }))
      .resolves.toBeTruthy();
  });

  it("T2 — no se despacha una troza que no fue trozada", async () => {
    await expect(crear({ section: "despacho_troza", trozaCode: `${P}-GHOST`, gtfNumber: `${P}-G1` }))
      .rejects.toMatchObject({ code: "T2_TROZA_SIN_TROZADO" });
  });

  it("T1 — una troza sale del bosque una sola vez (despacho, luego consumo)", async () => {
    const tree = `${P}-D1`;
    const troza = `${tree}-A`;
    await crear({ section: "tala", treeCode: tree, speciesCommon: SP, volumeM3: 5 });
    await crear({ section: "trozado", treeCode: tree, trozaCode: troza, speciesCommon: SP, volumeM3: 4 });
    await crear({ section: "despacho_troza", trozaCode: troza, gtfNumber: `${P}-D1G` });
    // Segundo despacho de la misma troza → T1
    await expect(crear({ section: "despacho_troza", trozaCode: troza, gtfNumber: `${P}-D1G2` }))
      .rejects.toMatchObject({ code: "T1_TROZA_YA_MOVILIZADA" });
    // Y consumir una troza ya despachada tampoco (sale una vez, no dos vías) → T1
    await expect(crear({ section: "consumo_troza", trozaCode: troza, speciesCommon: SP, volumeM3: 4 }))
      .rejects.toMatchObject({ code: "T1_TROZA_YA_MOVILIZADA" });
  });

  it("T5 — no se despacha más producto del producido", async () => {
    const prod = `${P}-PT1`;
    await crear({ section: "producto_terminado", productType: prod, speciesCommon: SP, quantity: 10, unit: "m3" });
    await crear({ section: "despacho_producto", productType: prod, speciesCommon: SP, quantity: 6, unit: "m3", gtfNumber: `${P}-PT1G` });
    // 6 + 5 = 11 > 10 → rechazo
    await expect(crear({ section: "despacho_producto", productType: prod, speciesCommon: SP, quantity: 5, unit: "m3", gtfNumber: `${P}-PT1G2` }))
      .rejects.toMatchObject({ code: "T5_DESPACHO_SUPERA_PRODUCCION" });
    // 6 + 4 = 10 ≤ 10 → pasa
    await expect(crear({ section: "despacho_producto", productType: prod, speciesCommon: SP, quantity: 4, unit: "m3", gtfNumber: `${P}-PT1G3` }))
      .resolves.toBeTruthy();
  });

  it("cadena feliz completa: tala → trozado → despacho pasa sin trabas", async () => {
    const tree = `${P}-E1`;
    const troza = `${tree}-A`;
    await crear({ section: "tala", treeCode: tree, speciesCommon: SP, volumeM3: 6 });
    await crear({ section: "trozado", treeCode: tree, trozaCode: troza, speciesCommon: SP, volumeM3: 5 });
    const desp = await crear({ section: "despacho_troza", trozaCode: troza, gtfNumber: `${P}-E1G` });
    expect(desp.status).toBe("registrado");
    expect(desp.lineNo).toBeGreaterThan(0);
  });

  it("T6 — no se moviliza más del volumen autorizado por el POA", async () => {
    // Plan con 10 m³ autorizados de Tornillo.
    const plan = await prisma.forestPlan.create({
      data: { tenantId: TENANT, titularName: `${P} titular`, createdBy: P, estado: "vigente" },
    });
    await prisma.forestPlanSpecies.create({
      data: { tenantId: TENANT, planId: plan.id, speciesCommon: SP6, volumenAutorizadoM3: 10 },
    });
    // Troza de 8 m³ → despacho OK (8 ≤ 10).
    const t1 = `${P}-G1`;
    await crear({ section: "tala", treeCode: t1, speciesCommon: SP6, volumeM3: 9 });
    await crear({ section: "trozado", treeCode: t1, trozaCode: `${t1}-A`, speciesCommon: SP6, volumeM3: 8, planId: plan.id });
    await crear({ section: "despacho_troza", trozaCode: `${t1}-A`, gtfNumber: `${P}-G1D`, planId: plan.id });
    // Segunda troza de 5 m³ → 8 + 5 = 13 > 10 autorizado → T6.
    const t2 = `${P}-G2`;
    await crear({ section: "tala", treeCode: t2, speciesCommon: SP6, volumeM3: 6 });
    await crear({ section: "trozado", treeCode: t2, trozaCode: `${t2}-A`, speciesCommon: SP6, volumeM3: 5, planId: plan.id });
    await expect(crear({ section: "despacho_troza", trozaCode: `${t2}-A`, gtfNumber: `${P}-G2D`, planId: plan.id }))
      .rejects.toMatchObject({ code: "T6_EXCESO_AUTORIZADO" });
  });

  it("TOCTOU — dos despachos paralelos de la misma troza: exactamente uno pasa", async () => {
    const tree = `${P}-F1`;
    const troza = `${tree}-A`;
    await crear({ section: "tala", treeCode: tree, speciesCommon: SP, volumeM3: 5 });
    await crear({ section: "trozado", treeCode: tree, trozaCode: troza, speciesCommon: SP, volumeM3: 4 });

    const results = await Promise.allSettled([
      crear({ section: "despacho_troza", trozaCode: troza, gtfNumber: `${P}-F1a` }),
      crear({ section: "despacho_troza", trozaCode: troza, gtfNumber: `${P}-F1b` }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const rej = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(rej).toHaveLength(1);
    expect(rej[0].reason).toBeInstanceOf(LothInvariantError);
    expect((rej[0].reason as LothInvariantError).code).toBe("T1_TROZA_YA_MOVILIZADA");
  });
});
