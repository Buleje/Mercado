/**
 * `ForestLoteMixtoDB` (ADR-441) contra la BASE REAL — tenant `main`, prefijo `TEST-MIXTO-`.
 *
 * ── Por qué no con mocks ──────────────────────────────────────────────────
 * Lo que importa es lo que Postgres hace con los locks y la transacción: que de
 * dos tablets que escanean la misma troza gane UNA, y que un reparto que se cae
 * a la mitad no deje ni un lote creado. Cada caso se verifica mirando la base
 * después, no el valor de retorno.
 *
 *  · dos reservas simultáneas de la misma troza → gana una (LM1/LM3).
 *  · la troza del mixto la rechazan `agregarTrozas` y `consumirEnPatio` (LM4).
 *  · repartir todo o nada: una falla a mitad → 0 lotes, la pila intacta.
 *  · una especie con 2 permisos → 2 lotes hijos; destino = suma a un lote abierto.
 *  · las tres lecturas de la troza dicen el mismo `loteMixtoId`.
 *  · anular un ingreso suelta la reserva; anular el mixto suelta la pila.
 *
 * Para correr:
 *   node --env-file=.env.local node_modules/.bin/vitest run __tests__/forestal-lote-mixto-db.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.AUDIT_CHAIN_ENABLED ??= "false";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { ForestLoteAserrioDB } from "@/lib/db/forest-lote-aserrio.db";
import { ForestLoteMixtoDB } from "@/lib/db/forest-lote-mixto.db";
import { CTP_TX_OPTS, CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";

const TENANT = "main";
const runId = Math.random().toString(36).slice(2, 8);
const P = `TEST-MIXTO-${runId}`;
const PA = `${P}-PA`;
const PB = `${P}-PB`;
/** La madera llegó antes que cualquier corrida de la prueba (T3). */
const LLEGADA = new Date("2026-01-05T12:00:00.000Z");

let n = 0;

/** Una guía validada (= recibida) con su permiso. */
async function guia(especie: string, permiso: string) {
  const w = await WoodEntriesDB.create(TENANT, {
    gtfNumber: `${P}-G${++n}`,
    providerName: `${P} proveedor`,
    speciesCommonName: especie,
    speciesCites: false,
    volumeM3: 20,
    costoTotal: null,
    moneda: "PEN",
    createdBy: P,
  });
  await prisma.woodEntry.update({ where: { id: w.id }, data: { status: "validado", originCode: permiso } });
  return w;
}

async function troza(woodEntryId: string, especie: string, vol = 1) {
  return prisma.woodEntryTroza.create({
    data: {
      tenantId: TENANT,
      woodEntryId,
      orden: ++n,
      codificacion: `${P}-T${n}`,
      especieComun: especie,
      volumenM3: vol,
      fechaRecepcion: LLEGADA,
    },
  });
}

async function mixto() {
  const r = await ForestLoteMixtoDB.crear(TENANT, { createdBy: P, reusarAbierto: false });
  expect(r.nuevo).toBe(true);
  return r.mixto;
}

const leerTrozas = (ids: string[]) =>
  prisma.woodEntryTroza.findMany({
    where: { id: { in: ids } },
    select: { id: true, loteMixtoId: true, loteAserrioId: true, reservadaMixtoEn: true, consumidaEnId: true },
    orderBy: { id: "asc" },
  });

/** Barre por PATRÓN, incluida la basura de una corrida anterior que murió sin limpiar. */
async function purgar() {
  const wood = { gtfNumber: { startsWith: "TEST-MIXTO-" } };
  const deTest = { startsWith: "TEST-MIXTO-" };
  await prisma.forestCtpConsumo.deleteMany({
    where: { OR: [{ ctpEntry: { tenantId: TENANT, createdBy: deTest } }, { woodEntry: wood }] },
  });
  await prisma.forestCtpEntry.deleteMany({ where: { tenantId: TENANT, createdBy: deTest } });
  await prisma.forestLoteAserrio.deleteMany({ where: { tenantId: TENANT, createdBy: deTest } });
  await prisma.forestLoteMixto.deleteMany({ where: { tenantId: TENANT, createdBy: deTest } });
  await prisma.woodEntry.deleteMany({ where: wood }); // las trozas caen en cascada
  await prisma.activityLog.deleteMany({ where: { tenantId: TENANT, user: deTest } });
}

