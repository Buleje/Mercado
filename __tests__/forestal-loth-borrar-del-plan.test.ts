/**
 * Borrar las operaciones de un plan del Libro TH (Brandon 07-10-2026).
 *
 * Prisma simulado EN MEMORIA (un evaluador chico del `where`): así se prueba
 * lo que de verdad filtra cada consulta —negocio, plan, vivas— y no sólo que
 * se llamó a algo.
 *
 *   · se borra de la salida a la fuente; una línea con una hija registrada
 *     que queda viva se salta (tala con trozado, trozado con despacho);
 *   · mes cerrado y Libro CTP saltan la línea con su motivo, no cortan todo;
 *   · nunca toca otro negocio ni otro plan; las sin plan frenan pero no se borran;
 *   · las talas borradas devuelven su árbol a «en pie» si no les queda otra.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;
const H = vi.hoisted(() => ({
  libro: [] as Fila[],
  censo: [] as Fila[],
  /** `lothTrozadoId` de las trozas vivas en el Libro CTP. */
  ctp: [] as string[],
  /** N° de guía cuyo ingreso ya está en el Libro CTP. */
  guiasRecibidas: [] as string[],
  cierres: [] as unknown[],
  /** Cada `$queryRaw` de la tx (el lock FOR UPDATE). */
  locks: [] as { sql: string; vals: unknown[] }[],
  audit: vi.fn(),
}));

/* Evaluador mínimo del `where` de Prisma que usan estas consultas. */
function cumple(fila: Fila, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === "OR") return (v as Record<string, unknown>[]).some((w) => cumple(fila, w));
    if (k === "AND") return (v as Record<string, unknown>[]).every((w) => cumple(fila, w));
    const val = fila[k] ?? null;
    if (v === null) return val === null;
    if (typeof v === "object" && !(v instanceof Date)) {
      const o = v as { in?: unknown[]; not?: unknown };
      if (o.in) return o.in.includes(val);
      if ("not" in o) return o.not === null ? val !== null : val !== o.not;
      return true;
    }
    return val === v;
  });
}

vi.mock("@/lib/prisma", () => {
  const forestLothEntry = {
    findMany: async ({ where }: { where: Record<string, unknown> }) => H.libro.filter((f) => cumple(f, where)),
    findFirst: async ({ where }: { where: Record<string, unknown> }) => H.libro.find((f) => cumple(f, where)) ?? null,
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Fila }) => {
      const filas = H.libro.filter((f) => cumple(f, where));
      for (const f of filas) Object.assign(f, data);
      return { count: filas.length };
    },
  };
  const db = {
    forestLothEntry,
    forestGtf: { findMany: async () => [] },
    woodEntryTroza: {
      findMany: async ({ where }: { where: { lothTrozadoId: { in: string[] } } }) =>
        where.lothTrozadoId.in.filter((id) => H.ctp.includes(id)).map((id) => ({ lothTrozadoId: id, codificacion: id, entry: { libroNro: 7, gtfNumber: "G-1" } })),
    },
    forestCensusTree: {
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Fila }) => {
        const filas = H.censo.filter((f) => cumple(f, where));
        for (const f of filas) Object.assign(f, data);
        return { count: filas.length };
      },
    },
    $executeRaw: async () => 0,
  };
  /* El lock FOR UPDATE se anota: el primer paso de la tx tiene que ser ése (review 07-10). */
  const conLock = { ...db, $queryRaw: async (sql: TemplateStringsArray, ...vals: unknown[]) => { H.locks.push({ sql: sql.join("?"), vals }); return []; } };
  return { prisma: { ...conLock, $transaction: async (fn: (tx: typeof conLock) => unknown) => fn(conLock) } };
});
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/cache", async (real) => ({ ...(await real<typeof import("@/lib/cache")>()), invalidateByPrefix: vi.fn() }));
vi.mock("@/lib/forestal/loth-audit", () => ({ auditLoth: (...a: unknown[]) => H.audit(...a) }));
vi.mock("@/lib/db/forest-loth-cierre.db", () => ({ ForestLothCierreDB: { list: async () => H.cierres } }));

