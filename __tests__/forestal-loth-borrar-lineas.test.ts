/**
 * Borrar lo elegido en «Secciones» del Libro TH: casillas o filtro, de varias
 * secciones y planes (Brandon 07-10-2026: «escoger y eliminar los procesos…
 * según lo escogido por permiso o titular»).
 *
 * Mismo prisma EN MEMORIA que `forestal-loth-borrar-del-plan.test.ts` (sus
 * tests siguen verdes con el núcleo compartido). Lo propio de este borrado:
 *   · una tala elegida sin su trozado se salta; con «lo que cuelga», se va todo;
 *   · una hija de OTRO plan con el mismo código no frena;
 *   · ids de otro negocio se ignoran; la vista previa no escribe;
 *   · el lock FOR UPDATE va por `id` y con el negocio, antes de leer.
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
import { planearBorrado, type LineaParaBorrar } from "@/lib/forestal/loth-borrar-del-plan";

let n = 0;
function linea(section: string, extra: Fila = {}): Fila {
  n += 1;
  return {
    id: `L${n}`, tenantId: "t1", planId: "P1", section, status: "registrado", lineNo: n, deletedAt: null,
    treeCode: null, trozaCode: null, gtfNumber: null, volumeM3: 1, entryDate: new Date("2026-09-10T12:00:00Z"),
    ...extra,
  };
}

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

const ids = (...fs: Fila[]) => fs.map((f) => f.id as string);

describe("ForestLothDB.softDeleteLineas", () => {
  it("tala elegida sin su trozado: se queda (nada colgando) y no se escribe nada", async () => {
    const { tala } = cadena();
    const r = await ForestLothDB.softDeleteLineas("t1", ids(tala), "qa");
    expect(r.borradas).toBe(0);
    expect(tala.deletedAt).toBeNull();
    expect(r.saltadas).toEqual([{ section: "tala", motivo: "tiene_trozado", n: 1, ejemplos: ["A1"] }]);
    expect(H.audit).not.toHaveBeenCalled();
  });

  it("con «incluir lo que cuelga» se va la cadena: tala, su trozado y el despacho de la troza", async () => {
    H.censo = [{ tenantId: "t1", planId: "P1", treeCode: "A1", estado: "talado", deletedAt: null }];
    const { tala, troz, desp } = cadena();
    const r = await ForestLothDB.softDeleteLineas("t1", ids(tala), "qa", { incluirLoQueCuelga: true });
    expect(r.agregadas).toBe(2);
    expect(r.borradas).toBe(3);
    expect([tala, troz, desp].every((l) => l.deletedAt instanceof Date)).toBe(true);
    expect(r.porSeccion.map((s) => s.section)).toEqual(["despacho_troza", "trozado", "tala"]);
    expect(r.arbolesLiberados).toBe(1);
    expect(H.censo[0].estado).toBe("en_pie");
  });

  it("varias secciones y varios planes: cada árbol vuelve en SU plan y el resumen va por plan", async () => {
    const a = cadena("A1");
    const b = cadena("B1", { planId: "P2" });
    const sinPlan = linea("tala", { planId: null, treeCode: "C1" });
    H.libro.push(sinPlan);
    H.censo = [
      { tenantId: "t1", planId: "P1", treeCode: "A1", estado: "talado", deletedAt: null },
      { tenantId: "t1", planId: "P2", treeCode: "B1", estado: "talado", deletedAt: null },
      { tenantId: "t1", planId: "P2", treeCode: "A1", estado: "talado", deletedAt: null },
    ];
    const r = await ForestLothDB.softDeleteLineas("t1", ids(a.tala, a.troz, a.desp, b.tala, b.troz, b.desp, sinPlan), "qa");
    expect(r.borradas).toBe(7);
    expect(r.porPlan).toEqual(expect.arrayContaining([
      { planId: "P1", borradas: 3, m3: 13 },
      { planId: "P2", borradas: 3, m3: 13 },
      { planId: null, borradas: 1, m3: 1 },
    ]));
    expect(H.censo.map((c) => c.estado)).toEqual(["en_pie", "en_pie", "talado"]);
  });

  it("el trozado de OTRO plan con el mismo código de árbol no frena la tala", async () => {
    const tala = linea("tala", { treeCode: "A1" });
    const ajeno = linea("trozado", { planId: "P2", treeCode: "A1", trozaCode: "A1-a" });
    H.libro.push(tala, ajeno);
    const r = await ForestLothDB.softDeleteLineas("t1", ids(tala));
    expect(r.borradas).toBe(1);
    expect(ajeno.deletedAt).toBeNull();
  });

  it("ids de otro negocio se ignoran; el lock va con el negocio y por id", async () => {
    const mia = linea("tala", { treeCode: "X1" });
    const ajena = linea("tala", { tenantId: "t2", treeCode: "X2" });
    H.libro.push(mia, ajena);
    const r = await ForestLothDB.softDeleteLineas("t1", ids(mia, ajena));
    expect(r).toMatchObject({ pedidas: 2, ignoradas: 1, borradas: 1 });
    expect(ajena.deletedAt).toBeNull();
    expect(H.locks[0].sql).toMatch(/ANY\([\s\S]*FOR UPDATE/);
    expect(H.locks[0].sql).toMatch(/ORDER BY "id"/);
    expect(H.locks[0].vals[0]).toBe("t1");
  });

  it("la vista previa decide igual y no escribe ni audita", async () => {
    const { tala, troz, desp } = cadena();
    const r = await ForestLothDB.softDeleteLineas("t1", ids(tala, troz, desp), "qa", { simular: true });
    expect(r).toMatchObject({ simulado: true, borradas: 3, m3: 13 });
    expect([tala, troz, desp].every((l) => l.deletedAt === null)).toBe(true);
    expect(H.audit).not.toHaveBeenCalled();
  });

  it("mes cerrado y Libro CTP: esas se quedan con su motivo, lo demás se borra", async () => {
    H.cierres = [{ periodKey: "2026-08", from: "2026-08-01T05:00:00.000Z", to: "2026-09-01T04:59:59.999Z", label: "agosto de 2026" }];
    H.guiasRecibidas = ["G-9"];
    const vieja = linea("tala", { treeCode: "V1", entryDate: new Date("2026-08-15T12:00:00Z") });
    const enCtp = linea("despacho_troza", { trozaCode: "Z-1", gtfNumber: "G-9" });
    const libre = linea("tala", { treeCode: "L1" });
    H.libro.push(vieja, enCtp, libre);
    const r = await ForestLothDB.softDeleteLineas("t1", ids(vieja, enCtp, libre));
    expect(r.borradas).toBe(1);
    expect(libre.deletedAt).toBeInstanceOf(Date);
    expect(r.saltadas).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "tala", motivo: "mes_cerrado", periodos: ["agosto de 2026"] }),
      expect.objectContaining({ section: "despacho_troza", motivo: "en_ctp" }),
    ]));
  });

  it("«lo que cuelga» no cruza de permiso: ni por una tala sin plan ni por un trozado sin plan", async () => {
    const talaSinPlan = linea("tala", { planId: null, treeCode: "S1" });
    const trozP2 = linea("trozado", { planId: "P2", treeCode: "S1", trozaCode: "S1-a" });
    const talaP1 = linea("tala", { treeCode: "A1" });
    const trozSinPlan = linea("trozado", { planId: null, treeCode: "A1", trozaCode: "A1-a" });
    const despP2 = linea("despacho_troza", { planId: "P2", trozaCode: "A1-a", gtfNumber: "G-2" });
    const despP1 = linea("despacho_troza", { trozaCode: "A1-a", gtfNumber: "G-1" });
    H.libro.push(talaSinPlan, trozP2, talaP1, trozSinPlan, despP2, despP1);
    const r = await ForestLothDB.softDeleteLineas("t1", ids(talaSinPlan, talaP1), "qa", { incluirLoQueCuelga: true, simular: true });
    // Se suman el trozado sin plan de A1 y el despacho P1 de su troza; nada de P2.
    expect(r.agregadas).toBe(2);
    expect(r.porPlan.map((p) => p.planId)).not.toContain("P2");
  });

  it("sin ids → error, nada se toca", async () => {
    await expect(ForestLothDB.softDeleteLineas("t1", [" "])).rejects.toThrow(/línea/);
  });
});

describe("planearBorrado (puro, por ids)", () => {
  const L = (id: string, section: string, extra: Partial<LineaParaBorrar> = {}): LineaParaBorrar => ({
    id, section, status: "registrado", lineNo: Number(id.slice(1)), treeCode: null, trozaCode: null, volumeM3: 1,
    entryDate: new Date("2026-09-10"), planId: "P1", pedida: true, ...extra,
  });
  const decidir = (lineas: LineaParaBorrar[]) => planearBorrado({ lineas, mesCerrado: () => null, enCtp: new Set() });

  it("trozado elegido con su despacho NO elegido: se queda; elegidos los dos, se van", () => {
    const troz = L("L1", "trozado", { trozaCode: "T" });
    const desp = L("L2", "despacho_troza", { trozaCode: "T" });
    expect(decidir([troz, { ...desp, pedida: false }]).saltadas).toEqual([{ section: "trozado", motivo: "tiene_salida", n: 1, ejemplos: ["T"] }]);
    expect([...decidir([troz, desp]).porSeccion.values()].flat().map((l) => l.id)).toEqual(["L2", "L1"]);
  });

  it("una hija sin plan frena a una tala con plan; una de otro plan, no", () => {
    const tala = L("L1", "tala", { treeCode: "A" });
    expect(decidir([tala, L("L2", "trozado", { treeCode: "A", planId: null, pedida: false })]).saltadas[0]?.motivo).toBe("tiene_trozado");
    expect(decidir([tala, L("L2", "trozado", { treeCode: "A", planId: "P2", pedida: false })]).saltadas).toEqual([]);
  });

  it("producto terminado: sólo lo frena el despacho de producto de SU plan", () => {
    const prod = L("L1", "producto_terminado");
    expect(decidir([prod, L("L2", "despacho_producto", { planId: "P2", pedida: false })]).saltadas).toEqual([]);
    expect(decidir([prod, L("L2", "despacho_producto", { pedida: false })]).saltadas[0]?.motivo).toBe("tiene_despacho_producto");
  });
});