/** Cuánto quedó en la base con el prefijo: el afterAll exige 0. */
async function restos() {
  const deTest = { startsWith: "TEST-MIXTO-" };
  const [guias, lotes, mixtos, corridas, log] = await Promise.all([
    prisma.woodEntry.count({ where: { gtfNumber: deTest } }),
    prisma.forestLoteAserrio.count({ where: { tenantId: TENANT, createdBy: deTest } }),
    prisma.forestLoteMixto.count({ where: { tenantId: TENANT, createdBy: deTest } }),
    prisma.forestCtpEntry.count({ where: { tenantId: TENANT, createdBy: deTest } }),
    prisma.activityLog.count({ where: { tenantId: TENANT, user: deTest } }),
  ]);
  return { guias, lotes, mixtos, corridas, log };
}

/* Top-level await, no `beforeAll`: `skipIf` se evalúa al coleccionar. */
const HAS_DB: boolean = await prisma.$queryRaw`SELECT 1`
  .then(() => prisma.forestLoteMixto.count({ where: { tenantId: TENANT } }))
  .then(() => true)
  .catch(() => false);

beforeAll(async () => {
  if (HAS_DB) await purgar();
}, 60_000);

afterAll(async () => {
  if (!HAS_DB) return;
  try {
    await purgar();
    /* El log de auditoría se escribe fire-and-forget: puede llegar después
       del primer barrido. Un segundo pase y la cuenta final. */
    await new Promise((r) => setTimeout(r, 1500));
    await purgar();
    expect(await restos()).toEqual({ guias: 0, lotes: 0, mixtos: 0, corridas: 0, log: 0 });
  } catch (err) {
    console.error("\n🔴 LA LIMPIEZA FALLÓ — quedan datos TEST-MIXTO- en `main`. Corré de nuevo (el beforeAll purga).\n", err);
    throw err;
  }
}, 60_000);

