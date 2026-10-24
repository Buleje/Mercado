/**
 * ADR-446 · «Guías sin registrar» contra la base REAL, en el tenant de pruebas
 * forestal (`inversiones-agroforestales-blas-sociedad-op-qa-ui`). Blas no se toca.
 *
 * El escenario chico de Blas en miniatura: 1 corrida del inventario marcada
 * «usado», con 2 paquetes de MONTÓN (comercial y paquetería corta), y 2
 * anexos de guías distintas que salen de los mismos montones. Se registran los
 * dos y se mira lo que dice el ADR: atómico, parte el montón, idempotente,
 * I3/I4 con `≤`, el cierre bloquea, WASACO sin precio, anexo enlazado, el
 * resto vuelve al patio.
 *
 * Todo lleva el prefijo `TEST-A446-` (líneas, paquetes, auditoría y anexos del
 * KV) y se purga antes y después.
 *
 *   node --env-file=.env.local node_modules/.bin/vitest run __tests__/forestal-guia-desde-anexo-db.test.ts
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.AUDIT_CHAIN_ENABLED ??= "false";

import { prisma } from "@/lib/prisma";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { ForestCtpCierreDB } from "@/lib/db/forest-ctp-cierre.db";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";
import { ForestAnexosDB, claveAnexos, normalizarAnexos } from "@/lib/db/forest-anexos.db";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { ForestCtpGuiaDesdeAnexoDB } from "@/lib/db/forest-ctp-guia-desde-anexo.db";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { CtpCierrePeriodo } from "@/lib/forestal/ctp-cierre-types";

const T = "cmtqtncxz001vs8vze4o3y7j9"; // …-op-qa-ui
const PREFIJO = "TEST-A446-";
const runId = Math.random().toString(36).slice(2, 7);
const P = `${PREFIJO}${runId}`;
/** Especie propia: I3 agrega por producto + especie y no ve la madera de nadie más. */
const ESPECIE = `A446 ${runId}`;
const COMERCIAL = "MADERA ASERRADA (COMERCIAL)";
const PAQ_CORTA = "MADERA ASERRADA (PAQUETERIA CORTA)";

async function purgar() {
  const linea = { tenantId: T, createdBy: { startsWith: PREFIJO } };
  await prisma.forestCtpDespachoOrigen.deleteMany({
    where: { tenantId: T, OR: [{ despacho: linea }, { produccion: linea }, { createdBy: { startsWith: PREFIJO } }] },
  });
  await prisma.forestCtpPaquete.deleteMany({ where: { tenantId: T, codigo: { startsWith: PREFIJO } } });
  await prisma.forestCtpEntry.deleteMany({ where: linea });
  await prisma.activityLog.deleteMany({ where: { tenantId: T, user: { startsWith: PREFIJO } } });
  await PlatformSettingsDB.actualizar<unknown, null>(claveAnexos(T), (actual) => {
    const lista = normalizarAnexos(actual);
    const quedan = lista.filter((a) => !a.numero.startsWith(PREFIJO));
    return quedan.length === lista.length ? { resultado: null } : { valor: quedan, resultado: null };
  });
}

const HAS_DB: boolean = await prisma
  .$queryRaw`SELECT 1`
  .then(() => prisma.tenant.count({ where: { id: T } }))
  .then((n) => n === 1)
  .catch(() => false);

beforeAll(async () => {
  if (HAS_DB) await purgar();
}, 60_000);

