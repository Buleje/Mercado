/**
 * `ForestJornadaBloqueDB.declararJornadaAbierta` (ADR-521) con la base simulada.
 *
 * Lo que se fija:
 *  · declara la corrida abierta y anota el día en UNA transacción (la clave
 *    KV de las distribuciones), con `CTP_TX_OPTS`; auditoría y cobro, después;
 *  · sólo si la corrida es del bloque entero: piezas de más o de menos, otra
 *    sección, anulada → `CORRIDA_NO_ES_DEL_BLOQUE`, sin abrir la tx;
 *  · ya declarada con esas piezas = reintento: sólo anota (`yaEstaba`);
 *  · si las piezas cambian bajo la tx, tira y no confirma nada;
 *  · el tenant va en todos los WHERE.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  confirmado: [] as string[],
  txOpts: [] as unknown[],
  kv: null as unknown,
  corridaFind: vi.fn(),
  piezasFind: vi.fn(),
  txCount: vi.fn(),
  recotizar: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    forestCtpEntry: { findFirst: H.corridaFind },
    woodEntryTroza: { findMany: H.piezasFind },
  },
}));
/* `actualizar` corre `cambio` en SU transacción: lo escrito se confirma sólo si termina. */
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    get: async () => H.kv,
    actualizar: async (
      _key: string,
      cambio: (a: unknown, tx: unknown) => Promise<{ valor?: unknown; resultado: unknown }> | { valor?: unknown; resultado: unknown },
      _user: string,
      opts: unknown,
    ) => {
      H.txOpts.push(opts);
      const tx = { log: [] as string[], woodEntryTroza: { count: H.txCount } };
      const r = await cambio(H.kv, tx);
      H.confirmado.push(...tx.log);
      if (r.valor !== undefined) H.kv = r.valor;
      return r.resultado;
    },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn(), auditCtpEsperando: vi.fn(), m3: (n: number) => String(n) }));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { list: vi.fn(), closedPeriodOf: vi.fn() } }));
vi.mock("@/lib/db/forest-lote-aserrio.db", () => ({ ForestLoteAserrioDB: {} }));
vi.mock("@/lib/db/forest-aserrio.db", () => ({ ForestAserrioDB: { recotizarSiCobrada: H.recotizar } }));