import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { GtfNumeroDB, GuiaYaEnElCtpError } from "@/lib/db/gtf-numero.db";
import { planearBorradoDelPlan, textoDelSalto, type LineaParaBorrar } from "@/lib/forestal/loth-borrar-del-plan";

let n = 0;
function linea(section: string, extra: Fila = {}): Fila {
  n += 1;
  return {
    id: `L${n}`, tenantId: "t1", planId: "P1", section, status: "registrado", lineNo: n, deletedAt: null,
    treeCode: null, trozaCode: null, gtfNumber: null, volumeM3: 1, entryDate: new Date("2026-09-10T12:00:00Z"),
    ...extra,
  };
}
const vivas = () => H.libro.filter((f) => f.deletedAt === null).map((f) => f.id);
const TODAS = ["tala", "trozado", "despacho_troza", "consumo_troza", "producto_terminado", "despacho_producto"];

beforeEach(() => {
  n = 0;
  H.libro = [];
  H.censo = [];
  H.ctp = [];
  H.guiasRecibidas = [];
  H.cierres = [];
  H.locks = [];
  H.audit.mockReset();
  vi.restoreAllMocks();
  vi.spyOn(GtfNumeroDB, "exigirSinIngresosEnElCtp").mockImplementation(async (_tx, _t, guia) => {
    if (H.guiasRecibidas.includes(guia.gtfNumber)) throw new GuiaYaEnElCtpError("ya entró", [7]);
  });
});

/** Árbol A1 → troza A1-a → despacho con guía G-1. */
function cadena(arbol = "A1", extra: Fila = {}) {
  const tala = linea("tala", { treeCode: arbol, volumeM3: 5, ...extra });
  const troz = linea("trozado", { treeCode: arbol, trozaCode: `${arbol}-a`, volumeM3: 4, ...extra });
  const desp = linea("despacho_troza", { treeCode: arbol, trozaCode: `${arbol}-a`, gtfNumber: "G-1", volumeM3: 4, ...extra });
  H.libro.push(tala, troz, desp);
  return { tala, troz, desp };
}

