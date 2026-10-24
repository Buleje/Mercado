/**
 * `ForestCtpDB.paquetesSinMedidas` con la base simulada.
 *
 * Lo que ningún tipo ve y se fija acá:
 *  · la lectura lleva el `tenantId` (en el paquete Y en su corrida) y trae sólo
 *    lo que el editor de escuadría puede corregir: paquete vivo de una corrida
 *    de producción registrada y no borrada;
 *  · «falta» en el WHERE es null o ≤ 0 en CADA una de las tres medidas (la vara
 *    de `escuadriaCompleta`), no sólo null;
 *  · el total sale de un `count` en la base y la lista va recortada: no se
 *    bajan los 835 paquetes al cliente para saber que son 34;
 *  · un paquete de un mes cerrado sale marcado, no escondido;
 *  · un paquete completo que se cuele igual no llega a la lista.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  count: vi.fn(),
  findMany: vi.fn(),
  cierres: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: { forestCtpPaquete: { count: H.count, findMany: H.findMany } },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn() }));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { list: H.cierres } }));

import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { LIMITE_PAQUETES_SIN_MEDIDAS } from "@/lib/forestal/paquetes-sin-medidas";

const TENANT = "tenant-qa";

const dec = (n: number) => ({ toString: () => String(n), valueOf: () => n }) as never;

/** Un paquete de Blas sin medidas: SL-7 de la corrida N.º 29, 22/09/2026. */
const fila = (x: Record<string, unknown> = {}) => ({
  id: "pq-sl7",
  codigo: "SL-7",
  ctpEntryId: "c29",
  productType: "MADERA ASERRADA (COMERCIAL)",
  cantidad: 12,
  volumenM3: dec(1.25),
  espesorCm: null,
  anchoCm: null,
  largoM: null,
  entry: {
    lineNo: 29,
    entryDate: new Date("2026-09-22T00:00:00.000Z"),
    speciesCommon: "Cachimbo",
    productType: null,
  },
  ...x,
});

beforeEach(() => {
  vi.clearAllMocks();
  H.count.mockResolvedValue(1);
  H.findMany.mockResolvedValue([fila()]);
  H.cierres.mockResolvedValue([]);
});

describe("ForestCtpDB.paquetesSinMedidas", () => {
  it("sin tenantId no lee nada", async () => {
    await expect(ForestCtpDB.paquetesSinMedidas("")).rejects.toThrow("tenantId is required");
    expect(H.findMany).not.toHaveBeenCalled();
  });

  it("filtra por tenant en el paquete y en la corrida, y sólo corridas que el editor acepta", async () => {
    await ForestCtpDB.paquetesSinMedidas(TENANT);
    const { where } = H.findMany.mock.calls[0][0];
    expect(where).toMatchObject({
      tenantId: TENANT,
      deletedAt: null,
      entry: { tenantId: TENANT, section: "produccion", deletedAt: null, status: "registrado" },
    });
    /* El total cuenta con EL MISMO where: si no, el badge y la lista discrepan. */
    expect(H.count.mock.calls[0][0]).toEqual({ where });
  });

  it("«falta» es null o ≤ 0 en cada una de las tres medidas", async () => {
    await ForestCtpDB.paquetesSinMedidas(TENANT);
    const { where } = H.findMany.mock.calls[0][0];
    expect(where.OR).toEqual([
      { espesorCm: null },
      { espesorCm: { lte: 0 } },
      { anchoCm: null },
      { anchoCm: { lte: 0 } },
      { largoM: null },
      { largoM: { lte: 0 } },
    ]);
  });

  it("recorta la lista en la base pero el total es la cuenta entera", async () => {
    H.count.mockResolvedValue(240);
    const r = await ForestCtpDB.paquetesSinMedidas(TENANT);
    expect(H.findMany.mock.calls[0][0].take).toBe(LIMITE_PAQUETES_SIN_MEDIDAS);
    expect(r.total).toBe(240);
    expect(r.paquetes).toHaveLength(1);
  });

  it("el recorte pedido no pasa de 500 ni baja de 1", async () => {
    await ForestCtpDB.paquetesSinMedidas(TENANT, 10_000);
    expect(H.findMany.mock.calls[0][0].take).toBe(500);
    await ForestCtpDB.paquetesSinMedidas(TENANT, 0);
    expect(H.findMany.mock.calls[1][0].take).toBe(1);
  });

  it("arma el paquete con su corrida: N.º, día del libro, especie, y qué medidas faltan", async () => {
    const r = await ForestCtpDB.paquetesSinMedidas(TENANT);
    expect(r.paquetes).toEqual([
      {
        id: "pq-sl7",
        codigo: "SL-7",
        ctpEntryId: "c29",
        lineNo: 29,
        fecha: "2026-09-22",
        especie: "Cachimbo",
        producto: "MADERA ASERRADA (COMERCIAL)",
        cantidad: 12,
        volumenM3: 1.25,
        espesorCm: null,
        anchoCm: null,
        largoM: null,
        periodoCerrado: false,
        faltan: ["espesor", "ancho", "largo"],
      },
    ]);
  });

  it("los Decimal llegan como número, y una medida presente no figura como faltante", async () => {
    H.findMany.mockResolvedValue([fila({ espesorCm: dec(5.08), anchoCm: dec(20.32) })]);
    const [p] = (await ForestCtpDB.paquetesSinMedidas(TENANT)).paquetes;
    expect(p).toMatchObject({ espesorCm: 5.08, anchoCm: 20.32, largoM: null, faltan: ["largo"] });
  });

  it("un paquete de un mes cerrado sale marcado, no escondido", async () => {
    H.cierres.mockResolvedValue([
      {
        periodKey: "2026-09",
        label: "setiembre 2026",
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-09-30T23:59:59.999Z",
        reabierto: false,
      },
    ]);
    H.findMany.mockResolvedValue([
      fila(),
      fila({
        id: "pq-ago",
        codigo: "AG-1",
        entry: { lineNo: 20, entryDate: new Date("2026-08-05T00:00:00.000Z"), speciesCommon: "Tornillo", productType: null },
      }),
    ]);
    const r = await ForestCtpDB.paquetesSinMedidas(TENANT);
    expect(r.paquetes.map((p) => [p.codigo, p.periodoCerrado])).toEqual([
      ["SL-7", true],
      ["AG-1", false],
    ]);
  });

  it("si una fila completa se cuela de la base, no llega a la lista", async () => {
    H.findMany.mockResolvedValue([
      fila({ id: "completo", codigo: "SL-1", espesorCm: dec(5.08), anchoCm: dec(20.32), largoM: dec(1.52) }),
      fila(),
    ]);
    const r = await ForestCtpDB.paquetesSinMedidas(TENANT);
    expect(r.paquetes.map((p) => p.codigo)).toEqual(["SL-7"]);
  });
});
