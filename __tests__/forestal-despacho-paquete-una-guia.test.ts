/**
 * ADR-444 · un paquete, una guía vigente, y el alta del despacho en UN acto —
 * contra la base REAL (tenant `main`).
 *
 * Lo que midió la revisión del 27-09 por el camino del modal de la guía:
 *  · el paquete despachado seguía en Productos disponibles y en el selector;
 *  · una 2.ª guía con el mismo paquete entraba;
 *  · un pedido que no cabía en el saldo daba 422 con la línea YA grabada, y
 *    cada reintento sumaba otra;
 *  · 174 paquetes de Blas con un producto distinto al de su corrida no se
 *    podían despachar (y el rechazo llegaba después de grabar).
 *
 * Cada caso pasa por la misma cadena que el modal: `productosDisponibles` →
 * `filasDeCorridas` (el selector) → `enviosDeLista` (el cuerpo del POST) →
 * `ForestCtpDB.create` (lo que llama la ruta).
 *
 * Todo lo creado lleva el prefijo `TEST-PQ444-` y se purga por patrón en
 * `beforeAll` y `afterAll` (una corrida que murió a medias no deja basura).
 *
 * Para correr:
 *   node --env-file=.env.local node_modules/.bin/vitest run \
 *     __tests__/forestal-despacho-paquete-una-guia.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.AUDIT_CHAIN_ENABLED ??= "false";

import { prisma } from "@/lib/prisma";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { ForestCtpDespachoDB } from "@/lib/db/forest-ctp-despacho.db";
import { enviosDeLista, filasDeCorridas, type ComunDeGuia, type FilaDespacho } from "@/lib/forestal/despacho-lista";

const TENANT = "main";
/** Blas: sólo se LEE, para probar que la regla no cruza de tenant. */
const BLAS = "cmpxiv6p4000bohvzwl6bnfpv";
const PREFIJO = "TEST-PQ444-";
const runId = Math.random().toString(36).slice(2, 8);
const P = `${PREFIJO}${runId}`;
/** Especie propia de la corrida de tests: I3 agrega por producto+especie y no ve la madera de otros. */
const ESPECIE = `Pq444 ${runId}`;
const TABLA = "MADERA ASERRADA (TABLA)";
const COMERCIAL = "MADERA ASERRADA (COMERCIAL)";

async function purgar() {
  const linea = { tenantId: TENANT, createdBy: { startsWith: PREFIJO } };
  await prisma.forestCtpDespachoOrigen.deleteMany({
    where: { OR: [{ despacho: linea }, { produccion: linea }, { createdBy: { startsWith: PREFIJO } }] },
  });
  await prisma.forestCtpPaquete.deleteMany({ where: { tenantId: TENANT, codigo: { startsWith: PREFIJO } } });
  await prisma.forestCtpEntry.deleteMany({ where: linea });
  // Las guías de ingreso de las trozas (sus piezas se van en cascada).
  await prisma.woodEntry.deleteMany({ where: { tenantId: TENANT, gtfNumber: { startsWith: PREFIJO } } });
  await prisma.activityLog.deleteMany({ where: { tenantId: TENANT, user: { startsWith: PREFIJO } } });
}

/* Top-level await, NO `beforeAll`: `describe.skipIf` se evalúa al recolectar. */
const HAS_DB: boolean = await prisma
  .$queryRaw`SELECT 1`
  .then(() => prisma.forestCtpPaquete.count({ where: { tenantId: TENANT } }))
  .then(() => true)
  .catch(() => false);

beforeAll(async () => {
  if (HAS_DB) await purgar();
}, 30_000);

afterAll(async () => {
  if (!HAS_DB) return;
  try {
    await purgar();
  } catch (err) {
    console.error(`\n🔴 LA LIMPIEZA FALLÓ — quedan datos ${PREFIJO} en main.\n`, err);
    throw err;
  }
}, 30_000);

let n = 0;
const codigo = (x: string) => `${P}-${x}-${n++}`;