describe.skipIf(!HAS_DB)("reservar — LM1/LM3", () => {
  it("dos reservas simultáneas de la misma troza en dos mixtos: gana UNA", async () => {
    const g = await guia("Tornillo", PA);
    const t = await troza(g.id, "Tornillo");
    const [m1, m2] = [await mixto(), await mixto()];

    const [r1, r2] = await Promise.all([
      ForestLoteMixtoDB.reservar(TENANT, m1.id, [t.id], P),
      ForestLoteMixtoDB.reservar(TENANT, m2.id, [t.id], P),
    ]);

    expect(r1.agregadas + r2.agregadas).toBe(1);
    const perdedor = r1.agregadas === 1 ? r2 : r1;
    const ganador = r1.agregadas === 1 ? m1 : m2;
    expect(perdedor.rechazadas).toHaveLength(1);
    expect(perdedor.rechazadas[0].motivo).toBe(`ya está en el lote mixto ${ganador.code}`);
    const [fila] = await leerTrozas([t.id]);
    expect(fila.loteMixtoId).toBe(ganador.id);
    expect(fila.reservadaMixtoEn).not.toBeNull();
  }, 60_000);

  it("la misma troza escaneada dos veces a la vez en el MISMO mixto: una entra, la otra «ya estaba»", async () => {
    const g = await guia("Tornillo", PA);
    const t = await troza(g.id, "Tornillo");
    const m = await mixto();
    const rs = await Promise.all([
      ForestLoteMixtoDB.reservar(TENANT, m.id, [t.id], P),
      ForestLoteMixtoDB.reservar(TENANT, m.id, [t.id], P),
    ]);
    expect(rs.map((r) => r.agregadas).sort()).toEqual([0, 1]);
    expect(rs.map((r) => r.yaEstaban).sort()).toEqual([0, 1]);
    expect(rs.flatMap((r) => r.rechazadas)).toEqual([]);
  }, 60_000);

  it("rechaza con motivo lo que un lote tampoco acepta, y la que está en un lote de aserrío", async () => {
    const g = await guia("Tornillo", PA);
    const consumida = await troza(g.id, "Tornillo");
    const enLote = await troza(g.id, "Tornillo");
    const sinEspecie = await prisma.woodEntryTroza.create({
      data: { tenantId: TENANT, woodEntryId: g.id, orden: ++n, codificacion: `${P}-T${n}`, volumenM3: 1, fechaRecepcion: LLEGADA },
    });
    const corrida = await prisma.forestCtpEntry.create({
      data: { tenantId: TENANT, section: "produccion", lineNo: 96_000 + ++n, speciesCommon: "Tornillo", status: "registrado", moneda: "PEN", createdBy: P },
    });
    await prisma.woodEntryTroza.update({ where: { id: consumida.id }, data: { consumidaEnId: corrida.id } });
    const l = await ForestLoteAserrioDB.create(TENANT, { speciesCommon: "Tornillo", code: `${P}-L${++n}`, createdBy: P });
    expect((await ForestLoteAserrioDB.agregarTrozas(TENANT, l.id, [enLote.id], P)).agregadas).toBe(1);

    const m = await mixto();
    const r = await ForestLoteMixtoDB.reservar(TENANT, m.id, [consumida.id, enLote.id, sinEspecie.id, "no-existe"], P);
    expect(r.agregadas).toBe(0);
    const motivo = (id: string) => r.rechazadas.find((x) => x.id === id)?.motivo;
    expect(motivo(consumida.id)).toBe("ya entró a una corrida");
    expect(motivo(enLote.id)).toBe(`ya está en el lote ${l.code}`);
    expect(motivo(sinEspecie.id)).toContain("no tiene especie");
    expect(motivo("no-existe")).toBe("no existe en este centro");
    expect((await leerTrozas([consumida.id, enLote.id, sinEspecie.id])).every((t) => t.loteMixtoId == null)).toBe(true);
  }, 60_000);
});

describe.skipIf(!HAS_DB)("LM4 — la troza del mixto no entra a un lote ni se consume", () => {
  it("agregarTrozas y consumirEnPatio la rechazan con el código del mixto; no se abre corrida", async () => {
    const g = await guia("Cedro", PA);
    const t = await troza(g.id, "Cedro");
    const m = await mixto();
    expect((await ForestLoteMixtoDB.reservar(TENANT, m.id, [t.id], P)).agregadas).toBe(1);
    const l = await ForestLoteAserrioDB.create(TENANT, { speciesCommon: "Cedro", code: `${P}-L${++n}`, createdBy: P });

    const a = await ForestLoteAserrioDB.agregarTrozas(TENANT, l.id, [t.id], P);
    expect(a.agregadas).toBe(0);
    expect(a.rechazadas).toEqual([{ id: t.id, codigo: t.codificacion, motivo: `está en el lote mixto ${m.code}: repártelo primero` }]);

    const corridasAntes = await prisma.forestCtpEntry.count({ where: { tenantId: TENANT, createdBy: P } });
    const e = await ForestLoteAserrioDB.consumirEnPatio(TENANT, { loteId: l.id, trozaIds: [t.id], user: P }).catch((x) => x);
    expect(e).toBeInstanceOf(CtpInvariantError);
    expect((e as CtpInvariantError).message).toContain(m.code);
    expect((e as CtpInvariantError).message).toContain("repártelo");
    expect(await prisma.forestCtpEntry.count({ where: { tenantId: TENANT, createdBy: P } })).toBe(corridasAntes);

    const [fila] = await leerTrozas([t.id]);
    expect(fila).toMatchObject({ loteMixtoId: m.id, loteAserrioId: null, consumidaEnId: null });
  }, 60_000);
});

