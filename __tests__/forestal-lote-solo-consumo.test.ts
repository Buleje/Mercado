/**
 * «Declarar solo consumo de trozas» sobre un lote programado y vacío (Brandon, 03-11).
 *
 * Lo que no puede pasar: que el lote quede «En consumo» con piezas adentro (el
 * consumo saldría de dos lados) ni que quede una corrida suelta en el libro
 * cuando el guardado no se completa.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  lote: null as null | Record<string, unknown>,
  /** Piezas que devuelve cada `count`, en orden (antes y después del guardado). */
  conteos: [] as number[],
  updateCount: 1,
  updateFalla: false,
  updates: [] as Record<string, unknown>[],
  creadas: [] as Record<string, unknown>[],
  retiradas: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn(), auditCtpEsperando: vi.fn() }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn(), getOrSet: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    woodEntryTroza: { count: async () => H.conteos.shift() ?? 0 },
    forestLoteAserrio: {
      findFirst: async () => H.lote,
      updateMany: async (args: Record<string, unknown>) => {
        H.updates.push(args);
        if (H.updateFalla) throw new Error("se cortó la conexión");
        return { count: H.updates.length === 1 ? H.updateCount : 1 };
      },
    },
  },
}));
vi.mock("@/lib/db/forest-ctp.db", async (original) => ({
  ...(await original<typeof import("@/lib/db/forest-ctp.db")>()),
  ForestCtpDB: {
    create: async (_t: string, data: Record<string, unknown>) => {
      H.creadas.push(data);
      return { id: "corrida-1", lineNo: 7 };
    },
    softDelete: async (_t: string, id: string) => {
      H.retiradas.push(id);
    },
  },
}));

import { ForestLoteAserrioDB } from "@/lib/db/forest-lote-aserrio.db";

const T = "tenant-a";
const vacio = {
  id: "lote-1",
  code: "32-2026",
  status: "abierto",
  produccionEntryId: null,
  speciesCommon: "Tornillo",
  speciesScientific: "Cedrelinga cateniformis",
  inicioProceso: new Date("2026-10-01T12:00:00.000Z"),
  notes: "Copiado del SNIFFS · Producción pendiente de declarar",
};

beforeEach(() => {
  H.lote = { ...vacio };
  H.conteos = [0, 0];
  H.updateCount = 1;
  H.updateFalla = false;
  H.updates = [];
  H.creadas = [];
  H.retiradas = [];
});

describe("ForestLoteAserrioDB.declararSoloConsumo", () => {
  it("abre la corrida con el m³ y deja el lote en consumo, sin repetir la marca que ya traía la nota", async () => {
    const r = await ForestLoteAserrioDB.declararSoloConsumo(T, "lote-1", { volumenConsumidoM3: 4.1, createdBy: "brandon" });
    expect(r.code).toBe("32-2026");
    expect(H.creadas[0]).toMatchObject({ volumeInputM3: 4.1, materiaPrimaRef: "32-2026", entryDate: vacio.inicioProceso });
    const u = H.updates[0] as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(u.where).toMatchObject({ tenantId: T, status: "abierto", produccionEntryId: null, trozas: { none: {} } });
    expect(u.data).toMatchObject({ status: "consumido", produccionEntryId: "corrida-1" });
    expect(String(u.data.notes).match(/Producción pendiente de declarar/g)).toHaveLength(1);
    expect(H.retiradas).toEqual([]);
  });

  it("no toca un lote con piezas ni uno que ya tiene corrida", async () => {
    H.conteos = [3];
    await expect(
      ForestLoteAserrioDB.declararSoloConsumo(T, "lote-1", { volumenConsumidoM3: 2, createdBy: "b" }),
    ).rejects.toThrow(/ya tiene 3 piezas/);
    H.lote = { ...vacio, produccionEntryId: "otra" };
    H.conteos = [0];
    await expect(
      ForestLoteAserrioDB.declararSoloConsumo(T, "lote-1", { volumenConsumidoM3: 2, createdBy: "b" }),
    ).rejects.toThrow(/ya tiene su consumo/);
    expect(H.creadas).toEqual([]);
  });

  it("si otra pantalla ganó el lote, retira su corrida", async () => {
    H.updateCount = 0;
    await expect(
      ForestLoteAserrioDB.declararSoloConsumo(T, "lote-1", { volumenConsumidoM3: 2, createdBy: "b" }),
    ).rejects.toThrow(/cambió mientras guardabas/);
    expect(H.retiradas).toEqual(["corrida-1"]);
  });

  it("si el guardado del lote se cae, no deja la corrida suelta en el libro", async () => {
    H.updateFalla = true;
    await expect(
      ForestLoteAserrioDB.declararSoloConsumo(T, "lote-1", { volumenConsumidoM3: 2, createdBy: "b" }),
    ).rejects.toThrow(/conexión/);
    expect(H.retiradas).toEqual(["corrida-1"]);
  });

  it("si se coló una pieza mientras guardaba, devuelve el lote a abierto y retira la corrida", async () => {
    H.conteos = [0, 1];
    await expect(
      ForestLoteAserrioDB.declararSoloConsumo(T, "lote-1", { volumenConsumidoM3: 2, createdBy: "b" }),
    ).rejects.toThrow(/le cargaron piezas/);
    const vuelta = H.updates[1] as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(vuelta.where).toMatchObject({ tenantId: T, produccionEntryId: "corrida-1" });
    expect(vuelta.data).toMatchObject({ status: "abierto", produccionEntryId: null, notes: vacio.notes });
    expect(H.retiradas).toEqual(["corrida-1"]);
  });

  it("rechaza un volumen de 0", async () => {
    await expect(
      ForestLoteAserrioDB.declararSoloConsumo(T, "lote-1", { volumenConsumidoM3: 0, createdBy: "b" }),
    ).rejects.toThrow(/mayor a 0/);
  });
});
