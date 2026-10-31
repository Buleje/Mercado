/**
 * El acta del conteo del patio nunca vuelve atrás — REAL DB integration
 * (revisión 2026-09-26).
 *
 * La tablet puede subir desde su cola una versión VIEJA del acta después de la
 * nueva (v1 quedó encolada, «Seguir contando» + terminar subió v2 directo, y
 * después la cola sube v1). El servidor no la deja pisar: un `terminadoEn`
 * anterior al guardado —o uno sin terminar contra uno terminado— responde el
 * acta vigente con `obsoleta: true`. Contra la base real porque la condición
 * vive en el UPDATE.
 *
 * Tenant `main` (el de QA). Todo lo creado lleva `TEST-ACTA-` y se purga antes y
 * después. Para correr:
 *   node --env-file=.env.local node_modules/.bin/vitest run __tests__/forestal-conteo-acta-no-pisa-db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.AUDIT_CHAIN_ENABLED ??= "false";

import { prisma } from "@/lib/prisma";
import { ForestPatioConteoDB } from "@/lib/db/forest-patio-conteo.db";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { aTrozaDelConteo, anotarTroza, nuevoConteo } from "@/lib/forestal/conteo-patio";

const TENANT = "main";
const P = `TEST-ACTA-${Math.random().toString(36).slice(2, 8)}`;

async function purgar() {
  await prisma.forestPatioConteo.deleteMany({ where: { tenantId: TENANT, hechoPor: { startsWith: "TEST-ACTA-" } } });
  await prisma.activityLog.deleteMany({ where: { tenantId: TENANT, user: { startsWith: "TEST-ACTA-" } } });
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
  if (!HAS_DB) return;
  await purgar();
  const quedan = await prisma.forestPatioConteo.count({ where: { tenantId: TENANT, hechoPor: { startsWith: "TEST-ACTA-" } } });
  expect(quedan).toBe(0);
}, 30_000);

describe.skipIf(!HAS_DB)("ForestPatioConteoDB.guardar — un acta vieja no pisa a la nueva (base real)", () => {
  const pieza = (id: string): TrozaConsumible => ({
    id,
    woodEntryId: "we",
    codificacion: id,
    codigoPlanta: id,
    especieComun: "Tornillo",
    volumenM3: 1.5,
    gtfNumber: "G-1",
  });

  it("v2 guardada; v1 (terminada antes) y una sin terminar llegan después y NO la pisan; v3 sí", async () => {
    const patio = [pieza(`${P}-1`), pieza(`${P}-2`)].map(aTrozaDelConteo);
    const iniciadoEn = new Date(Date.parse("2026-09-26T14:00:00.000Z") + Math.floor(Math.random() * 1e6)).toISOString();
    const base = nuevoConteo({ fecha: "2026-09-26", quien: `${P}-Juan`, trozas: patio, ahora: iniciadoEn });
    const unaLeida = anotarTroza(base, patio[0]!, iniciadoEn);
    const dosLeidas = anotarTroza(unaLeida, patio[1]!, iniciadoEn);
    const T1 = "2026-09-26T15:00:00.000Z";
    const T2 = "2026-09-26T15:10:00.000Z";
    const T3 = "2026-09-26T15:20:00.000Z";

    const v2 = await ForestPatioConteoDB.guardar(TENANT, { conteo: { ...dosLeidas, terminadoEn: T2 } }, `${P}-user`);
    expect(v2).toMatchObject({ creada: true, obsoleta: false });
    expect(v2.acta).toMatchObject({ contadas: 2, terminadoEn: T2 });

    const v1 = await ForestPatioConteoDB.guardar(TENANT, { conteo: { ...unaLeida, terminadoEn: T1 } }, `${P}-user`);
    expect(v1).toMatchObject({ creada: false, obsoleta: true });
    expect(v1.acta).toMatchObject({ id: v2.acta.id, contadas: 2, terminadoEn: T2 });

    const abierta = await ForestPatioConteoDB.guardar(TENANT, { conteo: { ...unaLeida, terminadoEn: null } }, `${P}-user`);
    expect(abierta).toMatchObject({ obsoleta: true });
    expect(abierta.acta).toMatchObject({ contadas: 2, terminadoEn: T2 });

    const v3 = await ForestPatioConteoDB.guardar(
      TENANT,
      { conteo: { ...unaLeida, terminadoEn: T3 }, notas: "se recontó" },
      `${P}-user`,
    );
    expect(v3).toMatchObject({ creada: false, obsoleta: false });
    expect(v3.acta).toMatchObject({ id: v2.acta.id, contadas: 1, terminadoEn: T3, notas: "se recontó" });

    /* El mismo envío dos veces (doble toque) sigue siendo idempotente, no «obsoleto». */
    const otraVez = await ForestPatioConteoDB.guardar(TENANT, { conteo: { ...unaLeida, terminadoEn: T3 } }, `${P}-user`);
    expect(otraVez).toMatchObject({ obsoleta: false });

    const fila = await prisma.forestPatioConteo.findFirst({ where: { tenantId: TENANT, iniciadoEn: new Date(iniciadoEn) } });
    expect(fila?.terminadoEn?.toISOString()).toBe(T3);
    expect(await prisma.forestPatioConteo.count({ where: { tenantId: TENANT, iniciadoEn: new Date(iniciadoEn) } })).toBe(1);
  }, 60_000);
});
