/**
 * Guía del Libro TH → Libro CTP (28-09-2026) contra la base REAL, en el tenant
 * de pruebas `main` (tiene los dos libros y RUC en su Ficha del CTP). Blas no
 * se toca.
 *
 * El recorrido de Brandon, sin pantalla: se tala y se troza en el TH, se
 * despacha con guía (`despacharConGuia`, el mismo que usa el POST), la guía
 * pasa al CTP como guardada, y «Recibir» la registra con sus trozas.
 *
 *   · destinatario = este negocio → pasa; otra empresa → no pasa;
 *   · idempotente por N° (tramo a tramo);
 *   · anular en el TH antes de recibir → la guardada se da de baja;
 *   · recibir → un ingreso por especie con LAS MISMAS trozas y m³, recibido;
 *   · anular en el TH después de recibir → 409 y NO se liberan las trozas;
 *   · (revisión 28-09) la misma guía escrita «0…» ya en el libro → no se
 *     recibe otra vez; dos «Recibir» a la vez → entra uno; troza sin volumen
 *     → no recibible; anular en el TH mientras se recibe → no entra a medias.
 *
 * Todo lleva el prefijo `TEST-THCTP-` y se purga antes y después.
 *
 *   node --env-file=.env.local node_modules/.bin/vitest run __tests__/forestal-guia-th-al-ctp-db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.AUDIT_CHAIN_ENABLED ??= "false";

import { prisma } from "@/lib/prisma";
import { limaDateKey } from "@/lib/utils";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { GuiasGuardadasDB } from "@/lib/db/guias-guardadas.db";
import { GuiaThAlCtpDB, GuiaThError } from "@/lib/db/guia-th-al-ctp.db";
import { GtfNumeroDB, GuiaYaEnElCtpError } from "@/lib/db/gtf-numero.db";
import { ForestGtfDB } from "@/lib/db/forest-gtf.db";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { gtfDatosVacio } from "@/lib/forestal/ctp-gtf-datos";

const T = "main";
const PREFIJO = "TEST-THCTP-";
const runId = Math.random().toString(36).slice(2, 7);
const P = `${PREFIJO}${runId}`;
/** Especies propias: T6 suma lo movilizado por especie en todo el tenant. */
const TOR = `THCTP Tornillo ${runId}`;
const CAP = `THCTP Capirona ${runId}`;
/** Serie propia: el N° no choca con ninguna guía del tenant. */
const SERIE = `9${Math.floor(10000 + Math.random() * 89999)}-001`;
const hoy = limaDateKey();

async function purgar() {
  const entradas = await prisma.woodEntry.findMany({
    where: { tenantId: T, createdBy: { startsWith: PREFIJO } },
    select: { id: true },
  });
  if (entradas.length > 0) {
    await prisma.woodEntryTroza.deleteMany({ where: { tenantId: T, woodEntryId: { in: entradas.map((e) => e.id) } } });
    await prisma.woodEntry.deleteMany({ where: { tenantId: T, id: { in: entradas.map((e) => e.id) } } });
  }
  await prisma.forestGuiaGuardada.deleteMany({ where: { tenantId: T, createdBy: { startsWith: PREFIJO } } });
  await prisma.forestGtf.deleteMany({ where: { tenantId: T, createdBy: { startsWith: PREFIJO } } });
  await prisma.forestLothEntry.deleteMany({ where: { tenantId: T, createdBy: { startsWith: PREFIJO } } });
  /* La carpeta del titular (ADR-442) y todo lo que cuelga de ella. */
  const raices = await prisma.documentFolder.findMany({
    where: { tenantId: T, name: { startsWith: PREFIJO } },
    select: { id: true },
  });
  let nivel = raices.map((r) => r.id);
  const todas = [...nivel];
  while (nivel.length > 0) {
    const hijos = await prisma.documentFolder.findMany({ where: { tenantId: T, parentId: { in: nivel } }, select: { id: true } });
    nivel = hijos.map((h) => h.id);
    todas.push(...nivel);
  }
  if (todas.length > 0) await prisma.documentFolder.deleteMany({ where: { tenantId: T, id: { in: todas } } });
  await prisma.activityLog.deleteMany({ where: { tenantId: T, user: { startsWith: PREFIJO } } });
}