describe.skipIf(!HAS_DB)("LM4 fuera de los lotes — consumo a mano, despacho sin aserrar y retrozado", () => {
  /** Una línea del libro de la prueba: 2099, un mes sin cierres ni datos reales. */
  const linea = (section: "produccion" | "despacho") =>
    prisma.forestCtpEntry.create({
      data: {
        tenantId: TENANT,
        section,
        lineNo: 98_000 + ++n,
        entryDate: new Date("2099-05-10T12:00:00.000Z"),
        speciesCommon: "Shihuahuaco",
        productType: `${P}-prod`,
        quantity: 1,
        unit: "m3",
        moneda: "PEN",
        status: "registrado",
        createdBy: P,
      },
      select: { id: true },
    });

  it("los tres la rechazan con el código del mixto y no escriben nada; sacada del mixto, pasa", async () => {
    const g = await guia("Shihuahuaco", PA);
    const t = await troza(g.id, "Shihuahuaco", 1.5);
    const m = await mixto();
    expect((await ForestLoteMixtoDB.reservar(TENANT, m.id, [t.id], P)).agregadas).toBe(1);
    const corrida = await linea("produccion");
    const despacho = await linea("despacho");
    const frase = `La troza ${t.codificacion} está en ${m.code}: repártelo o sácala del mixto.`;

    /* 1 · Consumo a mano en una corrida (Consumos → «marcar piezas»). */
    await expect(
      WoodEntriesDB.marcarTrozasConsumidas(TENANT, corrida.id, [t.id], { usuario: P }),
    ).rejects.toMatchObject({ code: "T1_TROZA_NO_CONSUMIBLE", message: frase, detail: { trozas: [t.id], lotesMixtos: [m.code] } });

    /* 2 · Despacho sin aserrar: el pre-chequeo (antes de crear la línea) y el marcado con lock. */
    await expect(WoodEntriesDB.assertTrozasDespachables(TENANT, [t.id])).rejects.toMatchObject({
      code: "T2_TROZA_NO_DESPACHABLE",
      message: frase,
    });
    await expect(
      WoodEntriesDB.marcarDespachoTrozas(TENANT, despacho.id, [t.id], { usuario: P }),
    ).rejects.toMatchObject({ code: "T2_TROZA_NO_DESPACHABLE", message: frase });

    /* 3 · Retrozar la madre. */
    await expect(
      WoodEntriesDB.retrozar(TENANT, t.id, [{ codificacion: `${P}-R1`, d1Cm: 40, d2Cm: 38, largoM: 2, volumenM3: 0.5 }], {
        usuario: P,
        fecha: new Date("2099-05-10T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "ESTADO_NO_EDITABLE", message: frase });

    /* Nada escrito: sigue en su pila, sin corrida, sin despacho, sin pedazos. */
    const [fila] = await leerTrozas([t.id]);
    expect(fila).toMatchObject({ loteMixtoId: m.id, consumidaEnId: null });
    const extra = await prisma.woodEntryTroza.findUnique({
      where: { id: t.id },
      select: { despachadaEnId: true, _count: { select: { retrozos: true } } },
    });
    expect(extra).toEqual({ despachadaEnId: null, _count: { retrozos: 0 } });

    /* El guard no bloquea de más: fuera del mixto, la misma pieza pasa. */
    await ForestLoteMixtoDB.quitar(TENANT, m.id, [t.id], P);
    await expect(WoodEntriesDB.assertTrozasDespachables(TENANT, [t.id])).resolves.toMatchObject({ volumenM3: 1.5 });
    await expect(
      WoodEntriesDB.marcarTrozasConsumidas(TENANT, corrida.id, [t.id], { usuario: P }),
    ).resolves.toEqual({ consumidas: 1 });
  }, 90_000);

  it("un mixto repartido o anulado ya no aparta: la columna vieja no bloquea", async () => {
    const g = await guia("Shihuahuaco", PA);
    const t = await troza(g.id, "Shihuahuaco", 1);
    const m = await mixto();
    await ForestLoteMixtoDB.reservar(TENANT, m.id, [t.id], P);
    /* Un mixto muerto con la troza todavía apuntándolo (el estado, no el id pelado). */
    await prisma.forestLoteMixto.update({ where: { id: m.id }, data: { status: "anulado" } });
    await expect(WoodEntriesDB.assertTrozasDespachables(TENANT, [t.id])).resolves.toMatchObject({ volumenM3: 1 });
  }, 60_000);
});

describe.skipIf(!HAS_DB)("repartir — todo o nada", () => {
  it("una falla a mitad del reparto (el 2º lote no se puede crear) deja 0 lotes y la pila intacta", async () => {
    const g1 = await guia("Mashonaste", PA);
    const g2 = await guia("Tornillo", PA);
    const a = await troza(g1.id, "Mashonaste");
    const b = await troza(g2.id, "Tornillo");
    const m = await mixto();
    expect((await ForestLoteMixtoDB.reservar(TENANT, m.id, [a.id, b.id], P)).agregadas).toBe(2);

    /* El cliente de la transacción, con el 2º `forestLoteAserrio.create`
       saboteado: el primer lote YA se creó y sus trozas ya se movieron. */
    let creados = 0;
    const saboteado = (tx: Prisma.TransactionClient) =>
      new Proxy(tx, {
        get(target, prop) {
          const v = Reflect.get(target, prop, target) as unknown;
          if (prop !== "forestLoteAserrio") return typeof v === "function" ? (v as (...x: unknown[]) => unknown).bind(target) : v;
          const delegado = v as Prisma.TransactionClient["forestLoteAserrio"];
          return new Proxy(delegado, {
            get(d, q) {
              const f = Reflect.get(d, q, d) as unknown;
              if (q !== "create") return typeof f === "function" ? (f as (...x: unknown[]) => unknown).bind(d) : f;
              return async (args: Parameters<typeof delegado.create>[0]) => {
                if (++creados === 2) throw new Error("falla forzada a mitad del reparto");
                return delegado.create(args);
              };
            },
          });
        },
      });

    await expect(
      prisma.$transaction((tx) => ForestLoteMixtoDB.repartirEnTx(saboteado(tx), TENANT, m.id, {}, P), CTP_TX_OPTS),
    ).rejects.toThrow("falla forzada");
    expect(creados).toBe(2);

    expect(await prisma.forestLoteAserrio.count({ where: { tenantId: TENANT, loteMixtoId: m.id } })).toBe(0);
    const filas = await leerTrozas([a.id, b.id]);
    expect(filas.every((t) => t.loteMixtoId === m.id && t.loteAserrioId == null)).toBe(true);
    const despues = await prisma.forestLoteMixto.findUnique({ where: { id: m.id }, select: { status: true, repartidoEn: true } });
    expect(despues).toEqual({ status: "abierto", repartidoEn: null });

    /* Y la vinculación que reparte y después falla (decisión 3) tampoco deja nada. */
    await expect(
      prisma.$transaction(async (tx) => {
        await ForestLoteMixtoDB.repartirEnTx(tx, TENANT, m.id, {}, P);
        throw new Error("la vinculación falló después de repartir");
      }, CTP_TX_OPTS),
    ).rejects.toThrow("la vinculación falló");
    expect(await prisma.forestLoteAserrio.count({ where: { tenantId: TENANT, loteMixtoId: m.id } })).toBe(0);
    expect((await leerTrozas([a.id, b.id])).every((t) => t.loteMixtoId === m.id)).toBe(true);
  }, 90_000);

  it("Mashonaste de dos permisos → dos lotes hijos; Tornillo se suma a un lote abierto elegido", async () => {
    const gA = await guia("Mashonaste", PA);
    const gB = await guia("Mashonaste", PB);
    const gT = await guia("Tornillo", PA);
    const ma1 = await troza(gA.id, "Mashonaste", 1.2);
    const ma2 = await troza(gA.id, "Mashonaste", 0.8);
    const mb = await troza(gB.id, "Mashonaste", 1.0);
    const to = await troza(gT.id, "Tornillo", 2.0);
    const abierto = await ForestLoteAserrioDB.create(TENANT, { speciesCommon: "Tornillo", permiso: PA, code: `${P}-L${++n}`, createdBy: P });
    const m = await mixto();
    expect((await ForestLoteMixtoDB.reservar(TENANT, m.id, [ma1.id, mb.id, to.id, ma2.id], P)).agregadas).toBe(4);

    const [leido] = await ForestLoteMixtoDB.list(TENANT, { id: m.id });
    expect(leido.grupos.map((x) => [x.especie, x.permiso, x.piezas])).toEqual([
      ["Mashonaste", PA, 2],
      ["Mashonaste", PB, 1],
      ["Tornillo", PA, 1],
    ]);
    const claveTornillo = leido.grupos[2].clave;

    const r = await ForestLoteMixtoDB.repartir(TENANT, m.id, { destinos: { [claveTornillo]: abierto.id } }, P);
    /* Los renglones del libro se ESPERAN antes de responder (en Vercel lo que
       sigue después de la respuesta puede no terminar): apenas vuelve
       `repartir`, ya están — sin reintentos ni esperas acá. */
    const renglones = await prisma.activityLog.findMany({
      where: {
        tenantId: TENANT,
        user: P,
        OR: [
          { action: "ctp_lote_mixto_repartir", entityId: m.id },
          { action: "ctp_lote_aserrio_create", entityId: { in: r.lotes.filter((l) => l.nuevo).map((l) => l.loteId) } },
        ],
      },
      select: { action: true },
    });
    expect(renglones.map((x) => x.action).sort()).toEqual([
      "ctp_lote_aserrio_create",
      "ctp_lote_aserrio_create",
      "ctp_lote_mixto_repartir",
    ]);
    expect(r.excluidas).toEqual([]);
    expect(r.lotes.map((l) => [l.especie, l.permiso, l.nuevo, l.piezas, l.m3])).toEqual([
      ["Mashonaste", PA, true, 2, 2],
      ["Mashonaste", PB, true, 1, 1],
      ["Tornillo", PA, false, 1, 2],
    ]);
    expect(r.lotes[2].loteId).toBe(abierto.id);

    const hijos = await prisma.forestLoteAserrio.findMany({
      where: { tenantId: TENANT, loteMixtoId: m.id },
      select: { id: true, speciesCommon: true, permiso: true, status: true, createdBy: true },
      orderBy: { permiso: "asc" },
    });
    expect(hijos.map((h) => [h.speciesCommon, h.permiso, h.status])).toEqual([
      ["Mashonaste", PA, "abierto"],
      ["Mashonaste", PB, "abierto"],
    ]);
    /* LM2: cada troza en su lote y fuera del mixto. */
    const filas = await leerTrozas([ma1.id, ma2.id, mb.id, to.id]);
    const loteDe = new Map(filas.map((f) => [f.id, f.loteAserrioId]));
    expect(filas.every((f) => f.loteMixtoId == null && f.reservadaMixtoEn == null)).toBe(true);
    expect(loteDe.get(ma1.id)).toBe(r.lotes[0].loteId);
    expect(loteDe.get(ma2.id)).toBe(r.lotes[0].loteId);
    expect(loteDe.get(mb.id)).toBe(r.lotes[1].loteId);
    expect(loteDe.get(to.id)).toBe(abierto.id);

    const [cerrado] = await ForestLoteMixtoDB.list(TENANT, { id: m.id });
    expect(cerrado).toMatchObject({ status: "repartido", trozaIds: [] });
    expect(cerrado.repartidoEn).not.toBeNull();
    expect(cerrado.lotes.map((l) => l.piezas)).toEqual([2, 1]);

    /* Un mixto repartido no se reparte ni se anula de nuevo. */
    await expect(ForestLoteMixtoDB.repartir(TENANT, m.id, {}, P)).rejects.toMatchObject({ code: "LOTE_NO_EDITABLE" });
    await expect(ForestLoteMixtoDB.anular(TENANT, m.id, "error", P)).rejects.toMatchObject({ code: "LOTE_NO_EDITABLE" });
  }, 90_000);

  it("la pieza que dejó de poder ir a un lote sale de la vista previa y el reparto la suelta", async () => {
    const g = await guia("Cumala", PA);
    const buena = await troza(g.id, "Cumala");
    const noLlego = await troza(g.id, "Cumala");
    const m = await mixto();
    expect((await ForestLoteMixtoDB.reservar(TENANT, m.id, [buena.id, noLlego.id], P)).agregadas).toBe(2);
    /* Después de apartarla, Recepción la marca «no llegó» (otro camino). */
    await prisma.woodEntryTroza.update({ where: { id: noLlego.id }, data: { noRecepcionada: true } });

    const [previa] = await ForestLoteMixtoDB.list(TENANT, { id: m.id });
    expect(previa.trozaIds).toHaveLength(2);
    expect(previa.grupos.map((x) => x.piezas)).toEqual([1]);
    expect(previa.resumen.piezas).toBe(1);
    expect(previa.fuera).toEqual([{ id: noLlego.id, codigo: noLlego.codificacion, motivo: "no llegó al patio" }]);

    const r = await ForestLoteMixtoDB.repartir(TENANT, m.id, {}, P);
    expect(r.lotes.map((l) => l.piezas)).toEqual([1]);
    expect(r.excluidas).toEqual(previa.fuera);
    expect((await leerTrozas([noLlego.id]))[0]).toMatchObject({ loteMixtoId: null, loteAserrioId: null });
  }, 60_000);

  it("un destino que no acepta al grupo tira el reparto entero: 0 lotes", async () => {
    const g = await guia("Tornillo", PA);
    const t = await troza(g.id, "Tornillo");
    const otroPermiso = await ForestLoteAserrioDB.create(TENANT, { speciesCommon: "Tornillo", permiso: PB, code: `${P}-L${++n}`, createdBy: P });
    const m = await mixto();
    await ForestLoteMixtoDB.reservar(TENANT, m.id, [t.id], P);
    const [leido] = await ForestLoteMixtoDB.list(TENANT, { id: m.id });
    await expect(
      ForestLoteMixtoDB.repartir(TENANT, m.id, { destinos: { [leido.grupos[0].clave]: otroPermiso.id } }, P),
    ).rejects.toMatchObject({ code: "VALIDACION" });
    expect(await prisma.forestLoteAserrio.count({ where: { tenantId: TENANT, loteMixtoId: m.id } })).toBe(0);
    expect((await leerTrozas([t.id]))[0]).toMatchObject({ loteMixtoId: m.id, loteAserrioId: null });
  }, 60_000);
});

describe.skipIf(!HAS_DB)("las tres lecturas de la troza", () => {
  it("trozasComoConsumibles, trozasDe y buscarTrozas dicen el mismo loteMixtoId; al anular, las tres lo sueltan", async () => {
    const g = await guia("Capirona", PA);
    const t = await troza(g.id, "Capirona");
    const m = await mixto();
    await ForestLoteMixtoDB.reservar(TENANT, m.id, [t.id], P);

    const leer = async () => {
      const [patio] = await WoodEntriesDB.trozasComoConsumibles(TENANT, { ids: [t.id] });
      const deGuia = (await WoodEntriesDB.trozasDe(TENANT, g.id)).find((x) => x.id === t.id);
      const buscada = (await WoodEntriesDB.buscarTrozas(TENANT, t.codificacion!)).find((x) => x.id === t.id);
      /* La 4ª: la ficha que lee el escáner al pasar el QR. */
      const ficha = await WoodEntriesDB.fichaDeTroza(TENANT, t.id);
      return {
        patio: [patio.loteMixtoId, patio.loteMixtoCode],
        deGuia: [deGuia?.loteMixtoId, deGuia?.loteMixto?.code],
        buscada: [buscada?.loteMixtoId, buscada?.loteMixto?.code],
        ficha: [ficha?.loteMixtoId, ficha?.loteMixto?.code],
      };
    };
    expect(await leer()).toEqual({
      patio: [m.id, m.code],
      deGuia: [m.id, m.code],
      buscada: [m.id, m.code],
      ficha: [m.id, m.code],
    });

    const r = await ForestLoteMixtoDB.anular(TENANT, m.id, "prueba de lecturas", P);
    expect(r).toEqual({ code: m.code, liberadas: 1 });
    expect(await leer()).toEqual({
      patio: [null, null],
      deGuia: [null, undefined],
      buscada: [null, undefined],
      ficha: [null, undefined],
    });
  }, 60_000);
});

describe.skipIf(!HAS_DB)("el ingreso muerto suelta la reserva", () => {
  it("anular el ingreso y borrarlo sueltan sus trozas del mixto; las de otra guía siguen", async () => {
    const g1 = await guia("Bolaina", PA);
    const g2 = await guia("Bolaina", PA);
    const g3 = await guia("Bolaina", PA);
    const t1 = await troza(g1.id, "Bolaina");
    const t2 = await troza(g2.id, "Bolaina");
    const t3 = await troza(g3.id, "Bolaina");
    const m = await mixto();
    expect((await ForestLoteMixtoDB.reservar(TENANT, m.id, [t1.id, t2.id, t3.id], P)).agregadas).toBe(3);

    await WoodEntriesDB.annul(TENANT, g1.id, P, "guía mal cargada");
    await WoodEntriesDB.softDelete(TENANT, g2.id, P);

    const filas = new Map((await leerTrozas([t1.id, t2.id, t3.id])).map((f) => [f.id, f.loteMixtoId]));
    expect(filas.get(t1.id)).toBeNull();
    expect(filas.get(t2.id)).toBeNull();
    expect(filas.get(t3.id)).toBe(m.id);
  }, 60_000);
});

describe.skipIf(!HAS_DB)("crear y quitar", () => {
  it("sin `nuevo`, abrir devuelve el mixto abierto (dos tablets, una pila); quitar es idempotente", async () => {
    const g = await guia("Moena", PA);
    const t = await troza(g.id, "Moena");
    const m = await mixto();
    const otra = await ForestLoteMixtoDB.crear(TENANT, { createdBy: P });
    expect(otra).toMatchObject({ nuevo: false, mixto: { id: m.id, code: m.code } });

    await ForestLoteMixtoDB.reservar(TENANT, m.id, [t.id], P);
    expect(await ForestLoteMixtoDB.quitar(TENANT, m.id, [t.id], P)).toEqual({ quitadas: 1, rechazadas: [] });
    // La cola sin señal repite el pedido: no es un error.
    expect(await ForestLoteMixtoDB.quitar(TENANT, m.id, [t.id], P)).toEqual({ quitadas: 0, rechazadas: [] });
    expect((await leerTrozas([t.id]))[0]).toMatchObject({ loteMixtoId: null, reservadaMixtoEn: null });
  }, 60_000);
});
