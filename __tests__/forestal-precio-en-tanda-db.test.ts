/**
 * WoodEntriesPrecioDB.ponerPrecio — lo que llega a la base.
 *
 * La regla (qué filas, cuánto) está probada en `forestal-precio-en-tanda.test.ts`;
 * acá se prueba la ESCRITURA: que el dedazo sin confirmar no escribe nada, que
 * cada `updateMany` lleva el `tenantId` en el WHERE, que el mes cerrado y el
 * costo congelado se leen dentro de la transacción, y que si una fila no se
 * escribe se tira (la transacción no deja la tanda a medias).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  const estado = {
    filas: [] as Record<string, unknown>[],
    congelados: [] as { woodEntryId: string }[],
    cierres: [] as unknown[],
    updates: [] as { where: Record<string, unknown>; data: Record<string, unknown> }[],
    countPorUpdate: 1,
    locks: 0,
    auditorias: [] as { action: string; detail: string }[],
  };
  const tx = {
    $queryRaw: async () => {
      estado.locks++;
      return [];
    },
    woodEntry: {
      findMany: async () => estado.filas,
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        estado.updates.push(args);
        return { count: estado.countPorUpdate };
      },
    },
    forestCtpConsumo: { findMany: async () => estado.congelados },
  };
  return { estado, tx };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) => fn(H.tx),
    woodEntry: { findMany: async () => H.estado.filas },
    forestPlanSpecies: {
      findMany: async () => [{ speciesCommon: "Tornillo (Cedrelinga catenaeformis)", precioVentaSoles: "180.00", valorEstadoNaturalSoles: "12.50" }],
    },
    forestCtpPaquete: { findMany: async () => [{ precioVentaPt: "7.0000", entry: { speciesCommon: "Tornillo" } }] },
    forestCtpConsumo: { findMany: async () => H.estado.congelados },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/forestal/ctp-audit", async (real) => ({
  ...(await real<typeof import("@/lib/forestal/ctp-audit")>()),
  auditCtpEsperando: async (p: { action: string; detail: string }) => {
    H.estado.auditorias.push(p);
  },
}));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { list: async () => H.estado.cierres } }));

import { WoodEntriesPrecioDB } from "@/lib/db/wood-entries-precio.db";
import { invalidateByPrefix } from "@/lib/cache";

const SANTOS = "SANTOS MUÑOZ JOSE HORD";
const filaDb = (id: string, especie: string, vol: string, extra: Record<string, unknown> = {}) => ({
  id,
  gtfNumber: `GTF-${id}`,
  entryDate: new Date("2026-09-08T05:00:00.000Z"),
  providerName: SANTOS,
  speciesCommonName: especie,
  volumeM3: vol,
  costoTotal: null,
  moneda: "PEN",
  status: "validado",
  contrato: { codigo: "10-HUA-PUE/PER-FMP-2026-007" },
  ...extra,
});

beforeEach(() => {
  H.estado.filas = [filaDb("a", "Mashonaste", "9.4200"), filaDb("b", "Ana Caspi", "8.3840")];
  H.estado.congelados = [];
  H.estado.cierres = [];
  H.estado.updates = [];
  H.estado.countPorUpdate = 1;
  H.estado.locks = 0;
  H.estado.auditorias = [];
  vi.mocked(invalidateByPrefix).mockClear();
});

const input = (precioM3: number, extra: Record<string, unknown> = {}) => ({
  precios: [
    { proveedor: SANTOS, especie: "Mashonaste", precioM3 },
    { proveedor: SANTOS, especie: "Ana Caspi", precioM3 },
  ],
  vistos: [
    { id: "a", antes: null },
    { id: "b", antes: null },
  ],
  tambienConPrecio: false,
  confirmarAvisos: false,
  ...extra,
});

describe("WoodEntriesPrecioDB.ponerPrecio", () => {
  it("escribe cada costo con el tenant en el WHERE, bloquea antes y audita la tanda", async () => {
    const r = await WoodEntriesPrecioDB.ponerPrecio("tenant-qa", input(180), "qaadmin");
    expect(r.estado).toBe("hecho");
    expect(H.estado.locks).toBe(1);
    expect(H.estado.updates.map((u) => [u.where.id, u.where.tenantId, String(u.data.costoTotal), u.data.moneda])).toEqual([
      ["a", "tenant-qa", "1695.6", "PEN"],
      ["b", "tenant-qa", "1509.12", "PEN"],
    ]);
    if (r.estado === "hecho") expect(r.totales).toEqual({ filas: 2, m3: 17.804, soles: 3204.72, pisadas: 0 });
    expect(invalidateByPrefix).toHaveBeenCalledWith("wood-entries:tenant-qa");
    expect(invalidateByPrefix).toHaveBeenCalledWith("forest-contrato:tenant-qa");
    expect(H.estado.auditorias[0]).toMatchObject({ action: "ctp_ingreso_costo_tanda" });
    expect(H.estado.auditorias[0].detail).toMatch(/2 ingresos · 17[.,]804 m³/);
    // El «antes → después» de cada guía ya está escrito AL RESPONDER (se espera).
    expect(H.estado.auditorias.slice(1).map((a) => [a.action, a.detail.match(/GTF-\w+ en tanda · sin costo → S\/ [\d.]+/)?.[0]])).toEqual([
      ["ctp_ingreso_costo", "GTF-a en tanda · sin costo → S/ 1695.60"],
      ["ctp_ingreso_costo", "GTF-b en tanda · sin costo → S/ 1509.12"],
    ]);
  });

  it("un dedazo sin confirmar NO escribe nada y devuelve el aviso", async () => {
    // Mashonaste no tiene plan propio: su referencia es la del Tornillo del plan (S/ 180).
    const r = await WoodEntriesPrecioDB.ponerPrecio("tenant-qa", input(1800), "qaadmin");
    expect(r.estado).toBe("avisos");
    if (r.estado === "avisos") expect(r.avisos[0].avisos[0]).toMatch(/¿Sobra un cero\?/);
    expect(H.estado.locks).toBe(0);
    expect(H.estado.updates).toEqual([]);
  });

  it("confirmado, el mismo precio se escribe", async () => {
    const r = await WoodEntriesPrecioDB.ponerPrecio("tenant-qa", input(1800, { confirmarAvisos: true }), "qaadmin");
    expect(r.estado).toBe("hecho");
    expect(H.estado.updates).toHaveLength(2);
  });

  it("mes cerrado y costo congelado se leen DENTRO de la transacción y se saltan", async () => {
    H.estado.cierres = [
      { periodKey: "2026-09", from: "2026-09-01T05:00:00.000Z", to: "2026-10-01T04:59:59.999Z", label: "setiembre de 2026" },
    ];
    const r = await WoodEntriesPrecioDB.ponerPrecio("tenant-qa", input(180), "qaadmin");
    expect(H.estado.updates).toEqual([]);
    if (r.estado === "hecho") expect(r.saltadas.map((s) => [s.id, s.motivo, s.detalle])).toEqual([
      ["a", "periodo-cerrado", "setiembre de 2026"],
      ["b", "periodo-cerrado", "setiembre de 2026"],
    ]);
    expect(invalidateByPrefix).not.toHaveBeenCalled();
    // Una tanda que no cambió nada no deja renglón de auditoría.
    expect(H.estado.auditorias).toEqual([]);

    H.estado.cierres = [];
    H.estado.filas = [filaDb("a", "Mashonaste", "9.4200", { costoTotal: "1500.00" })];
    H.estado.congelados = [{ woodEntryId: "a" }];
    const r2 = await WoodEntriesPrecioDB.ponerPrecio(
      "tenant-qa",
      input(180, { tambienConPrecio: true, vistos: [{ id: "a", antes: 1500 }] }),
      "qaadmin",
    );
    if (r2.estado === "hecho") expect(r2.saltadas[0].motivo).toBe("congelado");
    expect(H.estado.updates).toEqual([]);
  });

  it("si una fila no se escribe, tira: la transacción no deja la tanda a medias", async () => {
    H.estado.countPorUpdate = 0;
    await expect(WoodEntriesPrecioDB.ponerPrecio("tenant-qa", input(180), "qaadmin")).rejects.toThrow(/GTF-a/);
  });

  it("sin tenant no hace nada", async () => {
    await expect(WoodEntriesPrecioDB.ponerPrecio("", input(180), "qaadmin")).rejects.toThrow(/tenantId/);
  });
});