/** Una corrida con paquetes, por el mismo `create` que usa el import. `cantidad` ≠ Σ paquetes = dato viejo. */
async function corrida(
  producto: string,
  paquetes: { codigo: string; volumenM3: number; productType?: string }[],
  cantidad?: number,
) {
  const total = cantidad ?? paquetes.reduce((a, p) => a + p.volumenM3, 0);
  return ForestCtpDB.create(TENANT, {
    section: "produccion",
    speciesCommon: ESPECIE,
    productType: producto,
    volumeInputM3: total * 2,
    quantity: total,
    unit: "m3",
    createdBy: P,
    paquetes: paquetes.map((p) => ({
      codigo: p.codigo,
      cantidad: 10,
      volumenM3: p.volumenM3,
      productType: p.productType ?? null,
    })),
  });
}

async function disponibles() {
  return (await ForestCtpDB.productosDisponibles(TENANT, { especie: ESPECIE })).corridas;
}

/** Lo que ofrece el selector del modal de la guía. */
async function selector(): Promise<FilaDespacho[]> {
  return filasDeCorridas(await disponibles());
}

const comun = (gtfNumber: string): ComunDeGuia => ({
  entryDate: new Date().toISOString(),
  docType: "GTF",
  gtfNumber,
  destino: `${P} destino`,
  observations: null,
});

/** El cuerpo que manda el modal (`enviosDeLista`) por la vía que llama la ruta. */
async function registrar(fila: FilaDespacho, gtf: string) {
  const [envio] = enviosDeLista([fila], comun(gtf));
  /* La ruta pasa el cuerpo por Zod (fechas a `Date`); acá se hace a mano. */
  const { entryDate, serforVerificadoEn: _sello, ...resto } = envio!.payload;
  return ForestCtpDB.create(TENANT, { ...resto, entryDate: new Date(entryDate), createdBy: P });
}

/** Una troza libre en el patio: guía validada con una pieza de ese código. */
async function trozaLibre(cod: string) {
  const w = await WoodEntriesDB.create(TENANT, {
    gtfNumber: `${P}-GTF-${n++}`,
    providerName: `${P} proveedor`,
    speciesCommonName: ESPECIE,
    speciesCites: false,
    volumeM3: 1,
    moneda: "PEN",
    createdBy: P,
  });
  await prisma.woodEntry.update({ where: { id: w.id }, data: { status: "validado" } });
  return prisma.woodEntryTroza.create({
    data: { tenantId: TENANT, woodEntryId: w.id, codigoPlanta: cod, codificacion: cod, especieComun: ESPECIE, volumenM3: 0.4 },
  });
}

/** La salida de UNA troza sin aserrar, como la registra la ruta (ADR-363): pre-chequeo, alta, marcado. */
async function registrarTroza(troza: { id: string; codigoPlanta: string | null }, gtf: string) {
  const fila: FilaDespacho = {
    uid: `troza:${troza.id}`, corridaId: "", trozaId: troza.id, lineNo: null, paqueteId: null,
    especie: ESPECIE, especieCientifica: null, cites: false, producto: "MADERA EN ROLLO",
    codigo: troza.codigoPlanta, presentacion: null, cantidad: 1, espesorCm: null, anchoCm: null,
    largoM: null, volumen: 0.4, unidad: "m3", disponibleCorrida: 0.4, gtfOrigen: [], titularOrigen: [],
    lote: null, linea: null, fechaProduccion: null,
  };
  const [envio] = enviosDeLista([fila], comun(gtf));
  const { entryDate, serforVerificadoEn: _sello, trozas, ...resto } = envio!.payload as typeof envio.payload & {
    trozas: string[];
  };
  await WoodEntriesDB.assertTrozasDespachables(TENANT, trozas);
  const d = await ForestCtpDB.create(TENANT, { ...resto, entryDate: new Date(entryDate), desdeTrozas: true, createdBy: P });
  await WoodEntriesDB.marcarDespachoTrozas(TENANT, d.id, trozas, { fecha: new Date(entryDate), usuario: P });
  return d;
}

const lineasDeGuia = (gtf: string) =>
  prisma.forestCtpEntry.count({ where: { tenantId: TENANT, section: "despacho", gtfNumber: gtf } });