describe("ForestLothDB.softDeleteDelPlan", () => {
  it("«Todas» borra la cadena entera del plan, libera el árbol y deja otros planes y negocios", async () => {
    const { tala } = cadena();
    const otroPlan = linea("tala", { planId: "P2", treeCode: "B1" });
    const otroNegocio = linea("tala", { tenantId: "t2", treeCode: "A1" });
    H.libro.push(otroPlan, otroNegocio);
    H.censo = [
      { tenantId: "t1", planId: "P1", treeCode: "A1", estado: "talado", deletedAt: null },
      { tenantId: "t2", planId: "P1", treeCode: "A1", estado: "talado", deletedAt: null },
    ];
    const r = await ForestLothDB.softDeleteDelPlan("t1", "P1", TODAS, "qa");
    expect(r.borradas).toBe(3);
    expect(r.m3).toBe(13);
    expect(r.saltadas).toEqual([]);
    expect(r.porSeccion.map((s) => s.section)).toEqual(["despacho_troza", "trozado", "tala"]);
    expect(vivas()).toEqual([otroPlan.id, otroNegocio.id]);
    expect(tala.deletedAt).toBeInstanceOf(Date);
    expect(r.arbolesLiberados).toBe(1);
    expect(H.censo.map((c) => c.estado)).toEqual(["en_pie", "talado"]);
    expect(H.audit).toHaveBeenCalledTimes(1);
    expect(H.audit.mock.calls[0][0]).toMatchObject({ tenantId: "t1", entityId: "P1", action: "loth_linea_delete", user: "qa" });
  });

  it("sólo «Tala» con trozado vivo: la tala se queda y se dice por qué", async () => {
    const { tala } = cadena();
    const sola = linea("tala", { treeCode: "C9" });
    H.libro.push(sola);
    const r = await ForestLothDB.softDeleteDelPlan("t1", "P1", ["tala"]);
    expect(r.borradas).toBe(1);
    expect(sola.deletedAt).toBeInstanceOf(Date);
    expect(tala.deletedAt).toBeNull();
    expect(r.saltadas).toEqual([{ section: "tala", motivo: "tiene_trozado", n: 1, ejemplos: ["A1"] }]);
  });

  it("un trozado SIN plan del mismo árbol también frena la tala (y no se borra)", async () => {
    const tala = linea("tala", { treeCode: "A1" });
    const trozSinPlan = linea("trozado", { planId: null, treeCode: "A1", trozaCode: "A1-a" });
    H.libro.push(tala, trozSinPlan);
    const r = await ForestLothDB.softDeleteDelPlan("t1", "P1", TODAS);
    expect(r.borradas).toBe(0);
    expect(trozSinPlan.deletedAt).toBeNull();
    expect(r.saltadas[0]).toMatchObject({ section: "tala", motivo: "tiene_trozado" });
    expect(H.audit).not.toHaveBeenCalled();
  });

  it("mes cerrado: esas líneas se quedan y arrastran a su fuente; lo demás se borra", async () => {
    H.cierres = [{ periodKey: "2026-08", from: "2026-08-01T05:00:00.000Z", to: "2026-09-01T04:59:59.999Z", label: "agosto de 2026" }];
    const vieja = cadena("A1", { entryDate: new Date("2026-08-15T12:00:00Z") });
    const nueva = cadena("B1");
    const r = await ForestLothDB.softDeleteDelPlan("t1", "P1", TODAS);
    expect(r.borradas).toBe(3);
    expect([nueva.tala, nueva.troz, nueva.desp].every((l) => l.deletedAt instanceof Date)).toBe(true);
    expect([vieja.tala, vieja.troz, vieja.desp].every((l) => l.deletedAt === null)).toBe(true);
    const cerradas = r.saltadas.filter((s) => s.motivo === "mes_cerrado");
    expect(cerradas.map((s) => s.section).sort()).toEqual(["despacho_troza", "tala", "trozado"]);
    expect(cerradas[0].periodos).toEqual(["agosto de 2026"]);
  });

  it("despacho cuya guía ya entró al CTP: se queda, y su trozado y su tala también", async () => {
    H.guiasRecibidas = ["G-1"];
    const { tala, troz, desp } = cadena();
    const r = await ForestLothDB.softDeleteDelPlan("t1", "P1", TODAS);
    expect(r.borradas).toBe(0);
    expect([tala, troz, desp].every((l) => l.deletedAt === null)).toBe(true);
    expect(r.saltadas).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "despacho_troza", motivo: "en_ctp" }),
      expect.objectContaining({ section: "trozado", motivo: "tiene_salida" }),
      expect.objectContaining({ section: "tala", motivo: "tiene_trozado" }),
    ]));
  });

  it("trozado cuya troza está en el CTP (por lothTrozadoId): se queda con motivo en_ctp", async () => {
    const tala = linea("tala", { treeCode: "A1" });
    const troz = linea("trozado", { treeCode: "A1", trozaCode: "A1-a" });
    H.libro.push(tala, troz);
    H.ctp = [troz.id as string];
    const r = await ForestLothDB.softDeleteDelPlan("t1", "P1", ["tala", "trozado"]);
    expect(r.borradas).toBe(0);
    expect(r.saltadas).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "trozado", motivo: "en_ctp" }),
      expect.objectContaining({ section: "tala", motivo: "en_ctp" }),
    ]));
  });

  it("no libera el árbol si le queda otra tala vigente SIN plan con ese código", async () => {
    H.libro.push(linea("tala", { treeCode: "A1" }), linea("tala", { planId: null, treeCode: "A1" }));
    H.censo = [{ tenantId: "t1", planId: "P1", treeCode: "A1", estado: "talado", deletedAt: null }];
    const r = await ForestLothDB.softDeleteDelPlan("t1", "P1", ["tala"]);
    expect(r.borradas).toBe(1);
    expect(r.arbolesLiberados).toBe(0);
    expect(H.censo[0].estado).toBe("talado");
  });

  it("la tala del mismo código en OTRO plan no deja «talado» al árbol de éste (el código es por plan)", async () => {
    H.libro.push(linea("tala", { treeCode: "A1" }), linea("tala", { planId: "P2", treeCode: "A1" }));
    H.censo = [{ tenantId: "t1", planId: "P1", treeCode: "A1", estado: "talado", deletedAt: null }];
    const r = await ForestLothDB.softDeleteDelPlan("t1", "P1", ["tala"]);
    expect(r.arbolesLiberados).toBe(1);
    expect(H.censo[0].estado).toBe("en_pie");
  });

  it("lo primero de la transacción es bloquear las líneas vivas del plan (FOR UPDATE por planId)", async () => {
    cadena();
    await ForestLothDB.softDeleteDelPlan("t1", "P1", ["tala"]);
    expect(H.locks[0].sql).toMatch(/"planId" = \?[\s\S]*FOR UPDATE/);
    expect(H.locks[0].vals).toEqual(["t1", "P1"]);
  });

  it("sin secciones válidas → error, nada se toca", async () => {
    cadena();
    await expect(ForestLothDB.softDeleteDelPlan("t1", "P1", ["censo"])).rejects.toThrow(/sección/);
    expect(vivas()).toHaveLength(3);
  });
});

