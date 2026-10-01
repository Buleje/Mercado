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
// T7 — SP7ok autorizada en su plan; SP7bad fuera del POA (debe frenar al movilizar).
const SP7ok = `EspecieT7ok-${runId}`;
const SP7bad = `EspecieT7bad-${runId}`;

/** Alta de una línea del libro con `createdBy` de prueba, como la haría un admin. */
function crear(input: Omit<LothEntryCreateInput, "createdBy">) {
  return ForestLothDB.create(TENANT, { puedeExcederCupo: true, ...input, createdBy: P });
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
  await prisma.forestCensusTree.deleteMany({ where: { tenantId: TENANT, createdBy: { startsWith: "TEST-LOTH-" } } });
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
  }, 30_000);

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
  }, 30_000);

  it("T7 — no se moviliza una especie que no está autorizada en el plan", async () => {
    // Plan que autoriza SÓLO SP7ok. Movilizar SP7bad (fuera del POA) debe frenar.
    const plan = await prisma.forestPlan.create({
      data: { tenantId: TENANT, titularName: `${P} titular T7`, createdBy: P, estado: "vigente" },
    });
    await prisma.forestPlanSpecies.create({
      data: { tenantId: TENANT, planId: plan.id, speciesCommon: SP7ok, volumenAutorizadoM3: 100 },
    });
    // Troza de una especie NO autorizada, despachada con el plan atado → T7.
    const bad = `${P}-T7bad`;
    await crear({ section: "tala", treeCode: bad, speciesCommon: SP7bad, volumeM3: 5 });
    await crear({ section: "trozado", treeCode: bad, trozaCode: `${bad}-A`, speciesCommon: SP7bad, volumeM3: 4, planId: plan.id });
    await expect(crear({ section: "despacho_troza", trozaCode: `${bad}-A`, gtfNumber: `${P}-T7BG`, planId: plan.id }))
      .rejects.toMatchObject({ code: "T7_ESPECIE_NO_AUTORIZADA" });
    // Control: la especie autorizada SÍ se moviliza — y el match es case-insensitive
    // (el trozado va en MAYÚSCULAS y la autorización en su forma original).
    const ok = `${P}-T7ok`;
    await crear({ section: "tala", treeCode: ok, speciesCommon: SP7ok, volumeM3: 5 });
    await crear({ section: "trozado", treeCode: ok, trozaCode: `${ok}-A`, speciesCommon: SP7ok.toUpperCase(), volumeM3: 4, planId: plan.id });
    const desp = await crear({ section: "despacho_troza", trozaCode: `${ok}-A`, gtfNumber: `${P}-T7OKG`, planId: plan.id });
    expect(desp.status).toBe("registrado");
  }, 30_000);

  it("T7 — sin plan atado (código libre) NO bloquea, aunque la especie no figure", async () => {
    // Un despacho sin planId es "código libre": no se juzga contra ningún POA.
    const free = `${P}-T7free`;
    await crear({ section: "tala", treeCode: free, speciesCommon: SP7bad, volumeM3: 5 });
    await crear({ section: "trozado", treeCode: free, trozaCode: `${free}-A`, speciesCommon: SP7bad, volumeM3: 4 });
    const desp = await crear({ section: "despacho_troza", trozaCode: `${free}-A`, gtfNumber: `${P}-T7FG` });
    expect(desp.status).toBe("registrado");
  });

  it("T8 — no se tala un árbol censado por debajo del DMC de su especie", async () => {
    // Tornillo: DMC 61 cm por la RJ 458-2002-INRENA. Censamos uno de 45 cm.
    const code = `${P}-DMC`;
    await prisma.forestCensusTree.create({
      data: {
        tenantId: TENANT,
        planId: `${P}-plan-inexistente`,
        treeCode: code,
        speciesCommon: "Tornillo",
        dapM: 0.45,
        alturaComercialM: 12,
        factorForma: 0.65,
        estado: "en_pie",
        createdBy: P,
      },
    });

    await expect(crear({ section: "tala", treeCode: code, speciesCommon: "Tornillo", volumeM3: 1.2 })).rejects.toMatchObject({
      code: "T8_BAJO_DMC",
    });

    // Con justificación pasa, y el motivo queda ESCRITO en el libro.
    const ok = await crear({
      section: "tala",
      treeCode: code,
      speciesCommon: "Tornillo",
      volumeM3: 1.2,
      justificacionDmc: "Árbol caído por viento",
    });
    expect(ok.observations).toContain("Tala bajo DMC justificada");
  }, 30_000);

  it("T8 — un árbol sobre el DMC no se bloquea, y sin censo tampoco", async () => {
    const sobre = `${P}-DMC-OK`;
    await prisma.forestCensusTree.create({
      data: {
        tenantId: TENANT,
        planId: `${P}-plan-inexistente`,
        treeCode: sobre,
        speciesCommon: "Tornillo",
        dapM: 0.8, // 80 cm ≥ 61
        estado: "en_pie",
        createdBy: P,
      },
    });
    await expect(crear({ section: "tala", treeCode: sobre, speciesCommon: "Tornillo", volumeM3: 4 })).resolves.toBeTruthy();
    // Código libre (sin censo): el libro no bloquea — no hay DAP con qué juzgar.
    await expect(crear({ section: "tala", treeCode: `${P}-SIN-CENSO`, speciesCommon: "Tornillo", volumeM3: 4 })).resolves.toBeTruthy();
  }, 30_000);

  it("T9 — pasar lo CENSADO (sin autorizado) no frena: se registra y se audita como aviso", async () => {
    // Los números del Tornillo de Blas (30-09): 2 árboles, 6,2 m³ censados; talados 3,564 + 5,973.
    const SP9 = `EspecieT9-${runId}`;
    const plan = await prisma.forestPlan.create({
      data: { tenantId: TENANT, titularName: `${P} titular T9`, createdBy: P, estado: "vigente" },
    });
    for (const [code, v] of [[`${P}-T9A`, 2.9], [`${P}-T9B`, 3.3]] as const) {
      await prisma.forestCensusTree.create({
        data: { tenantId: TENANT, planId: plan.id, treeCode: code, speciesCommon: SP9, volumenEstimadoM3: v, estado: "en_pie", createdBy: P },
      });
    }
    await crear({ section: "tala", treeCode: `${P}-T9A`, speciesCommon: SP9, volumeM3: 3.564, planId: plan.id });
    const ok = await crear({ section: "tala", treeCode: `${P}-T9B`, speciesCommon: SP9, volumeM3: 5.973, planId: plan.id });
    expect(ok.status).toBe("registrado");
    expect(ok.observations ?? "").not.toContain("[Tala sobre el cupo:");
  }, 30_000);

  it("T9 — pasar lo AUTORIZADO pide motivo; con motivo se registra y queda escrito", async () => {
    const SP9a = `EspecieT9a-${runId}`;
    const plan = await prisma.forestPlan.create({
      data: { tenantId: TENANT, titularName: `${P} titular T9a`, createdBy: P, estado: "vigente" },
    });
    await prisma.forestPlanSpecies.create({ data: { tenantId: TENANT, planId: plan.id, speciesCommon: SP9a, volumenAutorizadoM3: 8 } });
    for (const [code, v] of [[`${P}-T9F`, 2.9], [`${P}-T9G`, 3.3]] as const) {
      await prisma.forestCensusTree.create({
        data: { tenantId: TENANT, planId: plan.id, treeCode: code, speciesCommon: SP9a, volumenEstimadoM3: v, estado: "en_pie", createdBy: P },
      });
    }
    await crear({ section: "tala", treeCode: `${P}-T9F`, speciesCommon: SP9a, volumeM3: 3.564, planId: plan.id });
    await expect(crear({ section: "tala", treeCode: `${P}-T9G`, speciesCommon: SP9a, volumeM3: 5.973, planId: plan.id })).rejects.toMatchObject({
      code: "T9_CUPO_ESPECIE",
      detail: { fuente: "autorizado", cupoM3: 8, taladoConEsteM3: 9.537, pctConEste: 119.2 },
    });
    // Motivo corto: sigue sin pasar (el servidor decide, no la casilla del cliente).
    await expect(
      crear({ section: "tala", treeCode: `${P}-T9G`, speciesCommon: SP9a, volumeM3: 5.973, planId: plan.id, motivoSobreCupo: "ok" }),
    ).rejects.toMatchObject({ code: "T9_CUPO_ESPECIE" });
    // Un almacenero no la asienta ni con motivo: la firma el dueño o el admin.
    await expect(
      crear({ section: "tala", treeCode: `${P}-T9G`, volumeM3: 5.973, planId: plan.id, motivoSobreCupo: "Ampliación en trámite", puedeExcederCupo: false }),
    ).rejects.toMatchObject({ code: "T9_SOLO_DUENO" });
    const ok = await crear({
      section: "tala",
      treeCode: `${P}-T9G`,
      speciesCommon: SP9a,
      volumeM3: 5.973,
      planId: plan.id,
      motivoSobreCupo: "Ampliación de volumen en trámite",
    });
    expect(ok.observations).toContain("[Tala sobre el cupo:");
    expect(ok.observations).toContain("Motivo: Ampliación de volumen en trámite");
  }, 30_000);

  it("T9 — una tala FUERA del censo no suma contra lo autorizado", async () => {
    const SP9o = `EspecieT9o-${runId}`;
    const plan = await prisma.forestPlan.create({
      data: { tenantId: TENANT, titularName: `${P} titular T9o`, createdBy: P, estado: "vigente" },
    });
    await prisma.forestPlanSpecies.create({ data: { tenantId: TENANT, planId: plan.id, speciesCommon: SP9o, volumenAutorizadoM3: 8 } });
    await prisma.forestCensusTree.create({
      data: { tenantId: TENANT, planId: plan.id, treeCode: `${P}-T9H`, speciesCommon: SP9o, volumenEstimadoM3: 5, estado: "en_pie", createdBy: P },
    });
    // 50 m³ asentados al plan con un código que el censo no tiene: no cuentan.
    await crear({ section: "tala", treeCode: `${P}-T9-FUERA`, speciesCommon: SP9o, volumeM3: 50, planId: plan.id });
    await expect(crear({ section: "tala", treeCode: `${P}-T9H`, speciesCommon: SP9o, volumeM3: 6, planId: plan.id })).resolves.toBeTruthy();
  }, 30_000);

  it("T9 — el volumen AUTORIZADO del plan manda sobre el censo", async () => {
    const SP9b = `EspecieT9b-${runId}`;
    const plan = await prisma.forestPlan.create({
      data: { tenantId: TENANT, titularName: `${P} titular T9b`, createdBy: P, estado: "vigente" },
    });
    await prisma.forestPlanSpecies.create({ data: { tenantId: TENANT, planId: plan.id, speciesCommon: SP9b, volumenAutorizadoM3: 12 } });
    await prisma.forestCensusTree.create({
      data: { tenantId: TENANT, planId: plan.id, treeCode: `${P}-T9C`, speciesCommon: SP9b, volumenEstimadoM3: 6.2, estado: "en_pie", createdBy: P },
    });
    // 9,537 > 6,2 censado, pero ≤ 12 autorizado → pasa sin motivo.
    await expect(crear({ section: "tala", treeCode: `${P}-T9C`, speciesCommon: SP9b, volumeM3: 9.537, planId: plan.id })).resolves.toBeTruthy();
  }, 30_000);

  it("T9 TOCTOU — dos talas paralelas que juntas pasan el cupo: exactamente una entra sin motivo", async () => {
    const SP9c = `EspecieT9c-${runId}`;
    const plan = await prisma.forestPlan.create({
      data: { tenantId: TENANT, titularName: `${P} titular T9c`, createdBy: P, estado: "vigente" },
    });
    // Contra lo AUTORIZADO (el único que frena).
    await prisma.forestPlanSpecies.create({ data: { tenantId: TENANT, planId: plan.id, speciesCommon: SP9c, volumenAutorizadoM3: 10 } });
    for (const code of [`${P}-T9D`, `${P}-T9E`]) {
      await prisma.forestCensusTree.create({
        data: { tenantId: TENANT, planId: plan.id, treeCode: code, speciesCommon: SP9c, volumenEstimadoM3: 5, estado: "en_pie", createdBy: P },
      });
    }
    // Autorizado 10; cada una 6 → sola entra (60 %), las dos suman 12.
    const r = await Promise.allSettled([
      crear({ section: "tala", treeCode: `${P}-T9D`, speciesCommon: SP9c, volumeM3: 6, planId: plan.id }),
      crear({ section: "tala", treeCode: `${P}-T9E`, speciesCommon: SP9c, volumeM3: 6, planId: plan.id }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const rechazo = r.find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect(rechazo.reason).toMatchObject({ code: "T9_CUPO_ESPECIE" });
  }, 30_000);

  it("T9 — dos planes vivos (Blas 30-09): cupo y talas son los del plan de la tala, nunca del tenant", async () => {
    // Plan A = el de 65 árboles: la especie censada (6,2 m³) y SIN volumen autorizado.
    // Plan B = el del «Tornillo (Cedrelinga…)» 320 m³ autorizado, con sus propios árboles.
    const SP9p = `EspecieT9p-${runId}`;
    const [planA, planB] = await Promise.all(
      ["A", "B"].map((x) =>
        prisma.forestPlan.create({ data: { tenantId: TENANT, titularName: `${P} titular T9 plan ${x}`, createdBy: P, estado: "vigente" } }),
      ),
    );
    await prisma.forestPlanSpecies.create({
      data: { tenantId: TENANT, planId: planB.id, speciesCommon: `${SP9p} (Cientifica prueba)`, volumenAutorizadoM3: 320 },
    });
    for (const [planId, code, v] of [
      [planA.id, `${P}-9pA1`, 2.9],
      [planA.id, `${P}-9pA2`, 3.3],
      [planB.id, `${P}-9pB1`, 3],
    ] as const) {
      await prisma.forestCensusTree.create({
        data: { tenantId: TENANT, planId, treeCode: code, speciesCommon: SP9p, volumenEstimadoM3: v, estado: "en_pie", createdBy: P },
      });
    }
    // B: 9,537 contra 320 autorizados (el nombre con científico empareja en el SERVIDOR) → sin motivo.
    await expect(crear({ section: "tala", treeCode: `${P}-9pB1`, speciesCommon: SP9p, volumeM3: 9.537, planId: planB.id })).resolves.toBeTruthy();
    // A: el autorizado de B no le presta cupo, y la tala de B no le gasta: 3,564 de 6,2 → pasa.
    await expect(crear({ section: "tala", treeCode: `${P}-9pA1`, speciesCommon: SP9p, volumeM3: 3.564, planId: planA.id })).resolves.toBeTruthy();
    // Sin planId en la línea (importador): el plan sale del árbol del censo → A, contra lo censado.
    await expect(crear({ section: "tala", treeCode: `${P}-9pA2`, speciesCommon: SP9p, volumeM3: 5.973 })).rejects.toMatchObject({
      code: "T9_CUPO_ESPECIE",
      // 9,537 = sólo las de A. Si mezclara planes serían 19,074 o el cupo 320.
      detail: { fuente: "censo", cupoM3: 6.2, taladoConEsteM3: 9.537 },
    });
  }, 30_000);

  it("P1 — no se registra en un mes cerrado; reabrir lo desbloquea", async () => {
    const { monthRange } = await import("@/lib/forestal/loth-cierre-types");
    const { ForestLothCierreDB } = await import("@/lib/db/forest-loth-cierre.db");
    const { PlatformSettingsDB } = await import("@/lib/db/platform-settings.db");
    const KEY = `loth-cierre:${TENANT}`;
    const prev: unknown = await PlatformSettingsDB.get(KEY);
    try {
      // Enero 2099 — mes sin datos reales, así un cierre filtrado es inofensivo.
      const { from, to, periodKey, label } = monthRange(2099, 0);
      await ForestLothCierreDB.save(
        TENANT,
        { periodKey, from: from.toISOString(), to: to.toISOString(), label, closedAt: new Date().toISOString(), closedBy: P, totales: { lineasCount: 0, taladoM3: 0, trozadoM3: 0 } },
        P,
      );
      await expect(crear({ section: "tala", treeCode: `${P}-P1`, speciesCommon: SP, volumeM3: 3, entryDate: new Date(2099, 0, 15) }))
        .rejects.toMatchObject({ code: "PERIODO_CERRADO" });
      // Reabrir → el mismo mes vuelve a admitir registro.
      await ForestLothCierreDB.reabrir(TENANT, periodKey, "test de reapertura", P);
      await expect(crear({ section: "tala", treeCode: `${P}-P1b`, speciesCommon: SP, volumeM3: 3, entryDate: new Date(2099, 0, 16) }))
        .resolves.toBeTruthy();
    } finally {
      await PlatformSettingsDB.set(KEY, prev ?? [], P);
    }
  }, 40_000);

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
