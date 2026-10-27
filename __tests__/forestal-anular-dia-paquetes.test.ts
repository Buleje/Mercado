/**
 * «Anular el día» y los paquetes de sus corridas (Brandon, 27-10: que frene
 * igual que anular una corrida cuando un paquete de esa corrida ya va en una
 * guía). Con las clases de verdad —`ForestCtpAnularDiaDB`, `ForestCtpDB` y la
 * regla de `ForestCtpDespachoDB.guiasConPaquetesEn`— sobre una tx falsa:
 *
 *  · un paquete de una corrida del día en una guía VIVA → 409 CON_MOVIMIENTOS
 *    que dice corrida, paquete y guía, y no se escribe nada (la previa ya lo
 *    avisa antes de confirmar);
 *  · sin guía → se anulan todas y sus paquetes se dan de baja en la misma tx,
 *    con el orden de candados corridas → paquetes;
 *  · una guía ANULADA ya no lleva el paquete: no frena.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Guia = { lineNo: number; gtfNumber: string | null; codigoProducto: string; status: string; deletedAt: Date | null };

const H = vi.hoisted(() => ({
  paquetes: [] as { id: string; codigo: string; ctpEntryId: string; deletedAt: Date | null }[],
  guias: [] as Guia[],
  escrituras: [] as string[],
  /* Se llena abajo, con la tx ya armada: el factory de vi.mock corre antes. */
  prisma: {} as Record<string, unknown>,
}));

const CORRIDAS = [
  { id: "c30", lineNo: 30, speciesCommon: "Panguana" },
  { id: "c31", lineNo: 31, speciesCommon: "Cumala" },
];

type DondeDespacho = { section?: string; status?: string; deletedAt?: null; codigoProducto?: { in: string[] } };

const tx = {
  $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    if (strings.join("?").includes("ForestCtpPaquete")) {
      H.escrituras.push("lock-paquetes");
      const corridas = values[1] as string[];
      return H.paquetes
        .filter((p) => p.deletedAt == null && corridas.includes(p.ctpEntryId))
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(({ codigo, ctpEntryId }) => ({ codigo, ctpEntryId }));
    }
    H.escrituras.push("lock-corridas");
    return CORRIDAS.map(({ id }) => ({ id }));
  }),
  forestCtpEntry: {
    findMany: vi.fn(async ({ where }: { where: DondeDespacho }) => {
      if (where.section === "despacho") {
        /* La regla viaja en el where: sólo guías vigentes que llevan el código. */
        return H.guias
          .filter((g) => g.status === where.status && g.deletedAt === where.deletedAt && where.codigoProducto?.in.includes(g.codigoProducto))
          .map(({ lineNo, gtfNumber, codigoProducto }) => ({ lineNo, gtfNumber, codigoProducto }));
      }
      return CORRIDAS.map((c) => ({
        ...c,
        entryDate: new Date("2026-10-27T00:00:00.000Z"),
        consumos: [],
        _count: { trozasConsumidas: 0, reprocesosEntrada: 0 },
        reprocesosSalida: [],
        salidas: [],
        loteMiembros: [],
        apartados: [],
        paquetes: H.paquetes.filter((p) => p.ctpEntryId === c.id && p.deletedAt == null).map(({ codigo }) => ({ codigo })),
      }));
    }),
    update: vi.fn(async ({ where }: { where: { id: string } }) => {
      H.escrituras.push(`anular(${where.id})`);
      const c = CORRIDAS.find((x) => x.id === where.id)!;
      return { ...c, section: "produccion", codigoProducto: null, status: "anulado" };
    }),
  },
  forestLoteAserrio: { findMany: vi.fn(async () => []) },
  forestCuentaMov: { findMany: vi.fn(async () => []) },
  forestCtpPaquete: {
    findMany: vi.fn(async ({ where }: { where: { ctpEntryId: string } }) =>
      H.paquetes.filter((p) => p.deletedAt == null && p.ctpEntryId === where.ctpEntryId).map(({ id, codigo }) => ({ id, codigo })),
    ),
    updateMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
      H.escrituras.push("baja-paquetes");
      let count = 0;
      for (const p of H.paquetes) if (where.id.in.includes(p.id) && p.deletedAt == null) (p.deletedAt = new Date(), count++);
      return { count };
    }),
  },
  woodEntryTroza: { updateMany: vi.fn(async () => ({ count: 0 })), count: vi.fn(async () => 0) },
};

