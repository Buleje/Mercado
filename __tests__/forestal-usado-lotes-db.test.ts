/**
 * «Ya se usó» por LOTE (Brandon, 2026-10-02) contra una base simulada.
 *
 * Lo que se prueba es lo que queda escrito: que sólo se marque lo que hoy está
 * en Productos disponibles, que lo apartado no se toque, que un lote de OTRO
 * tenant no exista, que el dryRun no escriba y que la auditoría diga «Salió sin
 * guía», nunca «despachado».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;
const H = vi.hoisted(() => {
  const estado = {
    lotes: [] as Fila[],
    trozas: [] as Fila[],
    corridas: [] as Fila[],
    saldos: new Map<string, number>(),
    despachados: new Map<string, number>(),
    origenes: [] as Fila[],
    enGuia: new Set<string>(),
    updateManys: [] as Fila[],
    auditados: [] as { action: string; entityId: string; detail: string }[],
  };
  const inn = (v: unknown, cond: unknown): boolean => {
    if (cond === undefined) return true;
    if (cond && typeof cond === "object") {
      const c = cond as { in?: unknown[]; notIn?: unknown[]; not?: unknown };
      if (c.in && !c.in.includes(v)) return false;
      if (c.notIn && c.notIn.includes(v)) return false;
      if ("not" in c && c.not === null && v == null) return false;
      return true;
    }
    return v === cond;
  };
  const filtrar = (filas: Fila[], where: Fila, campos: string[]) =>
    filas.filter((f) => f.tenantId === where.tenantId && campos.every((k) => inn(f[k], where[k])));
  const corridaWhere = (f: Fila, w: Fila): boolean => {
    if (f.tenantId !== w.tenantId || !inn(f.id, w.id)) return false;
    if (w.usadoAt === null && f.usadoAt != null) return false;
    if (w.usadoAt instanceof Date && (f.usadoAt as Date | null)?.getTime() !== w.usadoAt.getTime()) return false;
    if (w.usadoAt && typeof w.usadoAt === "object" && !(w.usadoAt instanceof Date) && f.usadoAt == null) return false;
    if (w.usadoPor !== undefined && f.usadoPor !== w.usadoPor) return false;
    if (w.apartados && (f.apartados as unknown[]).length > 0) return false;
    return true;
  };
  const forestCtpEntry = {
    findMany: async (a: { where: Fila }) => estado.corridas.filter((f) => corridaWhere(f, a.where)),
    updateMany: async (a: { where: Fila; data: Fila }) => {
      estado.updateManys.push(a);
      const tocadas = estado.corridas.filter((f) => corridaWhere(f, a.where));
      for (const f of tocadas) Object.assign(f, a.data);
      return { count: tocadas.length };
    },
  };
  const db = {
    forestLoteAserrio: {
      findMany: async (a: { where: Fila }) =>
        filtrar(estado.lotes, a.where, ["id", "produccionEntryId"]).filter((l) => l.deletedAt == null),
    },
    woodEntryTroza: {
      findMany: async (a: { where: Fila }) => filtrar(estado.trozas, a.where, ["loteAserrioId", "consumidaEnId"]),
    },
    forestCtpEntry,
    forestCtpDespachoOrigen: {
      findMany: async (a: { where: Fila }) => filtrar(estado.origenes, a.where, ["produccionEntryId"]),
    },
  };
  return { estado, db };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { ...H.db, $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(H.db) },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({
  m3: (v: number) => `${v} m³`,
  auditCtpEsperando: async (p: { action: string; entityId: string; detail: string }) => {
    H.estado.auditados.push({ action: p.action, entityId: p.entityId, detail: p.detail });
  },
}));
vi.mock("@/lib/db/forest-ctp.db", () => ({
  whereCorridaEnElPatio: (tenantId: string) => ({ tenantId, section: "produccion" }),
}));
vi.mock("@/lib/db/forest-ctp-despacho.db", () => ({
  ForestCtpDespachoDB: { codigosDespachados: async () => H.estado.enGuia },
}));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { list: async () => [] } }));
vi.mock("@/lib/db/forest-ctp-saldo-corrida", () => ({
  saldosDeCorridas: async (_db: unknown, tenantId: string, ids: string[]) =>
    new Map(
      H.estado.corridas
        .filter((c) => c.tenantId === tenantId && ids.includes(c.id as string))
        .map((c) => {
          const disponible = H.estado.saldos.get(c.id as string) ?? 0;
          const despachado = H.estado.despachados.get(c.id as string) ?? 0;
          return [c.id, { produccionEntryId: c.id, lineNo: c.lineNo, producido: 10, despachado, reprocesado: 0, disponible }];
        }),
    ),
}));

const { marcarUsadoDeLotes, maderaDeLotes } = await import("@/lib/db/forest-ctp-usado-lotes.db");

const T = "t-blas";
const corrida = (id: string, lineNo: number, over: Fila = {}): Fila => ({
  id,
  tenantId: T,
  lineNo,
  entryDate: new Date("2026-08-01T00:00:00.000Z"),
  productType: "MADERA ASERRADA",
  unit: "m3",
  usadoAt: null,
  usadoPor: null,
  usadoMotivo: null,
  paquetes: [],
  apartados: [],
  ...over,
});

beforeEach(() => {
  const e = H.estado;
  e.lotes = [
    { id: "L13", tenantId: T, code: "13-2026", produccionEntryId: "c19", deletedAt: null },
    { id: "L15", tenantId: T, code: "15-2026", produccionEntryId: null, deletedAt: null },
    { id: "L16", tenantId: T, code: "16-2026", produccionEntryId: "c17", deletedAt: null },
    { id: "L17", tenantId: T, code: "17-2026", produccionEntryId: null, deletedAt: null },
    { id: "LX", tenantId: "otro-tenant", code: "99-2026", produccionEntryId: "cX", deletedAt: null },
    { id: "L20", tenantId: T, code: "20-2026", produccionEntryId: null, deletedAt: null },
  ];
  e.trozas = [
    /* 15-2026 se aserró en dos corridas: una apartada, la otra libre. */
    { tenantId: T, loteAserrioId: "L15", consumidaEnId: "c18", loteAserrio: { code: "15-2026", deletedAt: null } },
    { tenantId: T, loteAserrioId: "L15", consumidaEnId: "c21", loteAserrio: { code: "15-2026", deletedAt: null } },
    /* c19 también carga trozas del 20-2026, que nadie eligió. */
    { tenantId: T, loteAserrioId: "L20", consumidaEnId: "c19", loteAserrio: { code: "20-2026", deletedAt: null } },
  ];
  e.corridas = [
    corrida("c19", 19),
    corrida("c18", 18, { apartados: [{ id: "ap1" }] }),
    corrida("c21", 21, { unit: "pt" }),
    corrida("c17", 17, { usadoAt: new Date("2026-09-01T15:00:00.000Z"), usadoPor: "ana", usadoMotivo: "merma" }),
    corrida("cX", 99, { tenantId: "otro-tenant" }),
  ];
  e.saldos = new Map([
    ["c19", 2.5],
    ["c18", 3],
    ["c21", 848],
    ["c17", 1],
    ["cX", 5],
  ]);
  e.despachados = new Map();
  e.origenes = [];
  e.enGuia = new Set();
  e.updateManys = [];
  e.auditados = [];
});

