/**
 * Soltar trozas de una corrida (ADR-447 §6) contra la BASE REAL — tenant QA
 * forestal `inversiones-agroforestales-blas-sociedad-op-qa-ui`, prefijo
 * `TEST-SOLT-`.
 *
 * Lo que importa y sólo se ve en la base: que las piezas, el m³ por guía, la
 * materia prima de la corrida y sus lotes cambien en UNA transacción; que la
 * producción no se toque; que las sueltas se lean libres en las TRES lecturas
 * de una troza; que un mes cerrado y lo imposible no escriban nada; y que dos
 * pestañas soltando la misma pieza no la resten dos veces.
 *
 * Escenario sintético en junio de 2099 (sin cierres ni datos reales) con una
 * especie única por corrida del test (`Solt<runId>`): el diagnóstico lee el
 * patio entero del tenant.
 *
 * Para correr:
 *   node --env-file=.env.local node_modules/.bin/vitest run __tests__/forestal-soltar-trozas-db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.AUDIT_CHAIN_ENABLED ??= "false";

import { prisma } from "@/lib/prisma";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { ForestVincularCorridaDB } from "@/lib/db/forest-vincular-corrida.db";
import { ForestLoteAserrioDB } from "@/lib/db/forest-lote-aserrio.db";
import { ForestVincularTrozasDB } from "@/lib/db/forest-vincular-trozas.db";
import { CTP_TX_OPTS, CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";
import type { CtpCierrePeriodo } from "@/lib/forestal/ctp-cierre-types";

const SLUG = "inversiones-agroforestales-blas-sociedad-op-qa-ui";
/** La N° 61 de Blas: de OTRO negocio. Sólo se usa para ver que acá no existe (el WHERE lleva el tenant). */
const CORRIDA_DE_BLAS = "cmuk4liss001uzhvzfo1jczkd";
const runId = Math.random().toString(36).slice(2, 8);
const P = `TEST-SOLT-${runId}`;
const ESPECIE = `Solt${runId}`;
const PERMISO = `${P}-PERMISO-A`;
const LLEGADA = new Date("2099-06-01T12:00:00.000Z");
const dia = (d: string) => new Date(`2099-06-${d}T12:00:00.000Z`);
const MOTIVO = `${P} no entraron a esta corrida`;

let TENANT = "";
let n = 0;

async function guia(vol: number, especie = ESPECIE) {
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
  await prisma.woodEntry.update({ where: { id: w.id }, data: { status: "validado", originCode: PERMISO } });
  return w;
}

async function troza(woodEntryId: string, vol: number, especie = ESPECIE) {
  return prisma.woodEntryTroza.create({
    data: { tenantId: TENANT, woodEntryId, orden: ++n, codificacion: `${P}-T${n}`, especieComun: especie, volumenM3: vol, fechaRecepcion: LLEGADA },
  });
}

/** `producidoM3` null = corrida ABIERTA (todavía no declara lo producido): la de `quitarDeCorrida`. */
async function corrida(producidoM3: number | null, fecha: Date, especie = ESPECIE) {
  return prisma.forestCtpEntry.create({
    data: {
      tenantId: TENANT,
      section: "produccion",
      lineNo: 95_500 + ++n,
      entryDate: fecha,
      speciesCommon: especie,
      productType: `${P}-prod`,
      quantity: producidoM3,
      unit: "m3",
      moneda: "PEN",
      status: "registrado",
      originCode: PERMISO,
      createdBy: P,
    },
  });
}

/** La foto de una corrida: materia prima, rendimiento, producción, m³ por guía y piezas. */
async function foto(corridaId: string) {
  const c = await prisma.forestCtpEntry.findUnique({
    where: { id: corridaId },
    select: { volumeInputM3: true, rendimientoPct: true, quantity: true },
  });
  const consumos = await prisma.forestCtpConsumo.findMany({ where: { tenantId: TENANT, ctpEntryId: corridaId }, select: { woodEntryId: true, volumeM3: true } });
  const piezas = await prisma.woodEntryTroza.findMany({ where: { tenantId: TENANT, consumidaEnId: corridaId }, select: { id: true } });
  return {
    volumen: c?.volumeInputM3 == null ? null : Number(c.volumeInputM3),
    rendimiento: c?.rendimientoPct == null ? null : Number(c.rendimientoPct),
    producido: c?.quantity == null ? null : Number(c.quantity),
    porGuia: Object.fromEntries(consumos.map((x) => [x.woodEntryId, Number(x.volumeM3)])),
    piezas: piezas.map((p) => p.id).sort(),
  };
}