const despachosVivosDe = (cod: string) =>
  prisma.forestCtpEntry.count({
    where: { tenantId: TENANT, section: "despacho", codigoProducto: cod, deletedAt: null, status: "registrado" },
  });

describe.skipIf(!HAS_DB)("ADR-444 · un paquete, una guía vigente", () => {
  it("el paquete despachado sale de Productos disponibles y del selector; el otro sigue", async () => {
    const [a, b] = [codigo("A"), codigo("B")];
    const c = await corrida(TABLA, [
      { codigo: a, volumenM3: 1 },
      { codigo: b, volumenM3: 1.5 },
    ]);
    const antes = await selector();
    expect(antes.map((f) => f.codigo).sort()).toEqual([a, b].sort());

    await registrar(antes.find((f) => f.codigo === a)!, `${P}-G1`);

    const corridaDespues = (await disponibles()).find((x) => x.id === c.id);
    expect(corridaDespues?.paquetes.map((p) => p.codigo)).toEqual([b]);
    expect((await selector()).map((f) => f.codigo)).toEqual([b]);
    // La regla no cruza de tenant: el mismo código en Blas no está despachado.
    expect((await ForestCtpDespachoDB.codigosDespachados(BLAS, [a])).size).toBe(0);
  }, 60_000);

  it("una 2.ª guía con el mismo paquete → PAQUETE_YA_DESPACHADO y no deja línea", async () => {
    const [a, b] = [codigo("A"), codigo("B")];
    await corrida(TABLA, [
      { codigo: a, volumenM3: 1 },
      { codigo: b, volumenM3: 1.5 },
    ]);
    const fila = (await selector()).find((f) => f.codigo === a)!;
    await registrar(fila, `${P}-G2a`);

    /* La fila vieja del modal (lista sin recargar): la corrida todavía tiene
       1,5 de saldo, así que I5 la dejaría pasar — la para la regla nueva. */
    await expect(registrar(fila, `${P}-G2b`)).rejects.toMatchObject({ code: "PAQUETE_YA_DESPACHADO" });
    await expect(registrar(fila, `${P}-G2b`)).rejects.toThrow(`${a} ya va en la guía ${P}-G2a`);
    expect(await lineasDeGuia(`${P}-G2b`)).toBe(0);
    expect(await despachosVivosDe(a)).toBe(1);
  }, 60_000);

  it("el ÚLTIMO paquete dos veces: el motivo es el paquete, no «sólo quedan…»", async () => {
    /* Sin stock del producto después de la 1.ª guía, I3 también rechazaría;
       el mensaje tiene que ser el que dice qué pasó de verdad. */
    const a = codigo("A");
    await corrida(TABLA, [{ codigo: a, volumenM3: 0.8 }]);
    const fila = (await selector()).find((f) => f.codigo === a)!;
    await registrar(fila, `${P}-G9a`);
    await expect(registrar(fila, `${P}-G9b`)).rejects.toMatchObject({ code: "PAQUETE_YA_DESPACHADO" });
    expect(await lineasDeGuia(`${P}-G9b`)).toBe(0);
  }, 60_000);

  it("un borrador (sin N° de guía) también lleva el paquete", async () => {
    const a = codigo("A");
    await corrida(TABLA, [
      { codigo: a, volumenM3: 1 },
      { codigo: codigo("B"), volumenM3: 1 },
    ]);
    const fila = (await selector()).find((f) => f.codigo === a)!;
    await registrar(fila, ""); // borrador
    await expect(registrar(fila, `${P}-G3`)).rejects.toThrow(/una guía en borrador/);
    expect(await lineasDeGuia(`${P}-G3`)).toBe(0);
  }, 60_000);

  it("anular la guía devuelve el paquete a disponibles y se puede volver a despachar", async () => {
    const a = codigo("A");
    await corrida(TABLA, [
      { codigo: a, volumenM3: 1 },
      { codigo: codigo("B"), volumenM3: 1 },
    ]);
    const fila = (await selector()).find((f) => f.codigo === a)!;
    const d = await registrar(fila, `${P}-G4a`);
    expect((await selector()).some((f) => f.codigo === a)).toBe(false);

    await ForestCtpDB.annul(TENANT, d.id, "guía mal hecha (test)", P);
    expect((await selector()).some((f) => f.codigo === a)).toBe(true);
    await registrar(fila, `${P}-G4b`);
    expect(await despachosVivosDe(a)).toBe(1);
  }, 60_000);

  it("dato viejo con el paquete en DOS guías vivas: anular una no lo libera", async () => {
    const a = codigo("A");
    const c = await corrida(TABLA, [
      { codigo: a, volumenM3: 1 },
      { codigo: codigo("B"), volumenM3: 1 },
    ]);
    /* Como SL-681 en Blas (despachos 2 y 3): entró antes de la regla. Se
       siembra directo — por `create` ya no se puede. */
    const vieja = (lineNo: number) =>
      prisma.forestCtpEntry.create({
        data: {
          tenantId: TENANT, section: "despacho", lineNo, speciesCommon: ESPECIE, productType: TABLA,
          quantity: 0.5, unit: "m3", codigoProducto: a, status: "registrado", createdBy: P,
          origenes: { create: { tenantId: TENANT, produccionEntryId: c.id, quantity: 0.5, createdBy: P } },
        },
      });
    const [d1, d2] = [await vieja(97_000 + n), await vieja(97_500 + n)];

    await ForestCtpDB.annul(TENANT, d1.id, "duplicada (test)", P);
    expect((await selector()).some((f) => f.codigo === a)).toBe(false);
    await ForestCtpDB.annul(TENANT, d2.id, "duplicada (test)", P);
    expect((await selector()).some((f) => f.codigo === a)).toBe(true);
  }, 60_000);

  it("una salida de TROZA con el mismo código que un paquete no lo saca de Disponibles", async () => {
    /* Blas: los paquetes «55»…«72» comparten número con 18 trozas libres. La
       salida de UNA troza guarda el código de la pieza en `codigoProducto`. */
    const cod = codigo("58");
    await corrida(TABLA, [{ codigo: cod, volumenM3: 1 }]);
    const troza = await trozaLibre(cod);
    const d = await registrarTroza(troza, `${P}-GT`);
    expect(d.codigoProducto).toBe(cod); // el dato que confundía a la regla

    const fila = (await selector()).find((f) => f.codigo === cod);
    expect(fila, "el paquete sigue en el selector").toBeDefined();
    expect((await ForestCtpDespachoDB.codigosDespachados(TENANT, [cod])).size).toBe(0);
    await registrar(fila!, `${P}-GP`); // y su guía entra: no es 409
    expect(await lineasDeGuia(`${P}-GP`)).toBe(1);
  }, 60_000);

  it("dos altas a la vez con el mismo paquete: entra una", async () => {
    const a = codigo("A");
    await corrida(TABLA, [
      { codigo: a, volumenM3: 1 },
      { codigo: codigo("B"), volumenM3: 1 },
    ]);
    const fila = (await selector()).find((f) => f.codigo === a)!;
    const res = await Promise.allSettled([registrar(fila, `${P}-G5a`), registrar(fila, `${P}-G5b`)]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rechazo = res.find((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rechazo?.reason).toMatchObject({ code: "PAQUETE_YA_DESPACHADO" });
    expect(await despachosVivosDe(a)).toBe(1);
  }, 60_000);
});

describe.skipIf(!HAS_DB)("ADR-444 · el alta del despacho es UN acto", () => {
  it("un 422 de I5 no deja la línea, y reintentar no suma líneas", async () => {
    /* La corrida chica (0,5) y otra grande del MISMO producto: el agregado de
       I3 alcanza, así que el rechazo es de I5 — el que antes llegaba después
       de grabar. */
    const chica = await corrida(TABLA, [], 0.5);
    await corrida(TABLA, [], 10);
    const fila = (await selector()).find((f) => f.corridaId === chica.id)!;
    const pedido: FilaDespacho = { ...fila, volumen: 2 };
    for (const intento of [1, 2]) {
      await expect(registrar(pedido, `${P}-G6`), `intento ${intento}`).rejects.toMatchObject({
        code: "I5_SOBRE_SALIDA_PRODUCCION",
      });
    }
    expect(await lineasDeGuia(`${P}-G6`)).toBe(0);
  }, 60_000);

  it("el producto del PAQUETE vale aunque no sea el de su corrida; uno ajeno sigue rechazado", async () => {
    const a = codigo("A");
    const c = await corrida(TABLA, [
      { codigo: a, volumenM3: 1, productType: COMERCIAL },
      { codigo: codigo("B"), volumenM3: 1 },
    ]);
    const fila = (await selector()).find((f) => f.codigo === a)!;
    expect(fila.producto).toBe(COMERCIAL); // la guía sale con el producto del paquete

    /* Ni el de la corrida ni el de un paquete suyo: sigue siendo un número
       que no significa nada. I3 no lo ve (agrupa sin el paréntesis). Con el
       MISMO código de paquete: si el rechazo dejara algo, el paquete quedaría
       tomado y el alta de abajo daría PAQUETE_YA_DESPACHADO. */
    await expect(
      registrar({ ...fila, producto: "MADERA ASERRADA (CORTA)" }, `${P}-G7a`),
    ).rejects.toMatchObject({ code: "TENANT_MISMATCH" });
    expect(await lineasDeGuia(`${P}-G7a`)).toBe(0);

    const d = await registrar(fila, `${P}-G7b`);
    const origenes = await ForestCtpDespachoDB.listByDespacho(TENANT, d.id);
    expect(origenes.map((o) => [o.produccionEntryId, Number(o.quantity)])).toEqual([[c.id, 1]]);
  }, 60_000);

  it("una salida «(COMERCIAL)» SIN código no sale de una corrida «(TABLA)» por tener un paquete comercial", async () => {
    /* La corrida mixta: 0,5 comerciales y 1,5 de tabla. Aceptar el producto de
       CUALQUIER paquete dejaba sacar 2 m³ «comerciales» — corta contra
       comercial por otra puerta. En Blas hay 30 corridas así. */
    const c = await corrida(TABLA, [
      { codigo: codigo("A"), volumenM3: 0.5, productType: COMERCIAL },
      { codigo: codigo("B"), volumenM3: 1.5 },
    ]);
    const sinCodigo: FilaDespacho = {
      ...(await selector()).find((f) => f.corridaId === c.id)!,
      paqueteId: null, codigo: null, producto: COMERCIAL, volumen: 2,
    };
    await expect(registrar(sinCodigo, `${P}-G10`)).rejects.toMatchObject({ code: "TENANT_MISMATCH" });
    expect(await lineasDeGuia(`${P}-G10`)).toBe(0);
  }, 60_000);

  it("nombrar el paquete comercial no habilita a sacar más de lo que el paquete mide", async () => {
    const a = codigo("A");
    await corrida(TABLA, [
      { codigo: a, volumenM3: 0.5, productType: COMERCIAL },
      { codigo: codigo("B"), volumenM3: 1.5 },
    ]);
    const fila = (await selector()).find((f) => f.codigo === a)!;
    await expect(registrar({ ...fila, volumen: 2 }, `${P}-G11a`)).rejects.toMatchObject({
      code: "I4_SOBRE_ATRIBUCION_DESPACHO",
    });
    expect(await lineasDeGuia(`${P}-G11a`)).toBe(0);
    await registrar(fila, `${P}-G11b`); // con lo que mide (0,5), entra
    expect(await lineasDeGuia(`${P}-G11b`)).toBe(1);
  }, 60_000);

  it("una corrida que despachó TODOS sus paquetes no vuelve como corrida sin paquetes", async () => {
    const a = codigo("A");
    /* Dato viejo: la corrida declara 1,2 y su único paquete 1. Tras despacharlo
       le quedan 0,2 en el libro, pero ningún bulto en la pila. */
    const c = await corrida(TABLA, [{ codigo: a, volumenM3: 1 }], 1.2);
    await registrar((await selector()).find((f) => f.codigo === a)!, `${P}-G8`);
    expect((await disponibles()).some((x) => x.id === c.id)).toBe(false);
    expect((await selector()).some((f) => f.corridaId === c.id)).toBe(false);
  }, 60_000);
});