import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { ForestJornadaBloqueDB, type AnotarJornadaEn } from "@/lib/db/forest-jornada-bloque.db";
import { CTP_TX_OPTS, CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";

const TENANT = "tenant-qa";

const corrida = (x: Record<string, unknown> = {}) => ({
  id: "c7",
  lineNo: 7,
  section: "produccion",
  status: "registrado",
  deletedAt: null,
  entryDate: new Date("2026-10-19T12:00:00.000Z"),
  quantity: null,
  volumeInputM3: 7.5,
  ...x,
});

const distribucion = () => ({
  id: "d1",
  nombre: "Distribución QA",
  fecha: "2026-10-19",
  bloques: [
    {
      id: "b1",
      etiqueta: "Lote 28-2026",
      trozaIds: ["t1", "t2", "t3"],
      corridaIds: ["c7"],
      jornadasLibro: [{ dia: 1, corridaId: "c7", lineNo: 7, estado: "abierta", fecha: "2026-10-19" }],
    },
  ],
  createdAt: "2026-10-19T12:00:00.000Z",
  createdBy: "qaadmin",
  updatedAt: "2026-10-19T12:00:00.000Z",
});

type BloqueKv = { id: string; jornadasLibro?: { dia: number; corridaId: string; estado: string }[] };
const bloqueGuardado = () => ((H.kv as { bloques: BloqueKv[] }[])[0]?.bloques ?? []).find((b) => b.id === "b1");

const anotarEn: AnotarJornadaEn = {
  distribucionId: "d1",
  bloqueId: "b1",
  parche: (b, c) => ({
    jornadasLibro: [
      ...(b.jornadasLibro ?? []).filter((j) => j.dia !== 1),
      { dia: 1, corridaId: c.id, lineNo: c.lineNo, estado: "declarada" as const, fecha: "2026-10-19" },
    ],
  }),
};

const input = (x: Record<string, unknown> = {}) => ({
  corridaId: "c7",
  trozaIds: ["t1", "t2", "t3"],
  produccion: { quantity: 4, unit: "m3", pieces: 120 },
  user: "qaadmin",
  ...x,
});

let espias: Record<string, ReturnType<typeof vi.spyOn>>;

beforeEach(() => {
  vi.clearAllMocks();
  H.confirmado.length = 0;
  H.txOpts.length = 0;
  H.kv = [distribucion()];
  H.corridaFind.mockResolvedValue(corrida());
  H.piezasFind.mockResolvedValue([{ id: "t1" }, { id: "t2" }, { id: "t3" }]);
  H.txCount.mockResolvedValue(3);
  H.recotizar.mockResolvedValue(undefined);
  espias = {
    validar: vi.spyOn(ForestCtpDB, "validarDeclaracion").mockResolvedValue(undefined as never),
    declararEnTx: vi.spyOn(ForestCtpDB, "declararProduccionEnTx").mockImplementation((async (tx: { log: string[] }) => {
      tx.log.push("declarar");
      return { entry: { id: "c7", lineNo: 7 }, rendimiento: 53.3 };
    }) as never),
    despues: vi.spyOn(ForestCtpDB, "despuesDeDeclarar").mockReturnValue(undefined),
  };
});

describe("declararJornadaAbierta: un solo acto", () => {
  it("declara la corrida y anota el día en UNA transacción, con CTP_TX_OPTS", async () => {
    const r = await ForestJornadaBloqueDB.declararJornadaAbierta(TENANT, input(), anotarEn);
    expect(H.confirmado).toEqual(["declarar"]);
    expect(H.txOpts).toEqual([CTP_TX_OPTS]);
    expect(r).toMatchObject({ corrida: { id: "c7", lineNo: 7 }, piezas: 3, volumenM3: 7.5, yaEstaba: false });
    expect(bloqueGuardado()?.jornadasLibro).toEqual([expect.objectContaining({ dia: 1, corridaId: "c7", estado: "declarada" })]);
    /* La declaración va contra ESA corrida, con su materia prima. */
    const [, tenant, actual, campos] = espias.declararEnTx.mock.calls[0]!;
    expect(tenant).toBe(TENANT);
    expect(actual).toEqual({ id: "c7", volumeInputM3: 7.5 });
    expect(campos).toMatchObject({ quantity: 4 });
    /* Las reglas de Declarar corrieron antes, con la corrida leída. */
    expect(espias.validar).toHaveBeenCalledTimes(1);
    expect(espias.validar.mock.calls[0]![1]).toMatchObject({ id: "c7", entryDate: corrida().entryDate });
    /* Después del commit: auditoría/caché y el cobro del aserrío. */
    expect(espias.despues).toHaveBeenCalledTimes(1);
    expect(H.recotizar).toHaveBeenCalledWith(TENANT, "c7", "qaadmin");
  });

  it("el tenant va en el WHERE de la corrida, de sus piezas y del conteo bajo la tx", async () => {
    await ForestJornadaBloqueDB.declararJornadaAbierta(TENANT, input(), anotarEn);
    expect(H.corridaFind.mock.calls[0]![0].where).toEqual({ id: "c7", tenantId: TENANT });
    expect(H.piezasFind.mock.calls[0]![0].where).toEqual({ tenantId: TENANT, consumidaEnId: "c7" });
    expect(H.txCount.mock.calls[0]![0].where).toEqual({ tenantId: TENANT, consumidaEnId: "c7" });
  });

  it("un cobro que falla no tumba la declaración", async () => {
    H.recotizar.mockRejectedValue(new Error("tarifa"));
    const r = await ForestJornadaBloqueDB.declararJornadaAbierta(TENANT, input(), anotarEn);
    expect(r.yaEstaba).toBe(false);
    expect(H.confirmado).toEqual(["declarar"]);
  });
});

describe("declararJornadaAbierta: sólo la corrida del bloque entero", () => {
  const rechaza = async () => {
    const err = await ForestJornadaBloqueDB.declararJornadaAbierta(TENANT, input(), anotarEn).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CtpInvariantError);
    expect((err as CtpInvariantError).code).toBe("LINEA_NO_EDITABLE");
    expect((err as CtpInvariantError).detail?.motivo).toBe("CORRIDA_NO_ES_DEL_BLOQUE");
    expect(H.txOpts).toEqual([]);
    expect(espias.declararEnTx).not.toHaveBeenCalled();
  };

  it("una pieza de otro lote en la corrida", async () => {
    H.piezasFind.mockResolvedValue([{ id: "t1" }, { id: "t2" }, { id: "t3" }, { id: "ajena" }]);
    await rechaza();
  });

  it("una pieza de menos", async () => {
    H.piezasFind.mockResolvedValue([{ id: "t1" }, { id: "t2" }]);
    await rechaza();
  });

  it("anulada, de otra sección o borrada", async () => {
    H.corridaFind.mockResolvedValue(corrida({ status: "anulado" }));
    await rechaza();
    H.corridaFind.mockResolvedValue(corrida({ section: "ingreso" }));
    await rechaza();
    H.corridaFind.mockResolvedValue(corrida({ deletedAt: new Date() }));
    await rechaza();
    H.corridaFind.mockResolvedValue(null);
    await rechaza();
  });

  it("sin trozas en el pedido: VALIDACION", async () => {
    const err = await ForestJornadaBloqueDB.declararJornadaAbierta(TENANT, input({ trozaIds: ["  "] }), anotarEn).catch((e: unknown) => e);
    expect((err as CtpInvariantError).code).toBe("VALIDACION");
    expect(H.corridaFind).not.toHaveBeenCalled();
  });
});