const HAS_DB: boolean = await prisma
  .$queryRaw`SELECT 1`
  .then(() => prisma.tenant.count({ where: { id: T } }))
  .then((n) => n === 1)
  .catch(() => false);
const RUC = HAS_DB ? ((await GuiaThAlCtpDB.rucPropio(T)).ruc ?? "") : "";

beforeAll(async () => {
  if (HAS_DB) await purgar();
}, 60_000);

afterAll(async () => {
  if (!HAS_DB) return;
  try {
    await purgar();
  } catch (err) {
    console.error(`\n🔴 LA LIMPIEZA FALLÓ — quedan datos ${PREFIJO} en main.\n`, err);
  }
}, 60_000);

let correlativo = 0;

/** Tala + trozado + «Despachar con guía» en el Libro TH. Devuelve la guía y las trozas del Trozado. */
async function emitir(rucDestino: string, piezas: { especie: string; d1: number; d2: number; l: number; m3: number | null }[]) {
  const n = ++correlativo;
  const arbol = `${P}-A${n}`;
  const total = piezas.reduce((a, p) => a + (p.m3 ?? 0), 0);
  for (const especie of new Set(piezas.map((p) => p.especie))) {
    await ForestLothDB.create(T, {
      section: "tala",
      treeCode: `${arbol}-${especie.split(" ")[1]}`,
      speciesCommon: especie,
      volumeM3: total + 1,
      entryDate: new Date(`${hoy}T12:00:00.000Z`),
      createdBy: P,
    });
  }
  const codigos: string[] = [];
  for (const [i, p] of piezas.entries()) {
    const codigo = `${arbol}-T${i + 1}`;
    codigos.push(codigo);
    await ForestLothDB.create(T, {
      section: "trozado",
      treeCode: `${arbol}-${p.especie.split(" ")[1]}`,
      trozaCode: codigo,
      speciesCommon: p.especie,
      diamMayorM: p.d1,
      diamMenorM: p.d2,
      lengthM: p.l,
      volumeM3: p.m3,
      entryDate: new Date(`${hoy}T12:00:00.000Z`),
      createdBy: P,
    });
  }
  const datos = gtfDatosVacio();
  datos.destinatario = { ...datos.destinatario, nombre: `${P} Destino`, docTipo: "RUC", docNumero: rucDestino };
  datos.propietario = { ...datos.propietario, nombre: `${P} Titular`, docTipo: "RUC", docNumero: "20100000999", esElCtp: true };
  datos.titulos = [`${P}-PERM`];
  const r = await ForestLothDB.despacharConGuia(T, {
    gtfNumber: `${SERIE}-${String(n).padStart(7, "0")}`,
    gtfDate: new Date(`${hoy}T00:00:00.000Z`),
    trozaCodes: codigos,
    gtfDatos: datos,
    titularName: `${P} Titular`,
    createdBy: P,
  });
  return { gtf: r.gtf, codigos };
}

