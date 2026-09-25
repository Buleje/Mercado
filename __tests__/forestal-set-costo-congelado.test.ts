/**
 * `WoodEntriesDB.setCosto` (una guía) y la tanda comparten el freno del costo
 * congelado (`lib/db/costo-congelado.db.ts`). Revisión + seguridad 2026-09-25:
 * `setCosto` admitía `procesado` pero no miraba el congelado, y la tanda sí —
 * dos puertas a la misma plata con reglas distintas.
 *
 * Base simulada: se afirma sobre el `update` capturado, no sobre el retorno.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  entry: null as Record<string, unknown> | null,
  congelados: [] as { woodEntryId: string }[],
  updates: [] as unknown[],
  consultasCongelado: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    woodEntry: {
      findFirst: vi.fn(async () => H.entry),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => {
        H.updates.push(args);
        return { ...H.entry, ...args.data };
      }),
    },
    forestCtpConsumo: {
      findMany: vi.fn(async (args: unknown) => {
        H.consultasCongelado.push(args);
        return H.congelados;
      }),
    },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/forestal/ctp-audit", async (real) => ({
  ...(await real<typeof import("@/lib/forestal/ctp-audit")>()),
  auditCtp: vi.fn(),
  auditCtpEsperando: vi.fn(async () => {}),
}));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({
  ForestCtpCierreDB: { list: async () => [], closedPeriodOf: async () => null, isClosedOn: async () => false },
}));

import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";

const guia = (extra: Record<string, unknown> = {}) => ({
  id: "w1",
  tenantId: "tenant-qa",
  gtfNumber: "001-0000201",
  status: "procesado",
  entryDate: new Date("2026-07-06T05:00:00.000Z"),
  costoTotal: "8400.00",
  moneda: "PEN",
  deletedAt: null,
  ...extra,
});

beforeEach(() => {
  H.entry = guia();
  H.congelados = [];
  H.updates = [];
  H.consultasCongelado = [];
});

describe("WoodEntriesDB.setCosto — mismo freno que la tanda", () => {
  it("una guía PROCESADA sin congelar sí se valoriza (la cuenta la Plata del permiso)", async () => {
    await WoodEntriesDB.setCosto("tenant-qa", "w1", { costoTotal: 3050.78 }, "qaadmin");
    expect(H.updates).toHaveLength(1);
    expect(H.consultasCongelado[0]).toMatchObject({
      where: { tenantId: "tenant-qa", congeladoAt: { not: null }, woodEntryId: { in: ["w1"] } },
    });
  });

  it("con el costo congelado en una corrida, NO escribe y tira CONGELADO (→ 422)", async () => {
    H.congelados = [{ woodEntryId: "w1" }];
    const err = await WoodEntriesDB.setCosto("tenant-qa", "w1", { costoTotal: 3050.78 }, "qaadmin").catch((e) => e);
    expect(err).toBeInstanceOf(CtpInvariantError);
    expect(err).toMatchObject({ code: "CONGELADO" });
    expect(String(err.message)).toMatch(/001-0000201.*congelado/);
    expect(H.updates).toEqual([]);
  });

  it("borrar el costo (null) de una guía congelada tampoco se puede", async () => {
    H.congelados = [{ woodEntryId: "w1" }];
    await expect(WoodEntriesDB.setCosto("tenant-qa", "w1", { costoTotal: null }, "qaadmin")).rejects.toMatchObject({
      code: "CONGELADO",
    });
    expect(H.updates).toEqual([]);
  });

  it("anulada o rechazada no lleva costo, igual que en la tanda", async () => {
    for (const status of ["anulado", "rechazado"]) {
      H.entry = guia({ status });
      await expect(WoodEntriesDB.setCosto("tenant-qa", "w1", { costoTotal: 100 }, "qaadmin")).rejects.toMatchObject({
        code: "ESTADO_NO_EDITABLE",
      });
    }
    expect(H.updates).toEqual([]);
  });
});