afterAll(async () => {
  if (!HAS_DB) return;
  try {
    await purgar();
  } catch (err) {
    console.error(`\n🔴 LA LIMPIEZA FALLÓ — quedan datos ${PREFIJO} en op-qa-ui.\n`, err);
    throw err;
  }
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

let n = 0;
const gtf = () => `19-446-${runId}${String(++n).padStart(4, "0")}`;

/** Una fila de anexo con su m³ y pt calculados como los calcula el cubicador. */
function fila(cantidad: number, espesor: number, ancho: number, largo: number): PiezaCubicada {
  const base = { cantidad, espesor, ancho, largo, uEspesor: "pulg" as const, uAncho: "pulg" as const, uLargo: "pies" as const };
  return { id: `p${++n}`, ...base, especie: ESPECIE, ...cubicarPieza(base) };
}
const comercial = (pz: number) => fila(pz, 2, 8, 10); // 13,33 pt c/u
const paqCorta = (pz: number) => fila(pz, 6, 6, 4); // 12 pt c/u
const tabla = (pz: number) => fila(pz, 1, 4, 8);

async function anexo(numero: string, guia: string, fecha: string, piezas: PiezaCubicada[]) {
  return ForestAnexosDB.save(
    T,
    {
      fecha,
      datos: { numero: `${P}-${numero}`, gtf: guia, empresa: "QA", firmante: "QA", documento: "", cargo: "", observaciones: "", unidadV: "pt", modo: "oficial" },
      piezas,
    },
    P,
  );
}

/** La corrida del inventario: dos montones y marcada «usado», de WASACO. */
async function inventario(fecha = "2026-08-01") {
  const raiz = `${P}-${++n}`;
  const c = await ForestCtpDB.create(T, {
    section: "produccion",
    entryDate: new Date(`${fecha}T17:00:00.000Z`),
    speciesCommon: ESPECIE,
    productType: COMERCIAL,
    volumeInputM3: 20,
    quantity: 10.5,
    unit: "m3",
    duenoMadera: "tercero",
    titularNombre: "WASACO QA",
    createdBy: P,
    paquetes: [
      { codigo: `${raiz}-COM`, cantidad: 0, volumenM3: 6, productType: COMERCIAL },
      { codigo: `${raiz}-PQC`, cantidad: 0, volumenM3: 4.5, productType: PAQ_CORTA },
    ],
  });
  await ForestCtpDB.marcarUsado(T, c.id, { usado: true, motivo: "Salió sin guía (QA)", user: P });
  return Object.assign(c, { raiz });
}

const paquetesDe = (corridaId: string) =>
  prisma.forestCtpPaquete.findMany({
    where: { tenantId: T, ctpEntryId: corridaId, deletedAt: null },
    orderBy: { codigo: "asc" },
    select: { codigo: true, volumenM3: true, cantidad: true },
  });

const lineasDeGuia = (g: string) =>
  prisma.forestCtpEntry.findMany({
    where: { tenantId: T, section: "despacho", gtfNumber: g, deletedAt: null, status: "registrado" },
    include: { origenes: true },
    orderBy: { lineNo: "asc" },
  });

describe.skipIf(!HAS_DB)("ADR-446 · registrar guías desde su Anexo 04 (op-qa-ui)", () => {
  it(
    "2 anexos que comparten montones: se registran, se parten, quedan enlazados y el resto vuelve al patio",
    async () => {
      const k1 = await inventario();
      const gA = gtf();
      const gB = gtf();
      const a = await anexo("A", gA, "2026-08-07", [comercial(90), paqCorta(100)]);
      const b = await anexo("B", gB, "2026-08-18", [comercial(60), paqCorta(40), tabla(30)]);

      /* La propuesta de la tanda antes de escribir. */
      const sim = await ForestCtpGuiaDesdeAnexoDB.simularTanda(T, [{ anexoId: a.id }, { anexoId: b.id }]);
      expect(sim.tanda.guias.map((g) => g.gtf)).toEqual([gA, gB]);
      expect(sim.tanda.guias.every((g) => g.registrable)).toBe(true);

      const r = await ForestCtpGuiaDesdeAnexoDB.registrarTanda(T, [{ anexoId: b.id }, { anexoId: a.id }], { user: P });
      expect(r.resumen).toMatchObject({ registradas: 2, errores: 0, bloqueadas: 0 });
      // Se registran en el orden de la tanda (la más vieja primero), aunque se pidan al revés.
      expect(r.guias.map((g) => g.gtf)).toEqual([gA, gB]);

      const lA = await lineasDeGuia(gA);
      const lB = await lineasDeGuia(gB);
      expect(lA).toHaveLength(2);
      expect(lB).toHaveLength(3);

      /* I4 ≤ en cada línea, y la de Tabla (sin producción de ese tipo) sin origen. */
      for (const l of [...lA, ...lB]) {
        const atrib = l.origenes.reduce((s, o) => s + Number(o.quantity), 0);
        expect(atrib).toBeLessThanOrEqual(Number(l.quantity) + 1e-9);
        // WASACO es servicio: sin precio de venta, nunca 0.
        expect(l.valorVenta).toBeNull();
        expect(l.docType).toBe("GTF");
      }
      const tablaB = lB.find((l) => l.productType === "MADERA ASERRADA (TABLA)")!;
      expect(tablaB.origenes).toHaveLength(0);
      expect(Number(tablaB.quantity)).toBeCloseTo(0.1887, 4);
      const conOrigen = [...lA, ...lB].filter((l) => l.origenes.length > 0);
      expect(conOrigen.every((l) => l.duenoMadera === "tercero" && l.titularNombre === "WASACO QA")).toBe(true);

      /* Los montones se partieron: lo salido conserva el código, el resto va a -R<n>. Σ = la corrida. */
      const paq = await paquetesDe(k1.id);
      const R = k1.raiz;
      expect(paq.map((p) => p.codigo)).toEqual([
        `${R}-COM`, `${R}-COM-R1`, `${R}-COM-R2`, `${R}-PQC`, `${R}-PQC-R1`, `${R}-PQC-R2`,
      ]);
      expect(paq.reduce((s, p) => s + Number(p.volumenM3), 0)).toBeCloseTo(10.5, 4);
      expect(lA.map((l) => l.codigoProducto).sort()).toEqual([`${R}-COM`, `${R}-PQC`]);
      expect(lB.filter((l) => l.codigoProducto).map((l) => l.codigoProducto).sort()).toEqual([`${R}-COM-R1`, `${R}-PQC-R1`]);

      /* El anexo queda atado a sus líneas. */
      const bandeja = await ForestAnexosDB.list(T);
      expect(bandeja.find((x) => x.id === a.id)?.despachoIds?.sort()).toEqual(lA.map((l) => l.id).sort());
      expect(bandeja.find((x) => x.id === b.id)?.despachoIds).toHaveLength(3);

      /* El resto de la corrida «usado» vuelve a Productos disponibles, con los dos restos y nada más. */
      expect(r.liberadas.map((u) => u.corridaId)).toEqual([k1.id]);
      const disp = (await ForestCtpDB.productosDisponibles(T, { especie: ESPECIE })).corridas;
      expect(disp).toHaveLength(1);
      expect(disp[0].disponible).toBeCloseTo(1.8207, 3);
      expect(disp[0].paquetes.map((p) => p.codigo).sort()).toEqual([`${R}-COM-R2`, `${R}-PQC-R2`]);

      /* Idempotente: la misma tanda otra vez no crea nada. */
      const otra = await ForestCtpGuiaDesdeAnexoDB.registrarTanda(T, [{ anexoId: a.id }, { anexoId: b.id }], { user: P });
      expect(otra.resumen).toMatchObject({ registradas: 0, yaRegistradas: 2 });
      expect(await lineasDeGuia(gA)).toHaveLength(2);

      /* Un anexo con salida en el libro no se borra de la bandeja. */
      await expect(ForestAnexosDB.remove(T, a.id, P)).rejects.toBeInstanceOf(CtpInvariantError);

      /* Ni se edita: sus líneas dicen lo que decía el papel al registrarlo. */
      await expect(
        ForestAnexosDB.save(T, {
          id: a.id,
          fecha: "2026-08-07",
          datos: { numero: a.numero, gtf: a.gtf, empresa: "QA", firmante: "QA", documento: "", cargo: "", observaciones: "corregida", unidadV: "pt", modo: "oficial" },
          piezas: a.piezas,
        }, P),
      ).rejects.toMatchObject({ code: "ANEXO_REGISTRADO" });
      expect((await ForestAnexosDB.list(T)).find((x) => x.id === a.id)?.despachoIds).toHaveLength(2);

      /* Un reintento que vuelve «ya registrada» igual libera: si la corrida
         volvió a quedar «usado» (el cierre de una tanda anterior no llegó a
         correr), la siguiente la suelta. */
      await ForestCtpDB.marcarUsado(T, k1.id, { usado: true, motivo: "QA: la liberación no corrió", user: P });
      const reintento = await ForestCtpGuiaDesdeAnexoDB.registrarTanda(T, [{ anexoId: a.id }], { user: P });
      expect(reintento.resumen).toMatchObject({ registradas: 0, yaRegistradas: 1 });
      expect(reintento.liberadas.map((u) => u.corridaId)).toEqual([k1.id]);
    },
    180_000,
  );

  it(
    "dos pestañas registran la misma guía a la vez: entra una vez",
    async () => {
      await inventario();
      const g = gtf();
      const c = await anexo("C", g, "2026-08-20", [comercial(10)]);
      const [x, y] = await Promise.all([
        ForestCtpGuiaDesdeAnexoDB.registrarGuia(T, c.id, { user: P }),
        ForestCtpGuiaDesdeAnexoDB.registrarGuia(T, c.id, { user: P }),
      ]);
      /* Una entra; la otra, según cuándo llega: «otra tanda en curso» (llegó
         DURANTE, la bandeja se toma sin esperar) o «ya registrada» (DESPUÉS). */
      const estados = [x.guias[0], y.guias[0]];
      expect(estados.filter((e) => e.estado === "registrada")).toHaveLength(1);
      const otra = estados.find((e) => e.estado !== "registrada")!;
      expect(otra.estado === "ya_registrada" || (otra.estado === "error" && otra.codigo === "TANDA_EN_CURSO")).toBe(true);
      expect(await lineasDeGuia(g)).toHaveLength(1);
    },
    180_000,
  );

  it(
    "todo o nada: si una línea falla, no queda ni la otra, ni el montón partido, ni el vínculo",
    async () => {
      const k = await inventario();
      const g = gtf();
      const d = await anexo("D", g, "2026-08-21", [comercial(30), paqCorta(20)]);
      const real = ForestCtpDB.crearEnTx.bind(ForestCtpDB);
      let llamadas = 0;
      vi.spyOn(ForestCtpDB, "crearEnTx").mockImplementation(async (...args) => {
        if (++llamadas === 2) throw new CtpInvariantError("falla inyectada en la 2.ª línea", "VALIDACION");
        return real(...args);
      });
      const r = await ForestCtpGuiaDesdeAnexoDB.registrarGuia(T, d.id, { user: P });
      expect(r.guias[0]).toMatchObject({ estado: "error", codigo: "VALIDACION" });
      expect(await lineasDeGuia(g)).toHaveLength(0);
      expect((await paquetesDe(k.id)).map((p) => [p.codigo, Number(p.volumenM3)])).toEqual([
        [`${k.raiz}-COM`, 6], [`${k.raiz}-PQC`, 4.5],
      ]);
      expect((await ForestAnexosDB.list(T)).find((x) => x.id === d.id)?.despachoIds).toBeUndefined();
      // Y la corrida sigue marcada «usado»: nada que liberar.
      expect((await prisma.forestCtpEntry.findFirst({ where: { id: k.id, tenantId: T }, select: { usadoAt: true } }))?.usadoAt).not.toBeNull();
    },
    180_000,
  );

  it(
    "el cierre bloquea: la guía de un mes cerrado, y partir un montón de una corrida de un mes cerrado",
    async () => {
      const k = await inventario("2026-07-15");
      const agosto = { periodKey: "2026-07", from: "2026-07-01T05:00:00.000Z", to: "2026-08-01T04:59:59.999Z", label: "julio de 2026", reabierto: false };
      vi.spyOn(ForestCtpCierreDB, "list").mockResolvedValue([agosto as unknown as CtpCierrePeriodo]);

      const gJulio = gtf();
      const enJulio = await anexo("E", gJulio, "2026-07-20", [comercial(10)]);
      const r1 = await ForestCtpGuiaDesdeAnexoDB.registrarGuia(T, enJulio.id, { user: P });
      expect(r1.guias[0]).toMatchObject({ estado: "error", codigo: "PERIODO_CERRADO" });

      /* La guía es de agosto (abierto), pero el montón a partir vive en julio (cerrado). */
      const gAgosto = gtf();
      const enAgosto = await anexo("F", gAgosto, "2026-08-10", [comercial(10)]);
      const r2 = await ForestCtpGuiaDesdeAnexoDB.registrarGuia(T, enAgosto.id, {
        user: P,
        elecciones: [{ especie: ESPECIE, tipo: "Comercial", corridas: [k.id] }],
      });
      expect(r2.guias[0]).toMatchObject({ estado: "error", codigo: "PERIODO_CERRADO" });
      expect(await lineasDeGuia(gAgosto)).toHaveLength(0);
      expect((await paquetesDe(k.id)).map((p) => p.codigo)).toEqual([`${k.raiz}-COM`, `${k.raiz}-PQC`]);
    },
    180_000,
  );

  it(
    "la guía de dos anexos vale con el más nuevo y el otro queda «reemplazado» (no se borra, no se registra)",
    async () => {
      await inventario();
      const g = gtf();
      const viejo = await anexo("G1", g, "2026-08-24", [comercial(10)]);
      await new Promise((ok) => setTimeout(ok, 5));
      const nuevo = await anexo("G2", g.replace(/^19-/, "019-"), "2026-08-25", [comercial(11)]);
      const pend = await ForestCtpGuiaDesdeAnexoDB.pendientes(T);
      expect(pend.reemplazados.find((x) => x.anexoId === viejo.id)?.por).toBe(nuevo.id);

      const r = await ForestCtpGuiaDesdeAnexoDB.registrarGuia(T, nuevo.id, { user: P });
      expect(r.guias[0]).toMatchObject({ estado: "registrada", reemplazados: [viejo.id] });
      const bandeja = await ForestAnexosDB.list(T);
      expect(bandeja.find((x) => x.id === viejo.id)?.reemplazadoPor).toBe(nuevo.id);
      /* Volver a bajar el papel viejo (no tiene despachos) se puede, y no borra la marca. */
      await ForestAnexosDB.save(T, {
        id: viejo.id,
        fecha: viejo.fecha,
        datos: { numero: viejo.numero, gtf: viejo.gtf, empresa: "QA", firmante: "QA", documento: "", cargo: "", observaciones: "re-impreso", unidadV: "pt", modo: "oficial" },
        piezas: viejo.piezas,
      }, P);
      expect((await ForestAnexosDB.list(T)).find((x) => x.id === viejo.id)?.reemplazadoPor).toBe(nuevo.id);
      const otra = await ForestCtpGuiaDesdeAnexoDB.registrarGuia(T, viejo.id, { user: P });
      expect(otra.guias[0]).toMatchObject({ estado: "error", codigo: "ANEXO_NO_REGISTRABLE" });
    },
    180_000,
  );

  it(
    "contarPendientes() dice lo mismo que pendientes(): la pastilla no puede mentir por ir liviana",
    async () => {
      await inventario();
      const g1 = await anexo("C1", gtf(), "2026-08-24", [comercial(6)]);
      const g2 = await anexo("C2", gtf(), "2026-08-25", [comercial(7)]);
      const pend = await ForestCtpGuiaDesdeAnexoDB.pendientes(T);
      const idsPropios = new Set([g1.id, g2.id]);
      const guiasPropias = pend.tanda.guias.filter((x) => idsPropios.has(x.anexoId));
      expect(guiasPropias).toHaveLength(2);
      const m3Propio = guiasPropias.reduce((a, x) => a + x.totalM3, 0);

      const conteo = await ForestCtpGuiaDesdeAnexoDB.contarPendientes(T);
      /* No hay forma de aislar SOLO estas dos en el conteo global (no separa por
         anexo), así que se compara contra el mismo total que ve `pendientes()`
         en esta tienda de pruebas: si el número de guías difiere, uno de los
         dos caminos se desincronizó de `clasificarAnexos`. El m³ puede diferir
         unos mililitros: `contarPendientes` suma el `totalM3` DECLARADO del
         Anexo 04 (el papel), `pendientes()` recomputa por grupo tras cubicar
         y repartir piezas — dos redondeos `r4` en cadenas distintas. Medido:
         0,0008 m³ (menos de un litro) sobre 2,55 m³ — la misma tolerancia de
         "resto de montón" que ya usa el propio módulo (`TOL_RESTO_M3`). */
      expect(conteo.guias).toBe(pend.tanda.guias.length);
      expect(conteo.totalM3).toBeCloseTo(pend.tanda.resumen.totalM3, 2);
      expect(m3Propio).toBeGreaterThan(0);
    },
    120_000,
  );

  it(
    "una guía que ya está en Despacho sin venir del anexo no se registra dos veces (por tramos)",
    async () => {
      await inventario();
      const g = gtf();
      await ForestCtpDB.create(T, {
        section: "despacho",
        entryDate: new Date("2026-08-26T00:00:00.000Z"),
        speciesCommon: ESPECIE,
        productType: COMERCIAL,
        quantity: 0.1,
        unit: "m3",
        gtfNumber: g.replace(/^19-/, "019-"),
        createdBy: P,
      });
      const h = await anexo("H", g, "2026-08-26", [comercial(10)]);
      const r = await ForestCtpGuiaDesdeAnexoDB.registrarGuia(T, h.id, { user: P });
      expect(r.guias[0].estado).toBe("ya_existe");
      expect(await lineasDeGuia(g)).toHaveLength(0);
    },
    180_000,
  );

  it(
    "otro tenant no ve ni registra el anexo, y un bulto con piezas no se parte",
    async () => {
      const k = await inventario();
      const g = gtf();
      const i = await anexo("I", g, "2026-08-27", [comercial(10)]);
      expect(await ForestCtpGuiaDesdeAnexoDB.proponer("main", i.id)).toMatchObject({ estado: "no_existe" });
      const r = await ForestCtpGuiaDesdeAnexoDB.registrarGuia("main", i.id, { user: P });
      expect(r.guias[0]).toMatchObject({ estado: "error", codigo: "ANEXO_NO_REGISTRABLE" });

      const fisico = await prisma.forestCtpPaquete.create({
        data: { tenantId: T, ctpEntryId: k.id, codigo: `${P}-FIS`, cantidad: 12, volumenM3: 1, createdBy: P },
      });
      await expect(
        prisma.$transaction((tx) =>
          ForestCtpGuiaDesdeAnexoDB.partirMontonEnTx(tx, T, fisico.id, 0.5, { user: P, cierres: [], guia: g }),
        ),
      ).rejects.toMatchObject({ code: "PAQUETE_NO_SE_PARTE" });
    },
    180_000,
  );

  it(
    "riesgo del ADR medido: una línea a nivel corrida baja el saldo pero no dice qué bulto con etiqueta salió",
    async () => {
      /* Especie propia: la corrida no debe competir con los montones de los otros casos. */
      const especie = `A446b ${runId}`;
      const raiz = `${P}-${++n}`;
      const bulto = (codigo: string) => ({
        codigo, cantidad: 12, volumenM3: 1, productType: COMERCIAL, espesorCm: 5.08, anchoCm: 20.32, largoM: 3.05,
      });
      const k = await ForestCtpDB.create(T, {
        section: "produccion", entryDate: new Date("2026-08-02T17:00:00.000Z"), speciesCommon: especie,
        productType: COMERCIAL, volumeInputM3: 4, quantity: 2, unit: "m3", createdBy: P,
        paquetes: [bulto(`${raiz}-B1`), bulto(`${raiz}-B2`)],
      });
      const g = gtf();
      const salida = { ...comercial(32), especie };
      const a = await anexo("K", g, "2026-08-29", [salida]);
      const r = await ForestCtpGuiaDesdeAnexoDB.registrarGuia(T, a.id, { user: P });
      expect(r.guias[0].estado).toBe("registrada");
      const [linea] = await lineasDeGuia(g);
      // Va a nivel corrida: sin código de paquete (una línea por bulto físico es lo que el ADR descarta).
      expect(linea.codigoProducto).toBeNull();
      const [enPatio] = (await ForestCtpDB.productosDisponibles(T, { especie })).corridas;
      expect(enPatio.id).toBe(k.id);
      expect(enPatio.disponible).toBeCloseTo(2 - salida.m3, 4);
      // Los dos bultos siguen listados: la diferencia con el saldo es lo que salió sin decir cuál.
      const listado = enPatio.paquetes.reduce((s2, p) => s2 + p.volumenM3, 0);
      expect(listado).toBeCloseTo(2, 4);
      expect(listado - enPatio.disponible).toBeCloseTo(salida.m3, 4);
    },
    180_000,
  );

  it(
    "un ctpEntryId de un despacho con OTRA guía no esconde el anexo, y registrarlo no duplica la salida",
    async () => {
      await inventario();
      const ajena = await ForestCtpDB.create(T, {
        section: "despacho", entryDate: new Date("2026-08-30T12:00:00.000Z"), speciesCommon: ESPECIE,
        productType: COMERCIAL, quantity: 0.1, unit: "m3", gtfNumber: gtf(), createdBy: P,
      });
      const g = gtf();
      const l = await ForestAnexosDB.save(T, {
        fecha: "2026-08-30",
        ctpEntryId: ajena.id,
        datos: { numero: `${P}-L`, gtf: g, empresa: "QA", firmante: "QA", documento: "", cargo: "", observaciones: "", unidadV: "pt", modo: "oficial" },
        piezas: [comercial(10)],
      }, P);
      const pend = await ForestCtpGuiaDesdeAnexoDB.pendientes(T);
      expect(pend.tanda.guias.some((x) => x.anexoId === l.id)).toBe(true);
      expect(pend.registrados.some((x) => x.anexoId === l.id)).toBe(false);
      const r = await ForestCtpGuiaDesdeAnexoDB.registrarGuia(T, l.id, { user: P });
      expect(r.guias[0].estado).toBe("ya_existe");
      expect(await lineasDeGuia(g)).toHaveLength(0);
    },
    180_000,
  );

  it(
    "con la bandeja tomada: guardar espera 3 s y responde «tanda en curso»; registrar no espera",
    async () => {
      await inventario();
      const m = await anexo("M", gtf(), "2026-08-31", [comercial(10)]);
      let soltar!: () => void;
      const tomada = new Promise<void>((ok) => (soltar = ok));
      let avisar!: () => void;
      const lista = new Promise<void>((ok) => (avisar = ok));
      const duena = prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`platform-setting:${claveAnexos(T)}`}))`;
        avisar();
        await tomada;
      }, { timeout: 30_000 });
      await lista;
      try {
        const t0 = Date.now();
        await expect(anexo("N", gtf(), "2026-08-31", [comercial(5)])).rejects.toMatchObject({ code: "TANDA_EN_CURSO" });
        expect(Date.now() - t0).toBeLessThan(10_000);
        const r = await ForestCtpGuiaDesdeAnexoDB.registrarGuia(T, m.id, { user: P });
        expect(r.guias[0]).toMatchObject({ estado: "error", codigo: "TANDA_EN_CURSO" });
      } finally {
        soltar();
        await duena;
      }
    },
    120_000,
  );

  it(
    "una fila cuyo m³ no sale de sus medidas no se guarda",
    async () => {
      const mala = { ...comercial(10), m3: 5 };
      await expect(anexo("O", gtf(), "2026-08-31", [mala])).rejects.toMatchObject({ code: "VALIDACION" });
    },
    60_000,
  );

  it(
    "al partir un montón con pie tablar, el PT se reparte en proporción",
    async () => {
      const k = await inventario();
      await prisma.forestCtpPaquete.updateMany({ where: { tenantId: T, codigo: `${k.raiz}-COM` }, data: { pieTablar: 2544 } });
      const g = gtf();
      const q = await anexo("Q", g, "2026-08-31", [comercial(90)]); // 1200 pt ≈ 2,83 m³ de los 6 del montón
      /* La especie la comparten los otros casos: se elige ESTA corrida. */
      const r = await ForestCtpGuiaDesdeAnexoDB.registrarGuia(T, q.id, {
        user: P,
        elecciones: [{ especie: ESPECIE, tipo: "Comercial", corridas: [k.id] }],
      });
      expect(r.guias[0].estado).toBe("registrada");
      const paq = await prisma.forestCtpPaquete.findMany({
        where: { tenantId: T, codigo: { startsWith: `${k.raiz}-COM` } },
        orderBy: { codigo: "asc" },
        select: { codigo: true, volumenM3: true, pieTablar: true },
      });
      expect(paq.map((p) => p.codigo)).toEqual([`${k.raiz}-COM`, `${k.raiz}-COM-R1`]);
      const [salio, resto] = paq.map((p) => ({ m3: Number(p.volumenM3), pt: Number(p.pieTablar) }));
      expect(salio.pt + resto.pt).toBeCloseTo(2544, 2);
      expect(salio.pt / 2544).toBeCloseTo(salio.m3 / 6, 3);
    },
    180_000,
  );

  it(
    "sin producción de la especie la guía no se registra y lo dice (Azúcar huayo de la 064)",
    async () => {
      const g = gtf();
      const sinStock = await ForestAnexosDB.save(
        T,
        {
          fecha: "2026-08-28",
          datos: { numero: `${P}-J`, gtf: g, empresa: "QA", firmante: "QA", documento: "", cargo: "", observaciones: "", unidadV: "pt", modo: "oficial" },
          piezas: [{ ...comercial(16), especie: `Azucar ${runId}` }],
        },
        P,
      );
      const r = await ForestCtpGuiaDesdeAnexoDB.registrarGuia(T, sinStock.id, { user: P });
      expect(r.guias[0].estado).toBe("bloqueada");
      if (r.guias[0].estado === "bloqueada") {
        expect(r.guias[0].bloqueos[0]).toMatchObject({ codigo: "SIN_STOCK_DE_LA_ESPECIE", piezas: 16 });
      }
      expect(await lineasDeGuia(g)).toHaveLength(0);
    },
    120_000,
  );
});
