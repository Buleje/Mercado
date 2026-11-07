/**
 * Anular (o borrar) una corrida de producción, lado DB (prueba del Recorrido
 * del permiso, 27-10: PQ-2609-031 quedó vivo colgado de la corrida N° 48
 * anulada).
 *
 *  · Sus paquetes se dan de baja en la MISMA transacción; uno que ya viaja en
 *    una guía viva no se toca.
 *  · Una corrida de la que ya salió madera (despacho o reproceso vivos) no se
 *    anula suelta: 409 que pide anular la salida primero. Sólo el camino
 *    forzado del lote de aserrío (`forzarConSalida`) pasa. También frena si un
 *    PAQUETE de la corrida va en una guía viva aunque el origen de esa guía
 *    sea otra corrida (revisión del 27-10).
 *  · Anular un despacho cuyo paquete es de una corrida ya muerta da de baja
 *    ese paquete en la misma tx (salvo salida de trozas u otra guía viva).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  paquetes: [] as { id: string; codigo: string; ctpEntryId: string; corridaViva: boolean; deletedAt: Date | null }[],
  despachosConCodigo: [] as { codigoProducto: string; lineNo?: number; gtfNumber?: string | null }[],
  linea: { section: "produccion", codigoProducto: null as string | null },
  otraGuia: null as { id: string } | null,
  trozasDespachadas: 0,
  origenes: [] as { despacho: { lineNo: number; gtfNumber: string | null } }[],
  reprocesos: [] as { destino: { lineNo: number } }[],
  escrituras: [] as string[],
  enTx: false,
}));

const tx = {
  $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    if (strings.join("?").includes("ForestCtpPaquete")) {
      H.escrituras.push("lock-paquetes");
      const corridas = [values[1]].flat();
      return H.paquetes.filter((p) => p.deletedAt == null && corridas.includes(p.ctpEntryId)).map(({ codigo, ctpEntryId }) => ({ codigo, ctpEntryId }));
    }
    H.escrituras.push("lock");
    return [];
  }),
  forestCtpEntry: {
    update: vi.fn(async () => {
      H.escrituras.push(H.enTx ? "anular(tx)" : "anular(sin tx)");
      return { id: H.linea.section === "despacho" ? "d12" : "c48", lineNo: 48, speciesCommon: "Cachimbo", ...H.linea };
    }),
    findMany: vi.fn(async () => H.despachosConCodigo),
    findFirst: vi.fn(async () => H.otraGuia),
  },
  woodEntryTroza: { updateMany: vi.fn(async () => ({ count: 0 })), count: vi.fn(async () => H.trozasDespachadas) },
  forestCtpPaquete: {
    findMany: vi.fn(async ({ where }: { where: { ctpEntryId: string } }) =>
      H.paquetes.filter((p) => p.deletedAt == null && p.ctpEntryId === where.ctpEntryId).map(({ id, codigo }) => ({ id, codigo })),
    ),
    updateMany: vi.fn(async ({ where }: { where: { id?: { in: string[] }; codigo?: string } }) => {
      H.escrituras.push(H.enTx ? "paquetes(tx)" : "paquetes(sin tx)");
      let count = 0;
      for (const p of H.paquetes) {
        const toca = where.id ? where.id.in.includes(p.id) : p.codigo === where.codigo && !p.corridaViva;
        if (toca && p.deletedAt == null) (p.deletedAt = new Date(), count++);
      }
      return { count };
    }),
  },
  forestCtpDespachoOrigen: { findMany: vi.fn(async () => H.origenes) },
  forestCtpReproceso: { findMany: vi.fn(async () => H.reprocesos) },
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    forestCtpEntry: { findFirst: vi.fn(async () => ({ entryDate: new Date("2026-10-27T12:00:00Z"), lineNo: 48 })) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      H.enTx = true;
      try {
        return await fn(tx);
      } finally {
        H.enTx = false;
      }
    }),
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn(), getOrSet: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn(), auditCtpEsperando: vi.fn() }));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { closedPeriodOf: vi.fn(async () => null) } }));
vi.mock("@/lib/db/forest-aserrio.db", () => ({ ForestAserrioDB: { alAnular: vi.fn(async () => undefined) } }));

import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";

const T = "t-qa";

beforeEach(() => {
  H.paquetes = [
    { id: "p31", codigo: "PQ-2609-031", ctpEntryId: "c48", corridaViva: true, deletedAt: null },
    { id: "p32", codigo: "PQ-2609-032", ctpEntryId: "c48", corridaViva: true, deletedAt: null },
  ];
  H.despachosConCodigo = [];
  H.linea = { section: "produccion", codigoProducto: null };
  H.otraGuia = null;
  H.trozasDespachadas = 0;
  H.origenes = [];
  H.reprocesos = [];
  H.escrituras = [];
});

describe("anular una corrida da de baja sus paquetes", () => {
  it("sin salida: anula y da de baja los dos paquetes, todo dentro de la tx y con la corrida bloqueada", async () => {
    await ForestCtpDB.annul(T, "c48", "limpieza de la prueba", "qaadmin");
    expect(H.paquetes.every((p) => p.deletedAt != null)).toBe(true);
    expect(H.escrituras).toEqual(["lock", "lock-paquetes", "anular(tx)", "paquetes(tx)"]);
  });

  it("un paquete que ya viaja en una guía viva no se da de baja (camino forzado)", async () => {
    H.despachosConCodigo = [{ codigoProducto: "PQ-2609-031" }];
    H.origenes = [{ despacho: { lineNo: 12, gtfNumber: "QA-519-0001" } }];
    await ForestCtpDB.annul(T, "c48", "deshacer lote · FORZADO", "qaadmin", { forzarConSalida: true });
    expect(H.paquetes.find((p) => p.id === "p31")?.deletedAt).toBeNull();
    expect(H.paquetes.find((p) => p.id === "p32")?.deletedAt).not.toBeNull();
  });

  it("borrar (soft) la corrida también los da de baja", async () => {
    await ForestCtpDB.softDelete(T, "c48", "qaadmin");
    expect(H.paquetes.every((p) => p.deletedAt != null)).toBe(true);
  });
});

describe("una corrida con salida viva no se anula suelta", () => {
  it("despacho vivo que la cita → CORRIDA_CON_SALIDA_REGISTRADA con la guía, y no escribe nada", async () => {
    H.origenes = [{ despacho: { lineNo: 12, gtfNumber: "QA-519-0001" } }];
    const r = ForestCtpDB.annul(T, "c48", "me equivoqué", "qaadmin");
    await expect(r).rejects.toBeInstanceOf(CtpInvariantError);
    await expect(ForestCtpDB.annul(T, "c48", "me equivoqué", "qaadmin")).rejects.toMatchObject({
      code: "CORRIDA_CON_SALIDA_REGISTRADA",
      message: expect.stringContaining("De la corrida N° 48 ya salió madera en el despacho N° 12 (GTF QA-519-0001)"),
    });
    expect(H.escrituras.filter((e) => !e.startsWith("lock"))).toEqual([]);
    expect(H.paquetes.every((p) => p.deletedAt == null)).toBe(true);
  });

  it("reproceso vivo → también; y borrar tampoco pasa", async () => {
    H.reprocesos = [{ destino: { lineNo: 50 } }];
    await expect(ForestCtpDB.annul(T, "c48", "x", "qaadmin")).rejects.toThrow("el reproceso N° 50");
    await expect(ForestCtpDB.softDelete(T, "c48", "qaadmin")).rejects.toMatchObject({ code: "CORRIDA_CON_SALIDA_REGISTRADA" });
  });
});

describe("el paquete viaja en una guía cuyo origen es OTRA corrida", () => {
  it("sin forzar → 409 que nombra la guía y el paquete, y no escribe nada", async () => {
    H.despachosConCodigo = [{ codigoProducto: "PQ-2609-031", lineNo: 14, gtfNumber: "QA-519-0002" }];
    await expect(ForestCtpDB.annul(T, "c48", "me equivoqué", "qaadmin")).rejects.toMatchObject({
      code: "CORRIDA_CON_SALIDA_REGISTRADA",
      message: expect.stringContaining("el despacho N° 14 (GTF QA-519-0002), que lleva el paquete PQ-2609-031"),
      detail: expect.objectContaining({ despachos: [14], paquetes: ["PQ-2609-031"] }),
    });
    expect(H.escrituras).toEqual(["lock", "lock-paquetes"]);
    expect(H.paquetes.every((p) => p.deletedAt == null)).toBe(true);
  });
});

describe("anular un despacho da de baja el paquete de una corrida ya muerta", () => {
  beforeEach(() => {
    H.linea = { section: "despacho", codigoProducto: "PQ-2609-031" };
    H.paquetes[0].corridaViva = false;
  });

  it("corrida muerta y ninguna otra guía lo cita → baja en la misma tx", async () => {
    await ForestCtpDB.annul(T, "d12", "el camión no salió", "qaadmin");
    expect(H.paquetes.find((p) => p.id === "p31")?.deletedAt).not.toBeNull();
    expect(H.paquetes.find((p) => p.id === "p32")?.deletedAt).toBeNull();
    expect(H.escrituras).toEqual(["lock", "lock-paquetes", "anular(tx)", "paquetes(tx)"]);
    expect(tx.forestCtpPaquete.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ codigo: "PQ-2609-031", entry: { NOT: { deletedAt: null, status: "registrado" } } }) }),
    );
  });

  it("borrar el despacho también", async () => {
    await ForestCtpDB.softDelete(T, "d12", "qaadmin");
    expect(H.paquetes.find((p) => p.id === "p31")?.deletedAt).not.toBeNull();
  });

  it("otra guía viva lo sigue citando, o era una salida de trozas sin aserrar → no se toca", async () => {
    H.otraGuia = { id: "d15" };
    await ForestCtpDB.annul(T, "d12", "x", "qaadmin");
    H.otraGuia = null;
    H.trozasDespachadas = 1;
    await ForestCtpDB.annul(T, "d12", "x", "qaadmin");
    expect(H.paquetes.every((p) => p.deletedAt == null)).toBe(true);
  });
});