const soltar = (corridaId: string, trozaIds: string[]) =>
  ForestVincularCorridaDB.soltarTrozas(TENANT, { corridaId, trozaIds, motivo: MOTIVO }, P);

async function codigoDelError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "sin_error";
  } catch (e) {
    return e instanceof CtpInvariantError ? e.code : `otro: ${String(e)}`;
  }
}

/** Barre por PATRÓN, incluida la basura de una corrida anterior que murió sin limpiar. */
async function purgar() {
  if (!TENANT) return;
  const wood = { tenantId: TENANT, gtfNumber: { startsWith: "TEST-SOLT-" } };
  const linea = { tenantId: TENANT, createdBy: { startsWith: "TEST-SOLT-" } };
  await prisma.forestCtpConsumo.deleteMany({
    where: { tenantId: TENANT, OR: [{ ctpEntry: linea }, { woodEntry: wood }, { createdBy: { startsWith: "TEST-SOLT-" } }] },
  });
  await prisma.woodEntryTroza.updateMany({ where: { tenantId: TENANT, entry: wood }, data: { loteAserrioId: null, consumidaEnId: null } });
  await prisma.forestLoteAserrio.deleteMany({
    where: { tenantId: TENANT, OR: [{ createdBy: { startsWith: "TEST-SOLT-" } }, { code: { startsWith: "TEST-SOLT-" } }] },
  });
  await prisma.forestCtpEntry.deleteMany({ where: linea });
  await prisma.woodEntry.deleteMany({ where: wood }); // las trozas caen en cascada
  await prisma.activityLog.deleteMany({ where: { tenantId: TENANT, user: { startsWith: "TEST-SOLT-" } } });
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

describe.skipIf(!HAS_DB)("soltar trozas contra la base real", () => {
  /* K1: 3 m³ producidos con 4 trozas de 2 guías (A 2,0 + B 2,5 · C 1,5 + D 3,0 = 9,0 m³). */
  let K1 = "";
  const t: Record<"A" | "B" | "C" | "D", { id: string; codificacion: string | null }> = {} as never;
  let G1 = "";
  let G2 = "";

  beforeAll(async () => {
    if (!HAS_DB) return;
    const g1 = await guia(10);
    const g2 = await guia(10);
    G1 = g1.id;
    G2 = g2.id;
    t.A = await troza(G1, 2.0);
    t.B = await troza(G1, 2.5);
    t.C = await troza(G2, 1.5);
    t.D = await troza(G2, 3.0);
    K1 = (await corrida(3.0, dia("10"))).id;
    await ForestVincularTrozasDB.vincularTrozas(TENANT, { corridaId: K1, trozaIds: [t.A.id, t.B.id, t.C.id, t.D.id] }, P);
  }, 120_000);

  it("suelta 2 de 4: las otras quedan, recalcula por guía, la producción no se toca", async () => {
    const antes = await foto(K1);
    expect(antes).toMatchObject({ volumen: 9, producido: 3, porGuia: { [G1]: 4.5, [G2]: 4.5 } });
    const lote = await prisma.woodEntryTroza.findUnique({ where: { id: t.A.id }, select: { loteAserrioId: true } });

    const r = await soltar(K1, [t.B.id, t.C.id]);
    expect(r).toMatchObject({ ok: true, piezas: 2, m3: 4, despues: { piezas: 2, m3: 5, rendimientoPct: 60 }, sobreElTope: true, quedaSinOrigen: false });
    expect(r.lotes).toEqual([expect.objectContaining({ loteId: lote?.loteAserrioId, destino: "suelta", piezas: 2, quedan: 2 })]);

    const despues = await foto(K1);
    expect(despues).toEqual({
      volumen: 5,
      rendimiento: 60,
      producido: 3,
      porGuia: { [G1]: 2, [G2]: 3 },
      piezas: [t.A.id, t.D.id].sort(),
    });
    /* El lote sigue siendo de K1 (casillero 10 del LO-CTP) y las sueltas salieron de él. */
    const l = await prisma.forestLoteAserrio.findUnique({ where: { id: lote!.loteAserrioId! }, select: { status: true, produccionEntryId: true } });
    expect(l).toEqual({ status: "consumido", produccionEntryId: K1 });
    const sueltas = await prisma.woodEntryTroza.findMany({ where: { id: { in: [t.B.id, t.C.id] } }, select: { consumidaEnId: true, fechaConsumo: true, loteAserrioId: true } });
    expect(sueltas.every((s) => s.consumidaEnId == null && s.fechaConsumo == null && s.loteAserrioId == null)).toBe(true);

    /* Las TRES lecturas de una troza dicen lo mismo: libre, sin lote. */
    const busca = (await WoodEntriesDB.buscarTrozas(TENANT, t.B.codificacion!)).find((x) => x.id === t.B.id);
    expect(busca).toMatchObject({ consumidaEn: null, loteAserrio: null });
    const deLaGuia = (await WoodEntriesDB.trozasDe(TENANT, G2)).find((x) => x.id === t.C.id);
    expect(deLaGuia).toMatchObject({ consumidaEn: null, loteAserrio: null });
    const patio = await WoodEntriesDB.trozasDelPatio(TENANT, { ids: [t.B.id, t.C.id] });
    expect(patio.map((x) => [x.id, x.consumidaEn, x.loteAserrio]).sort()).toEqual([[t.B.id, null, null], [t.C.id, null, null]].sort());

    const renglon = await prisma.activityLog.findFirst({
      where: { tenantId: TENANT, action: "ctp_corrida_soltar_trozas", entityId: K1 },
      select: { detail: true, user: true },
    });
    expect(renglon?.user).toBe(P);
    expect(renglon?.detail).toContain(MOTIVO);
    expect(renglon?.detail).toContain("producción intacta");
  }, 120_000);

  it("dejar menos madera que lo producido se rechaza y no escribe nada", async () => {
    const antes = await foto(K1);
    expect(await codigoDelError(soltar(K1, [t.D.id]))).toBe("VOLUMEN_INSUFICIENTE");
    expect(await foto(K1)).toEqual(antes);
  }, 60_000);

  it("un mes cerrado bloquea (ni piezas ni m³)", async () => {
    const antes = await foto(K1);
    const junio: CtpCierrePeriodo = {
      periodKey: "2099-06",
      from: "2099-06-01T05:00:00.000Z",
      to: "2099-07-01T04:59:59.999Z",
      label: "junio de 2099",
      closedAt: new Date().toISOString(),
      closedBy: P,
      saldoCierre: {} as CtpCierrePeriodo["saldoCierre"],
      totales: { ingresosCount: 0, volumenIngresado: 0, corridas: 0, despachos: 0, corridasCongeladas: 0, corridasSinCostear: 0, especiesEnNegativo: 0 },
    };
    const enTx = prisma.$transaction(
      (tx) => ForestVincularCorridaDB.soltarTrozasEnTx(tx, TENANT, { corridaId: K1, trozaIds: [t.A.id], motivo: MOTIVO }, P, { cierres: [junio] }),
      CTP_TX_OPTS,
    );
    expect(await codigoDelError(enTx)).toBe("PERIODO_CERRADO");
    expect(await foto(K1)).toEqual(antes);
  }, 60_000);

  it("dos pestañas que sueltan la misma troza: una gana, la otra se rechaza, nada se resta dos veces", async () => {
    const [a, b] = await Promise.allSettled([soltar(K1, [t.A.id]), soltar(K1, [t.A.id])]);
    const ok = [a, b].filter((x) => x.status === "fulfilled");
    const no = [a, b].filter((x): x is PromiseRejectedResult => x.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(no).toHaveLength(1);
    expect(no[0]!.reason).toBeInstanceOf(CtpInvariantError);
    expect((no[0]!.reason as CtpInvariantError).code).toBe("PROPUESTA_DESACTUALIZADA");
    expect(await foto(K1)).toEqual({ volumen: 3, rendimiento: 100, producido: 3, porGuia: { [G2]: 3 }, piezas: [t.D.id] });
    const pieza = await prisma.woodEntryTroza.findUnique({ where: { id: t.A.id }, select: { consumidaEnId: true } });
    expect(pieza?.consumidaEnId).toBeNull();
  }, 120_000);

  it("soltarlas todas: sin origen con su producción, el lote se reabre y se puede volver a vincular", async () => {
    const g3 = await guia(5);
    const e = await troza(g3.id, 1.0);
    const f = await troza(g3.id, 1.5);
    const k2 = (await corrida(1.0, dia("12"))).id;
    await ForestVincularTrozasDB.vincularTrozas(TENANT, { corridaId: k2, trozaIds: [e.id, f.id] }, P);
    const { loteAserrioId: l2 } = (await prisma.woodEntryTroza.findUnique({ where: { id: e.id }, select: { loteAserrioId: true } }))!;

    /* Como la deja `consumir`: la referencia de materia prima con el código del lote. */
    const { code: codigoL2 } = (await prisma.forestLoteAserrio.findUnique({ where: { id: l2! }, select: { code: true } }))!;
    await prisma.forestCtpEntry.update({ where: { id: k2 }, data: { materiaPrimaRef: codigoL2 } });

    const r = await soltar(k2, [e.id, f.id]);
    expect(r).toMatchObject({ quedaSinOrigen: true, despues: { piezas: 0, m3: null, rendimientoPct: null } });
    expect(await foto(k2)).toEqual({ volumen: null, rendimiento: null, producido: 1, porGuia: {}, piezas: [] });
    /* Revisión 28-09: el lote reabierto ya no es de esta corrida, su referencia tampoco. */
    expect((await prisma.forestCtpEntry.findUnique({ where: { id: k2 }, select: { materiaPrimaRef: true } }))?.materiaPrimaRef).toBeNull();
    const lote = await prisma.forestLoteAserrio.findUnique({ where: { id: l2! }, select: { status: true, produccionEntryId: true, fechaConsumo: true } });
    expect(lote).toEqual({ status: "abierto", produccionEntryId: null, fechaConsumo: null });
    const enElLote = await prisma.woodEntryTroza.count({ where: { id: { in: [e.id, f.id] }, loteAserrioId: l2, consumidaEnId: null } });
    expect(enElLote).toBe(2);
    expect(await prisma.activityLog.count({ where: { tenantId: TENANT, action: "ctp_lote_aserrio_reabrir", entityId: l2! } })).toBe(1);

    /* Vuelve a «sin origen» de verdad: se vincula otra vez con su lote abierto. */
    await ForestVincularTrozasDB.vincularTrozas(TENANT, { corridaId: k2, trozaIds: [e.id] }, P);
    expect(await foto(k2)).toMatchObject({ volumen: 1, piezas: [e.id] });
  }, 180_000);

  it("el renglón nombra TODAS las trozas; un motivo invisible no pasa; «ya marcaste todas» cuando el acta declara más", async () => {
    const g = await guia(10);
    const piezas = [];
    for (let i = 0; i < 10; i++) piezas.push(await troza(g.id, 0.5));
    const k = (await corrida(0.2, dia("14"))).id;
    await ForestVincularTrozasDB.vincularTrozas(TENANT, { corridaId: k, trozaIds: piezas.map((p) => p.id) }, P);

    /* Seguridad 28-09: espacios de ancho cero no son un motivo, ni por la DB class. */
    const invisible = ForestVincularCorridaDB.soltarTrozas(TENANT, { corridaId: k, trozaIds: [piezas[0]!.id], motivo: "​​​​​​" }, P);
    expect(await codigoDelError(invisible)).toBe("MOTIVO_REQUERIDO");

    const nueve = piezas.slice(0, 9);
    await soltar(k, nueve.map((p) => p.id));
    const renglon = await prisma.activityLog.findFirst({
      where: { tenantId: TENANT, action: "ctp_corrida_soltar_trozas", entityId: k },
      select: { detail: true },
    });
    for (const p of nueve) expect(renglon?.detail).toContain(p.codificacion!);
    expect(renglon?.detail).not.toContain("más");

    /* El acta declara 3 m³ más que sus piezas (volumen escrito): soltar la última deja 3 m³ para 4 m³ producidos. */
    await prisma.forestCtpEntry.update({ where: { id: k }, data: { volumeInputM3: 3.5, quantity: 4, rendimientoPct: null } });
    try {
      await soltar(k, [piezas[9]!.id]);
      throw new Error("debía rechazar");
    } catch (e) {
      expect(e).toBeInstanceOf(CtpInvariantError);
      expect((e as CtpInvariantError).code).toBe("VOLUMEN_INSUFICIENTE");
      expect((e as CtpInvariantError).message).toMatch(/Ya marcaste todas las trozas/);
      expect((e as CtpInvariantError).message).not.toMatch(/suéltalas todas/);
    }
  }, 180_000);

  describe("«Sacar» de una corrida ABIERTA (quitarDeCorrida) usa el mismo núcleo", () => {
    let K3 = "";
    const pz: { id: string }[] = [];
    let G5 = "";

    beforeAll(async () => {
      if (!HAS_DB) return;
      const g5 = await guia(10);
      G5 = g5.id;
      for (const v of [1.0, 1.5, 2.0]) pz.push(await troza(G5, v));
      K3 = (await corrida(null, dia("16"))).id;
      await ForestVincularTrozasDB.vincularTrozas(TENANT, { corridaId: K3, trozaIds: pz.map((p) => p.id) }, P);
    }, 120_000);

    it("saca una: baja volumen y guía en una tx, conserva su acción en el libro", async () => {
      expect(await foto(K3)).toMatchObject({ volumen: 4.5, producido: null, porGuia: { [G5]: 4.5 } });
      const r = await ForestLoteAserrioDB.quitarDeCorrida(TENANT, { corridaId: K3, trozaIds: [pz[0]!.id], user: P });
      expect(r).toMatchObject({ piezas: 1, volumenM3: 1, volumenTotalM3: 3.5, lotesReabiertos: [] });
      expect(await foto(K3)).toMatchObject({ volumen: 3.5, porGuia: { [G5]: 3.5 }, piezas: [pz[1]!.id, pz[2]!.id].sort() });
      expect(await prisma.activityLog.count({ where: { tenantId: TENANT, action: "ctp_corrida_quitar_piezas", entityId: K3 } })).toBe(1);
    }, 60_000);

    it("«Sacar» y «Soltar» la misma pieza a la vez: una gana y se resta UNA vez", async () => {
      const [a, b] = await Promise.allSettled([
        ForestLoteAserrioDB.quitarDeCorrida(TENANT, { corridaId: K3, trozaIds: [pz[1]!.id], user: P }),
        soltar(K3, [pz[1]!.id]),
      ]);
      expect([a, b].filter((x) => x.status === "fulfilled")).toHaveLength(1);
      const no = [a, b].find((x): x is PromiseRejectedResult => x.status === "rejected");
      expect((no?.reason as CtpInvariantError).code).toBe("PROPUESTA_DESACTUALIZADA");
      expect(await foto(K3)).toMatchObject({ volumen: 2, porGuia: { [G5]: 2 }, piezas: [pz[2]!.id] });
    }, 120_000);

    it("no la vacía, y con producción declarada manda a «Soltar trozas»", async () => {
      const antes = await foto(K3);
      expect(await codigoDelError(ForestLoteAserrioDB.quitarDeCorrida(TENANT, { corridaId: K3, trozaIds: [pz[2]!.id], user: P }))).toBe(
        "LOTE_NO_EDITABLE",
      );
      expect(await foto(K3)).toEqual(antes);
      await prisma.forestCtpEntry.update({ where: { id: K3 }, data: { quantity: 1, unit: "m3" } });
      try {
        await ForestLoteAserrioDB.quitarDeCorrida(TENANT, { corridaId: K3, trozaIds: [pz[2]!.id], user: P });
        throw new Error("debía rechazar");
      } catch (e) {
        expect((e as CtpInvariantError).code).toBe("LOTE_NO_EDITABLE");
        expect((e as CtpInvariantError).message).toMatch(/Soltar trozas/);
      }
    }, 60_000);
  });

  it("una corrida de otro negocio no existe acá (ni se lee ni se suelta)", async () => {
    expect(await ForestVincularCorridaDB.vistaDeSoltar(TENANT, CORRIDA_DE_BLAS)).toBeNull();
    expect(await codigoDelError(soltar(CORRIDA_DE_BLAS, [t.D.id]))).toBe("TENANT_MISMATCH");
  }, 60_000);

  it("simular: soltar una troza deja lista la corrida que la esperaba, y la sugiere", async () => {
    /* Otra especie: las trozas que los casos de arriba ya soltaron dejarían
       lista a la que espera sin pasar por la tomadora. */
    const otra = `Solt2${runId}`;
    const g4 = await guia(5, otra);
    const x = await troza(g4.id, 1.0, otra);
    const y = await troza(g4.id, 1.2, otra);
    const espera = (await corrida(0.8, dia("05"), otra)).id;
    const tomadora = (await corrida(1.0, dia("20"), otra)).id;
    await ForestVincularTrozasDB.vincularTrozas(TENANT, { corridaId: tomadora, trozaIds: [x.id, y.id] }, P);

    const diag = await ForestVincularTrozasDB.diagnostico(TENANT);
    expect(diag.corridas.find((c) => c.corridaId === espera)?.motivo).toBe("tomada_por_otra_corrida");

    const sim = await ForestVincularTrozasDB.simularSoltar(TENANT, tomadora, [y.id]);
    expect(sim?.destraba?.nuevas.map((c) => c.corridaId)).toContain(espera);
    expect(sim?.sugeridas).toHaveLength(1);
    expect([x.id, y.id]).toContain(sim?.sugeridas[0]);
    /* Sólo leyó: la tomadora sigue con sus dos trozas. */
    expect((await foto(tomadora)).piezas).toEqual([x.id, y.id].sort());
  }, 180_000);
});