describe("marcarUsadoDeLotes", () => {
  it("dryRun: dice qué saldría y con qué lotes ajenos se comparte, sin escribir nada", async () => {
    const r = await marcarUsadoDeLotes(T, ["L13", "L15"], { usado: true, user: "ana", dryRun: true });
    expect(H.estado.updateManys).toHaveLength(0);
    expect(H.estado.auditados).toHaveLength(0);
    expect(r.dryRun).toBe(true);
    expect(r.marcadas.map((m) => m.corridaId)).toEqual(["c19", "c21"]);
    expect(r.marcadas.find((m) => m.corridaId === "c21")).toMatchObject({ m3: 2, pt: 848, loteCode: "15-2026" });
    expect(r.totalM3).toBe(4.5);
    expect(r.totalPt).toBe(1908);
    expect(r.saltados).toEqual([{ loteId: "L15", code: "15-2026", motivo: "apartado" }]);
    expect(r.compartidas).toEqual([{ corridaId: "c19", lineNo: 19, otrosLotes: ["20-2026"] }]);
  });

  it("sin motivo no marca (el dryRun sí puede ir sin él)", async () => {
    await expect(marcarUsadoDeLotes(T, ["L13"], { usado: true, motivo: " ", user: "ana" })).rejects.toMatchObject({
      code: "MOTIVO_REQUERIDO",
    });
    expect(H.estado.updateManys).toHaveLength(0);
  });

  it("marca sólo lo disponible: lo apartado, lo ya marcado y el lote sin producción quedan afuera con su porqué", async () => {
    const r = await marcarUsadoDeLotes(T, ["L13", "L15", "L16", "L17"], {
      usado: true,
      motivo: "Se usó en la casa del dueño",
      user: "ana",
    });
    expect(r.marcadas.map((m) => m.corridaId).sort()).toEqual(["c19", "c21"]);
    const marcada = H.estado.corridas.find((c) => c.id === "c19")!;
    expect(marcada).toMatchObject({ usadoPor: "ana", usadoMotivo: "Se usó en la casa del dueño" });
    expect(H.estado.corridas.find((c) => c.id === "c18")!.usadoAt).toBeNull();
    expect(r.saltados).toEqual(
      expect.arrayContaining([
        { loteId: "L15", code: "15-2026", motivo: "apartado" },
        { loteId: "L16", code: "16-2026", motivo: "ya_marcado" },
        { loteId: "L17", code: "17-2026", motivo: "sin_produccion" },
      ]),
    );
    /* La condición de carrera va en el WHERE, con el tenant. */
    expect(H.estado.updateManys[0]!.where).toMatchObject({ tenantId: T, usadoAt: null, status: "registrado" });
    expect(H.estado.auditados.map((a) => a.entityId).sort()).toEqual(["c19", "c21"]);
    for (const a of H.estado.auditados) {
      expect(a.action).toBe("ctp_linea_marcar_usado");
      expect(a.detail).toContain("Salió sin guía · uso interno / merma");
      expect(a.detail).not.toMatch(/despach/i);
    }
  });

  it("un lote de OTRO tenant no existe: ni se lee su corrida ni se escribe", async () => {
    const r = await marcarUsadoDeLotes(T, ["LX"], { usado: true, motivo: "merma del patio", user: "ana" });
    expect(r.marcadas).toEqual([]);
    expect(r.saltados).toEqual([{ loteId: "LX", code: "", motivo: "no_existe" }]);
    expect(H.estado.updateManys).toHaveLength(0);
    expect(H.estado.corridas.find((c) => c.id === "cX")!.usadoAt).toBeNull();
  });

  it("desmarcar devuelve a disponibles sólo lo marcado y deja el motivo en la auditoría", async () => {
    const r = await marcarUsadoDeLotes(T, ["L16", "L13"], { usado: false, motivo: "error", user: "ana" });
    expect(r.marcadas.map((m) => m.corridaId)).toEqual(["c17"]);
    expect(H.estado.corridas.find((c) => c.id === "c17")!.usadoAt).toBeNull();
    expect(r.saltados).toEqual([{ loteId: "L13", code: "13-2026", motivo: "ya_marcado" }]);
    expect(H.estado.auditados).toHaveLength(1);
    expect(H.estado.auditados[0]!.action).toBe("ctp_linea_desmarcar_usado");
    expect(H.estado.auditados[0]!.detail).toContain("Volvió a disponibles · motivo: error");
  });

  it("desmarcar sin motivo tampoco escribe (el dryRun sí puede ir sin él)", async () => {
    await expect(marcarUsadoDeLotes(T, ["L16"], { usado: false, user: "ana" })).rejects.toMatchObject({
      code: "MOTIVO_REQUERIDO",
    });
    expect(H.estado.updateManys).toHaveLength(0);
    const r = await marcarUsadoDeLotes(T, ["L16"], { usado: false, user: "ana", dryRun: true });
    expect(r.marcadas.map((m) => m.corridaId)).toEqual(["c17"]);
    expect(H.estado.corridas.find((c) => c.id === "c17")!.usadoAt).not.toBeNull();
  });

  it("si otro la apartó entre la lectura y la escritura, no se marca y se dice", async () => {
    const original = H.db.forestCtpEntry.updateMany;
    H.db.forestCtpEntry.updateMany = async (a) => {
      H.estado.corridas.find((c) => c.id === "c19")!.apartados = [{ id: "ap-tarde" }];
      return original(a);
    };
    try {
      const r = await marcarUsadoDeLotes(T, ["L13"], { usado: true, motivo: "merma del patio", user: "ana" });
      expect(r.marcadas).toEqual([]);
      expect(r.saltados).toEqual([{ loteId: "L13", code: "13-2026", motivo: "ya_marcado" }]);
      expect(H.estado.auditados).toHaveLength(0);
    } finally {
      H.db.forestCtpEntry.updateMany = original;
    }
  });
});

describe("maderaDeLotes", () => {
  it("la etiqueta sale de las corridas por id: despachada con su guía, usada, y sin producción", async () => {
    H.estado.saldos.set("c19", 0);
    H.estado.despachados.set("c19", 10);
    H.estado.origenes = [
      {
        tenantId: T,
        produccionEntryId: "c19",
        despacho: { entryDate: new Date("2026-09-10T00:00:00.000Z"), gtfNumber: "1-19-0313629" },
      },
    ];
    const m = await maderaDeLotes(
      T,
      new Map([
        ["L13", ["c19"]],
        ["L16", ["c17"]],
        ["L17", []],
        ["LX", ["cX"]],
      ]),
    );
    expect(m.get("L13")).toMatchObject({ estado: "despachada", guias: ["1-19-0313629"] });
    expect(m.get("L16")).toMatchObject({ estado: "usada", salioEl: "2026-09-01T12:00:00.000Z" });
    expect(m.get("L17")!.estado).toBe("sin_produccion");
    /* La corrida de otro tenant no se lee: para este lote no hay producción. */
    expect(m.get("LX")!.estado).toBe("sin_produccion");
  });
});