describe.skipIf(!HAS_DB || RUC.length !== 11)("Libro TH → Libro CTP (base real, tenant main)", () => {
  let recibible: { gtfId: string; gtfNumber: string; guardadaId: string; codigos: string[] } | null = null;

  it("con destinatario propio la guía queda guardada en el CTP, enlazada a la del TH", async () => {
    const { gtf, codigos } = await emitir(RUC, [
      { especie: TOR, d1: 0.62, d2: 0.55, l: 4.2, m3: 1.1275 },
      { especie: CAP, d1: 0.48, d2: 0.44, l: 3.8, m3: 0.6315 },
      { especie: TOR, d1: 0.55, d2: 0.5, l: 3.5, m3: 0.7568 },
    ]);
    const pase = await GuiaThAlCtpDB.pasarAlCtp(T, gtf.id, P);
    expect(pase.estado).toBe("creada");
    expect(pase.guardadaId).toBeTruthy();
    const vista = await GuiasGuardadasDB.obtener(T, pase.guardadaId as string);
    expect(vista?.gtfNumber).toBe(gtf.gtfNumber);
    expect(vista?.ingreso).toBeNull();
    expect(vista?.libroTh).toMatchObject({ gtfId: gtf.id, estado: "emitida", trozas: 3, destinoPropio: true, recibible: true });
    recibible = { gtfId: gtf.id, gtfNumber: gtf.gtfNumber, guardadaId: pase.guardadaId as string, codigos };
  }, 120_000);

  it("es idempotente por N°: pasarla otra vez no crea otra, y el N° escrito sin ceros es la misma", async () => {
    if (!recibible) throw new Error("falta la guía del primer caso");
    const otra = await GuiaThAlCtpDB.pasarAlCtp(T, recibible.gtfId, P);
    expect(otra).toMatchObject({ estado: "ya_estaba", guardadaId: recibible.guardadaId });
    const sinCeros = recibible.gtfNumber.replace(/-0+(\d+)$/, "-$1");
    expect(sinCeros).not.toBe(recibible.gtfNumber);
    expect((await GuiasGuardadasDB.porNumeroGtf(T, sinCeros))?.id).toBe(recibible.guardadaId);
    const vivas = await prisma.forestGuiaGuardada.count({
      where: { tenantId: T, deletedAt: null, gtfNumber: recibible.gtfNumber },
    });
    expect(vivas).toBe(1);
  }, 60_000);

  it("con destinatario de otra empresa no pasa nada al CTP", async () => {
    const { gtf } = await emitir("20100000001", [{ especie: TOR, d1: 0.5, d2: 0.45, l: 3, m3: 0.5301 }]);
    const pase = await GuiaThAlCtpDB.pasarAlCtp(T, gtf.id, P);
    expect(pase.estado).toBe("otra_empresa");
    expect(pase.mensaje).toContain("20100000001");
    expect(await GuiasGuardadasDB.porNumeroGtf(T, gtf.gtfNumber)).toBeNull();
  }, 120_000);

  it("anular la guía en el TH antes de recibirla da de baja la guardada", async () => {
    const { gtf } = await emitir(RUC, [{ especie: CAP, d1: 0.46, d2: 0.42, l: 3.2, m3: 0.4862 }]);
    const pase = await GuiaThAlCtpDB.pasarAlCtp(T, gtf.id, P);
    expect(pase.estado).toBe("creada");
    await ForestLothDB.anularGuiaConDespachos(T, gtf.id, "prueba de anulación", P);
    const baja = await GuiaThAlCtpDB.alAnular(T, gtf, "prueba de anulación", P);
    expect(baja.estado).toBe("anulada");
    const fila = await prisma.forestGuiaGuardada.findFirst({ where: { tenantId: T, id: pase.guardadaId } });
    expect(fila?.deletedAt).not.toBeNull();
  }, 120_000);

  it("recibir crea un ingreso por especie con LAS MISMAS trozas y m³, recibido el día que se dice", async () => {
    if (!recibible) throw new Error("falta la guía del primer caso");
    const prep = await GuiaThAlCtpDB.preparar(T, recibible.guardadaId);
    expect(prep?.totalM3).toBe(2.5158);
    expect(prep?.lineas.map((l) => [l.especieComun, l.trozas.length])).toEqual([
      [TOR, 2],
      [CAP, 1],
    ]);

    const r = await GuiaThAlCtpDB.recibir(T, recibible.guardadaId, { fechaLlegada: hoy }, P);
    expect(r?.recibida).toBe(true);
    expect(r?.motivoSinRecibir).toBeNull();
    expect(r?.ingresos).toHaveLength(2);

    const ingresos = await prisma.woodEntry.findMany({
      where: { tenantId: T, gtfNumber: recibible.gtfNumber, deletedAt: null },
      include: { trozas: { orderBy: { orden: "asc" } } },
      orderBy: { libroNro: "asc" },
    });
    expect(ingresos.map((e) => [e.speciesCommonName, Number(e.volumeM3), e.pieces, e.status])).toEqual([
      [TOR, 1.8843, 2, "validado"],
      [CAP, 0.6315, 1, "validado"],
    ]);
    expect(ingresos.every((e) => e.fechaRecepcion?.toISOString().slice(0, 10) === hoy)).toBe(true);
    expect(ingresos.every((e) => e.serforGtf == null && e.originCode === `${P}-PERM`)).toBe(true);

    const trozas = ingresos.flatMap((e) => e.trozas);
    const delTrozado = await prisma.forestLothEntry.findMany({
      where: { tenantId: T, section: "trozado", trozaCode: { in: recibible.codigos } },
    });
    expect(trozas.map((t) => t.codificacion).sort()).toEqual([...recibible.codigos].sort());
    for (const t of trozas) {
      const origen = delTrozado.find((d) => d.trozaCode === t.codificacion);
      expect(Number(t.volumenM3)).toBe(Number(origen?.volumeM3));
      expect(Number(t.d1Cm)).toBe(Math.round(Number(origen?.diamMayorM) * 1000) / 10);
      expect(Number(t.d2Cm)).toBe(Math.round(Number(origen?.diamMenorM) * 1000) / 10);
      expect(Number(t.largoM)).toBe(Number(origen?.lengthM));
      expect(t.fechaRecepcion?.toISOString().slice(0, 10)).toBe(hoy);
    }

    const vista = await GuiasGuardadasDB.obtener(T, recibible.guardadaId);
    expect(vista?.ingreso?.asientos).toBe(2);
    /* El camino REAL del alta desde SERFOR manda el N° de registro: el ingreso
       recibido del TH no lo tiene, y aun así es la misma guía (escrita «0…»). */
    await expect(
      WoodEntriesDB.createDesdeGtfSerfor(T, {
        gtfNumber: `0${recibible.gtfNumber}`,
        serforNumeroRegistro: "1-19-0999999",
        providerName: `${P} Titular`,
        entryDate: new Date(`${hoy}T12:00:00.000Z`),
        lineas: [{ especieComun: TOR, especieCientifica: null, volumenM3: 1.8843, piezas: 2, trozas: [] }],
        createdBy: P,
      }),
    ).rejects.toMatchObject({ code: "GTF_DUPLICADA" });
    /* Recibirla dos veces no duplica el saldo. */
    await expect(GuiaThAlCtpDB.recibir(T, recibible.guardadaId, { fechaLlegada: hoy }, P)).rejects.toBeInstanceOf(GuiaThError);
    expect(await prisma.woodEntry.count({ where: { tenantId: T, gtfNumber: recibible.gtfNumber, deletedAt: null } })).toBe(2);
  }, 180_000);

  it("anular en el TH una guía ya recibida da 409 y NO libera sus trozas ni toca el ingreso", async () => {
    if (!recibible) throw new Error("falta la guía del primer caso");
    const rg = recibible;
    const intento = ForestLothDB.anularGuiaConDespachos(T, rg.gtfId, "prueba", P);
    await expect(intento).rejects.toBeInstanceOf(GuiaYaEnElCtpError);
    await expect(ForestLothDB.anularGuiaConDespachos(T, rg.gtfId, "prueba", P)).rejects.toThrow(
      /ya entró a tu Libro CTP como ingresos N° \d+–\d+\. Anúlalos allá primero/,
    );
    /* El otro camino de anular (sólo el papel) frena igual. */
    await expect(ForestGtfDB.annul(T, rg.gtfId, "prueba", P)).rejects.toBeInstanceOf(GuiaYaEnElCtpError);
    /* Y anular o borrar UNA línea de su despacho (liberaría esa troza) también. */
    const linea = await prisma.forestLothEntry.findFirst({
      where: { tenantId: T, section: "despacho_troza", gtfNumber: rg.gtfNumber, status: "registrado" },
      select: { id: true },
    });
    await expect(ForestLothDB.annul(T, linea?.id as string, "prueba", P)).rejects.toBeInstanceOf(GuiaYaEnElCtpError);
    await expect(ForestLothDB.softDelete(T, linea?.id as string, P)).rejects.toBeInstanceOf(GuiaYaEnElCtpError);
    const th = await prisma.forestGtf.findFirst({ where: { tenantId: T, id: rg.gtfId } });
    expect(th?.status).toBe("emitida");
    const despachos = await prisma.forestLothEntry.count({
      where: { tenantId: T, section: "despacho_troza", gtfNumber: rg.gtfNumber, status: "registrado" },
    });
    expect(despachos).toBe(3);
    const vivos = await prisma.woodEntry.count({
      where: { tenantId: T, gtfNumber: rg.gtfNumber, deletedAt: null, status: "validado" },
    });
    expect(vivos).toBe(2);
    const guardada = await prisma.forestGuiaGuardada.findFirst({ where: { tenantId: T, id: rg.guardadaId } });
    expect(guardada?.deletedAt).toBeNull();
  }, 90_000);

  it("otro negocio no ve ni recibe la guardada (el tenant va en el WHERE)", async () => {
    if (!recibible) throw new Error("falta la guía del primer caso");
    const ajeno = "cmtqtncxz001vs8vze4o3y7j9";
    expect(await GuiasGuardadasDB.obtener(ajeno, recibible.guardadaId)).toBeNull();
    expect(await GuiaThAlCtpDB.preparar(ajeno, recibible.guardadaId)).toBeNull();
    expect(await GuiaThAlCtpDB.recibir(ajeno, recibible.guardadaId, { fechaLlegada: hoy }, P)).toBeNull();
    const pase = await GuiaThAlCtpDB.pasarAlCtp(ajeno, recibible.gtfId, P);
    expect(pase.estado).toBe("error");
  }, 60_000);
  it("la misma guía ya en el libro escrita «0…» (como SERFOR) no se recibe otra vez", async () => {
    const { gtf } = await emitir(RUC, [{ especie: TOR, d1: 0.5, d2: 0.45, l: 3, m3: 0.5301 }]);
    const pase = await GuiaThAlCtpDB.pasarAlCtp(T, gtf.id, P);
    expect(pase.estado).toBe("creada");
    const comoSerfor = `0${gtf.gtfNumber}`;
    const linea = { especieComun: TOR, especieCientifica: null, volumenM3: 0.5301, piezas: 1, trozas: [] };
    await WoodEntriesDB.createDesdeGtfSerfor(T, {
      gtfNumber: comoSerfor,
      providerName: `${P} Titular`,
      entryDate: new Date(`${hoy}T12:00:00.000Z`),
      lineas: [linea],
      createdBy: P,
    });
    const deLaGuia = { tenantId: T, deletedAt: null, gtfNumber: { in: [gtf.gtfNumber, comoSerfor] } };
    expect(await prisma.woodEntry.count({ where: deLaGuia })).toBe(1);
    await expect(GuiaThAlCtpDB.recibir(T, pase.guardadaId as string, { fechaLlegada: hoy }, P)).rejects.toMatchObject({
      code: "YA_INGRESADA",
    });
    /* El control de duplicado del alta también compara tramo a tramo. */
    await expect(
      WoodEntriesDB.createDesdeGtfSerfor(T, {
        gtfNumber: gtf.gtfNumber,
        providerName: `${P} Titular`,
        entryDate: new Date(`${hoy}T12:00:00.000Z`),
        lineas: [linea],
        createdBy: P,
      }),
    ).rejects.toMatchObject({ code: "GTF_DUPLICADA" });
    expect(await prisma.woodEntry.count({ where: deLaGuia })).toBe(1);
    await expect(ForestLothDB.anularGuiaConDespachos(T, gtf.id, "prueba", P)).rejects.toBeInstanceOf(GuiaYaEnElCtpError);
  }, 180_000);

  it("dos «Recibir» a la vez: entra uno solo", async () => {
    const { gtf } = await emitir(RUC, [{ especie: CAP, d1: 0.44, d2: 0.4, l: 3, m3: 0.4152 }]);
    const pase = await GuiaThAlCtpDB.pasarAlCtp(T, gtf.id, P);
    const id = pase.guardadaId as string;
    const rs = await Promise.allSettled([
      GuiaThAlCtpDB.recibir(T, id, { fechaLlegada: hoy }, P),
      GuiaThAlCtpDB.recibir(T, id, { fechaLlegada: hoy }, P),
    ]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const no = rs.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(no.reason).toBeInstanceOf(GuiaThError);
    expect((no.reason as GuiaThError).code).toBe("YA_INGRESADA");
    expect(await prisma.woodEntry.count({ where: { tenantId: T, deletedAt: null, gtfNumber: gtf.gtfNumber } })).toBe(1);
    expect(await prisma.woodEntryTroza.count({ where: { tenantId: T, entry: { gtfNumber: gtf.gtfNumber, deletedAt: null } } })).toBe(1);
  }, 180_000);

  it("una troza sin volumen deja la guía NO recibible, con el camino (la lista es una foto)", async () => {
    const { gtf } = await emitir(RUC, [
      { especie: TOR, d1: 0.5, d2: 0.45, l: 3, m3: 0.5301 },
      { especie: TOR, d1: 0.48, d2: 0.44, l: 2.5, m3: null },
    ]);
    const pase = await GuiaThAlCtpDB.pasarAlCtp(T, gtf.id, P);
    const vista = await GuiasGuardadasDB.obtener(T, pase.guardadaId as string);
    expect(vista?.libroTh?.recibible).toBe(false);
    expect(vista?.libroTh?.motivo).toContain("anúlala y emítela de nuevo con el volumen, o ingrésala a mano");
    await expect(GuiaThAlCtpDB.preparar(T, pase.guardadaId as string)).rejects.toMatchObject({
      code: "GUIA_INCOMPLETA",
      status: 422,
    });
  }, 180_000);

  it("anular en el TH mientras se recibe: o entra entera y el TH no se anula, o no entra nada", async () => {
    const { gtf } = await emitir(RUC, [{ especie: CAP, d1: 0.42, d2: 0.4, l: 2.8, m3: 0.3697 }]);
    const pase = await GuiaThAlCtpDB.pasarAlCtp(T, gtf.id, P);
    const [recibo, anulo] = await Promise.allSettled([
      GuiaThAlCtpDB.recibir(T, pase.guardadaId as string, { fechaLlegada: hoy }, P),
      ForestLothDB.anularGuiaConDespachos(T, gtf.id, "prueba de carrera", P),
    ]);
    const ingresos = await prisma.woodEntry.count({ where: { tenantId: T, deletedAt: null, gtfNumber: gtf.gtfNumber } });
    const th = await prisma.forestGtf.findFirst({ where: { tenantId: T, id: gtf.id } });
    expect([recibo.status, anulo.status].filter((x) => x === "fulfilled")).toHaveLength(1);
    if (anulo.status === "fulfilled") {
      expect(ingresos).toBe(0);
      expect(th?.status).toBe("anulada");
      expect((recibo as PromiseRejectedResult).reason).toBeInstanceOf(GuiaThError);
    } else {
      expect(anulo.reason).toBeInstanceOf(GuiaYaEnElCtpError);
      expect(ingresos).toBe(1);
      expect(th?.status).toBe("emitida");
    }
  }, 180_000);
  it("otro ingreso con el mismo N° pero OTRO permiso no traba anular en el TH", async () => {
    const { gtf } = await emitir(RUC, [{ especie: TOR, d1: 0.47, d2: 0.43, l: 2.9, m3: 0.4611 }]);
    await WoodEntriesDB.createDesdeGtfSerfor(T, {
      gtfNumber: `0${gtf.gtfNumber}`,
      providerName: `${P} Otro titular`,
      originCode: `${P}-OTRO-PERMISO`,
      entryDate: new Date(`${hoy}T12:00:00.000Z`),
      lineas: [{ especieComun: TOR, especieCientifica: null, volumenM3: 0.4611, piezas: 1, trozas: [] }],
      createdBy: P,
    });
    const r = await ForestLothDB.anularGuiaConDespachos(T, gtf.id, "prueba: otra guía con el mismo N°", P);
    expect(r?.gtf.status).toBe("anulada");
  }, 180_000);

  it("el freno por código de troza mira la misma especie (y el mismo permiso)", async () => {
    const codigo = `${P}-COD-REPETIDO`;
    await WoodEntriesDB.createDesdeGtfSerfor(T, {
      gtfNumber: `${SERIE}-8888888`,
      providerName: `${P} Titular`,
      originCode: `${P}-PERM`,
      entryDate: new Date(`${hoy}T12:00:00.000Z`),
      lineas: [
        {
          especieComun: CAP,
          especieCientifica: null,
          volumenM3: 0.5,
          piezas: 1,
          trozas: [
            { orden: 1, codificacion: codigo, especieComun: CAP, especieCientifica: null, dimensiones: null, largoM: 3, diametroCm: 45, d1Cm: 46, d2Cm: 44, cantidad: 1, volumenM3: 0.5 },
          ],
        },
      ],
      createdBy: P,
    });
    expect(await GtfNumeroDB.trozasYaEnElLibro(prisma, T, [{ codificacion: codigo, especie: CAP }], `${P}-PERM`)).toHaveLength(1);
    expect(await GtfNumeroDB.trozasYaEnElLibro(prisma, T, [{ codificacion: codigo, especie: TOR }], `${P}-PERM`)).toHaveLength(0);
    expect(await GtfNumeroDB.trozasYaEnElLibro(prisma, T, [{ codificacion: codigo, especie: CAP }], `${P}-OTRO`)).toHaveLength(0);
    expect(await GtfNumeroDB.trozasYaEnElLibro(prisma, T, [{ codificacion: codigo, especie: CAP }], null)).toHaveLength(1);
  }, 120_000);
});