describe("declararJornadaAbierta: reintentos y carreras", () => {
  it("ya declarada con esas piezas: sólo anota, sin abrir otra tx del Libro", async () => {
    H.corridaFind.mockResolvedValue(corrida({ quantity: 4 }));
    const r = await ForestJornadaBloqueDB.declararJornadaAbierta(TENANT, input(), anotarEn);
    expect(r).toMatchObject({ corrida: { id: "c7", lineNo: 7 }, yaEstaba: true });
    expect(espias.validar).not.toHaveBeenCalled();
    expect(espias.declararEnTx).not.toHaveBeenCalled();
    expect(bloqueGuardado()?.jornadasLibro?.[0]).toMatchObject({ estado: "declarada" });
  });

  it("si otra corrida le sumó o quitó piezas bajo la tx, tira y no confirma nada", async () => {
    H.txCount.mockResolvedValue(4);
    await expect(ForestJornadaBloqueDB.declararJornadaAbierta(TENANT, input(), anotarEn)).rejects.toBeInstanceOf(CtpInvariantError);
    expect(H.confirmado).toEqual([]);
    expect(espias.declararEnTx).not.toHaveBeenCalled();
    expect(espias.despues).not.toHaveBeenCalled();
    expect(bloqueGuardado()?.jornadasLibro?.[0]).toMatchObject({ estado: "abierta" });
  });

  it("si la toma bajo lock pierde la carrera, no se anota ni se audita", async () => {
    espias.declararEnTx.mockImplementation((async () => {
      throw new CtpInvariantError("ya declarada", "LINEA_NO_EDITABLE", { motivo: "CORRIDA_YA_DECLARADA" });
    }) as never);
    await expect(ForestJornadaBloqueDB.declararJornadaAbierta(TENANT, input(), anotarEn)).rejects.toThrow("ya declarada");
    expect(espias.despues).not.toHaveBeenCalled();
    expect(H.recotizar).not.toHaveBeenCalled();
    expect(bloqueGuardado()?.jornadasLibro?.[0]).toMatchObject({ estado: "abierta" });
  });
});