vi.mock("server-only", () => ({}));
Object.assign(H.prisma, {
  ...tx,
  forestCtpEntry: { ...tx.forestCtpEntry, findFirst: vi.fn(async () => ({ entryDate: new Date("2026-10-27T00:00:00.000Z") })) },
  $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn(), getOrSet: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn(), auditCtpEsperando: vi.fn() }));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { closedPeriodOf: vi.fn(async () => null) } }));
vi.mock("@/lib/db/forest-aserrio.db", () => ({ ForestAserrioDB: { alAnular: vi.fn(async () => undefined) } }));

import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { ForestCtpAnularDiaDB } from "@/lib/db/forest-ctp-anular-dia.db";

const T = "t-qa";
const DIA = "2026-10-27";
const pedido = { dia: DIA, ids: ["c31", "c30"], motivo: "Cubicación cargada dos veces" };

beforeEach(() => {
  vi.spyOn(ForestCtpDB, "jornadasDeProduccion").mockResolvedValue([
    { dia: DIA, corridas: 2, m3: 1.2, pt: 508, piezas: 14, detalle: { duenos: [] } },
  ] as never);
  H.paquetes = [
    { id: "p30", codigo: "PQ-2610-030", ctpEntryId: "c30", deletedAt: null },
    { id: "p31", codigo: "PQ-2610-031", ctpEntryId: "c31", deletedAt: null },
  ];
  H.guias = [];
  H.escrituras = [];
});

describe("un paquete del día en una guía viva frena «Anular el día»", () => {
  beforeEach(() => {
    H.guias = [{ lineNo: 12, gtfNumber: "019-001-000123", codigoProducto: "PQ-2610-031", status: "registrado", deletedAt: null }];
  });

  it("409 que dice corrida, paquete y guía; no anula ninguna ni da de baja nada", async () => {
    const e = await ForestCtpAnularDiaDB.anular(T, pedido, "qaadmin").catch((x: unknown) => x);
    expect(e).toMatchObject({ code: "CON_MOVIMIENTOS" });
    expect((e as Error).message).toContain(
      "N.º 31 · Cumala: tiene el paquete PQ-2610-031 en la guía 019-001-000123 (despacho N.º 12): anula esa salida primero",
    );
    expect((e as Error).message).not.toContain("N.º 30");
    expect(H.escrituras).toEqual(["lock-corridas", "lock-paquetes"]);
    expect(H.paquetes.every((p) => p.deletedAt == null)).toBe(true);
  });

  it("la previa ya lo dice antes de confirmar", async () => {
    const p = await ForestCtpAnularDiaDB.previa(T, DIA);
    expect(p.corridas.find((c) => c.lineNo === 31)?.bloqueos).toEqual([
      "tiene el paquete PQ-2610-031 en la guía 019-001-000123 (despacho N.º 12): anula esa salida primero",
    ]);
    expect(p.corridas.find((c) => c.lineNo === 30)?.bloqueos).toEqual([]);
  });
});

describe("sin guía viva, el día se anula con sus paquetes", () => {
  it("anula las dos corridas y da de baja sus paquetes en la misma tx, corridas → paquetes", async () => {
    const r = await ForestCtpAnularDiaDB.anular(T, pedido, "qaadmin");
    expect(r.anuladas.map((a) => a.lineNo)).toEqual([30, 31]);
    expect(H.paquetes.every((p) => p.deletedAt != null)).toBe(true);
    expect(H.escrituras).toEqual([
      "lock-corridas",
      "lock-paquetes",
      "anular(c30)",
      "baja-paquetes",
      "anular(c31)",
      "baja-paquetes",
    ]);
  });

  it("una guía ANULADA que llevaba el paquete no frena", async () => {
    H.guias = [{ lineNo: 12, gtfNumber: "019-001-000123", codigoProducto: "PQ-2610-031", status: "anulado", deletedAt: null }];
    const r = await ForestCtpAnularDiaDB.anular(T, pedido, "qaadmin");
    expect(r.anuladas).toHaveLength(2);
    expect(H.paquetes.every((p) => p.deletedAt != null)).toBe(true);
  });
});