describe("ForestLothDB.contarDelPlan", () => {
  it("por sección, sólo ESE plan y negocio; m³ de las registradas; marca las de mes cerrado", async () => {
    H.cierres = [{ periodKey: "2026-08", from: "2026-08-01T05:00:00.000Z", to: "2026-09-01T04:59:59.999Z", label: "agosto de 2026" }];
    H.libro.push(
      linea("tala", { volumeM3: 2.5 }),
      linea("tala", { volumeM3: 3, status: "anulado" }),
      linea("tala", { volumeM3: 1, entryDate: new Date("2026-08-20T12:00:00Z") }),
      linea("trozado", { volumeM3: 1.25 }),
      linea("trozado", { volumeM3: 9, deletedAt: new Date() }),
      linea("tala", { volumeM3: 9, planId: "P2" }),
      linea("tala", { volumeM3: 9, tenantId: "t2" }),
    );
    const c = await ForestLothDB.contarDelPlan("t1", "P1");
    expect(c.total).toBe(4);
    expect(c.m3).toBe(4.75);
    expect(c.secciones).toEqual([
      { section: "tala", lineas: 3, anuladas: 1, m3: 3.5, cerradas: 1 },
      { section: "trozado", lineas: 1, anuladas: 0, m3: 1.25, cerradas: 0 },
    ]);
  });
});

describe("planearBorradoDelPlan (puro)", () => {
  const L = (id: string, section: string, extra: Partial<LineaParaBorrar> = {}): LineaParaBorrar => ({
    id, section, status: "registrado", lineNo: Number(id.slice(1)), treeCode: null, trozaCode: null, volumeM3: 1,
    entryDate: new Date("2026-09-10"), delPlan: true, ...extra,
  });
  const sinCierre = () => null;

  it("una tala ANULADA se borra aunque su árbol tenga trozado vivo (ya no sostiene nada)", () => {
    const p = planearBorradoDelPlan({
      lineas: [L("L1", "tala", { treeCode: "A", status: "anulado" }), L("L2", "trozado", { treeCode: "A", trozaCode: "A-1" })],
      secciones: ["tala"], mesCerrado: sinCierre, enCtp: new Set(),
    });
    expect(p.porSeccion.get("tala")?.map((l) => l.id)).toEqual(["L1"]);
  });

  it("producto terminado con despacho de producto vivo se queda; con los dos, se borran", () => {
    const lineas = [L("L1", "producto_terminado"), L("L2", "despacho_producto")];
    const solo = planearBorradoDelPlan({ lineas, secciones: ["producto_terminado"], mesCerrado: sinCierre, enCtp: new Set() });
    expect(solo.saltadas).toEqual([{ section: "producto_terminado", motivo: "tiene_despacho_producto", n: 1, ejemplos: ["#1"] }]);
    const ambos = planearBorradoDelPlan({ lineas, secciones: ["producto_terminado", "despacho_producto"], mesCerrado: sinCierre, enCtp: new Set() });
    expect([...ambos.porSeccion.values()].flat()).toHaveLength(2);
  });

  it("el texto del salto nombra la sección, el motivo y los ejemplos", () => {
    const t = textoDelSalto({ section: "tala", motivo: "tiene_trozado", n: 7, ejemplos: ["A", "B", "C", "D", "E"] }, () => "Tala");
    expect(t).toBe("Tala · 7 se quedaron: su árbol tiene trozado vivo (marca también Trozado) (A, B, C, D, E, …)");
  });
});
