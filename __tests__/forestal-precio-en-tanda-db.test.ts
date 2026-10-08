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
    /* ADR-478: cubicaciones de trozas aplicadas (la base trae candidatas por la cola del N°). */
    cubicaciones: [] as { codigo: string; gtfNumber: string }[],
    cierres: [] as unknown[],
    updates: [] as { where: Record<string, unknown>; data: Record<string, unknown> }[],
    countPorUpdate: 1,
    locks: 0,
    auditorias: [] as { action: string; detail: string }[],
    /* ADR-437: el abono `madera` de cada guía anotada, por gtf. */
    abonos: new Map<string, { id: string; monto: number }>(),
    abonosEscritos: [] as { id: string; monto: string }[],
    locksGuia: [] as string[],
    orden: [] as string[],
  };
  const tx = {
    $queryRaw: async () => {
      estado.locks++;
      estado.orden.push("filas");
      return [];
    },
    $executeRaw: async (strings: TemplateStringsArray, ...vals: unknown[]) => {
      if (strings.join("?").includes("pg_advisory_xact_lock")) {
        estado.locksGuia.push(String(vals[0]));
        estado.orden.push(`lock:${String(vals[0])}`);
      }
      return 1;
    },
    woodEntry: {
      findMany: async () => estado.filas,
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        estado.updates.push(args);
        const f = estado.filas.find((x) => x.id === args.where.id);
        if (f) f.costoTotal = String(args.data.costoTotal);
        return { count: estado.countPorUpdate };
      },
      /* La suma que usa la re-sincronización: costo vivo en soles de la guía. */
      aggregate: async (args: { where: { gtfNumber: string } }) => {
        const suma = estado.filas
          .filter((f) => f.gtfNumber === args.where.gtfNumber && f.costoTotal != null && (f.moneda ?? "PEN") === "PEN")
          .reduce((t, f) => t + Number(f.costoTotal), 0);
        return { _sum: { costoTotal: suma } };
      },
      count: async () => 0,
    },
    forestCtpConsumo: { findMany: async () => estado.congelados },
    forestCubicacionTrozas: { findMany: async () => estado.cubicaciones },
    forestCuentaMov: {
      findFirst: async (args: { where: { gtfNumber: string } }) => estado.abonos.get(args.where.gtfNumber) ?? null,
      update: async (args: { where: { id: string }; data: { monto?: { toString(): string } } }) => {
        if (args.data.monto) estado.abonosEscritos.push({ id: args.where.id, monto: args.data.monto.toString() });
        return {};
      },
    },
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
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";

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
  H.estado.cubicaciones = [];
  H.estado.cierres = [];
  H.estado.updates = [];
  H.estado.countPorUpdate = 1;
  H.estado.locks = 0;
  H.estado.auditorias = [];
  H.estado.abonos = new Map();
  H.estado.abonosEscritos = [];
  H.estado.locksGuia = [];
  H.estado.orden = [];
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
  it("ADR-478 (revisión M): una guía pagada con una cubicación aplicada no recibe costo en tanda → GUIA_PAGADA_POR_CUBICACION, sin escribir nada", async () => {
    H.estado.cubicaciones = [{ codigo: "CUB-2026-0004", gtfNumber: "gtf-b" }];
    const err = await WoodEntriesPrecioDB.ponerPrecio("tenant-qa", input(180), "qaadmin").catch((e) => e);
    expect(err).toBeInstanceOf(CtpInvariantError);
    expect(err).toMatchObject({ code: "ESTADO_NO_EDITABLE", detail: { motivo: "GUIA_PAGADA_POR_CUBICACION", gtfNumber: "GTF-b", cubicacion: "CUB-2026-0004" } });
    expect(H.estado.locksGuia).toEqual(["guia-plata:tenant-qa:GTF-a", "guia-plata:tenant-qa:GTF-b"]);
    expect(H.estado.updates).toEqual([]);
  });

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

  it("ADR-437: con «también las que ya tienen precio», el abono madera de la guía anotada pasa a valer el costo nuevo, en la misma tx", async () => {
    H.estado.filas = [filaDb("a", "Mashonaste", "9.4200", { costoTotal: "1000.00" }), filaDb("b", "Ana Caspi", "8.3840")];
    H.estado.abonos.set("GTF-a", { id: "mov-a", monto: 1000 });
    const r = await WoodEntriesPrecioDB.ponerPrecio(
      "tenant-qa",
      input(180, { tambienConPrecio: true, vistos: [{ id: "a", antes: 1000 }, { id: "b", antes: null }] }),
      "qaadmin",
    );
    expect(r.estado).toBe("hecho");
    // El abono viejo (S/ 1000) no queda: vale lo que la guía vale ahora.
    expect(H.estado.abonosEscritos).toEqual([{ id: "mov-a", monto: "1695.6" }]);
    // Las guías se bloquean ANTES que las filas, en orden (mismo orden que el modal y la liquidación).
    expect(H.estado.locksGuia).toEqual(["guia-plata:tenant-qa:GTF-a", "guia-plata:tenant-qa:GTF-b"]);
    expect(H.estado.orden.indexOf("filas")).toBeGreaterThan(H.estado.orden.indexOf("lock:guia-plata:tenant-qa:GTF-b"));
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
