/**
 * `ForestCtpDB.cambiarApartado` y `reservasVencidas` con la base simulada.
 *
 * Lo que ningún tipo ve y se fija acá:
 *  · toda escritura y lectura lleva el `tenantId` en el WHERE (una reserva de
 *    otro tenant no se encuentra: «no existe», nunca se toca);
 *  · la carrera con «Liberar» en otra pestaña: el `updateMany` pide
 *    `liberadoAt: null`, y si llegó tarde (0 filas) lo dice — no revive una
 *    reserva muerta;
 *  · sin cambios reales no se escribe ni se audita;
 *  · el recorte de candidatas usa el día de LIMA (a las 20:00 de Pucallpa el
 *    UTC ya es mañana y traería de más);
 *  · la campana cuenta SÓLO reservas de madera que Productos disponibles
 *    muestra: el mismo WHERE de corrida y la misma regla de saldo (revisión
 *    23-09: una reserva sobre madera ya usada o despachada salía «congelada»);
 *  · no se extiende la reserva de una corrida anulada (pestaña vieja).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  findMany: vi.fn(),
  audit: vi.fn(),
  saldos: vi.fn(
    async (_tx: unknown, _tenantId: string, _ids: string[]): Promise<Map<string, { disponible: number }>> =>
      new Map(),
  ),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    forestCtpApartado: {
      findFirst: H.findFirst,
      updateMany: H.updateMany,
      findMany: H.findMany,
    },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: H.audit }));
vi.mock("@/lib/db/forest-ctp-saldo-corrida", () => ({ saldosDeCorridas: H.saldos }));

import { ForestCtpDB } from "@/lib/db/forest-ctp.db";

const TENANT = "tenant-qa";

/** La reserva real de Blas (23/09): SL-7 de la corrida N° 29, hasta el martes 22/09. */
const viva = (x: Record<string, unknown> = {}) => ({
  id: "ap-1",
  tenantId: TENANT,
  ctpEntryId: "c29",
  paqueteId: "pq-sl7",
  para: "Juancho",
  hasta: new Date("2026-09-22T00:00:00.000Z"),
  nota: null,
  creadoPor: "qaadmin",
  creadoAt: new Date("2026-09-16T03:54:59.000Z"),
  liberadoAt: null,
  liberadoPor: null,
  liberadoMotivo: null,
  ctpEntry: { lineNo: 29 },
  paquete: { codigo: "SL-7" },
  ...x,
});

/** Lo que Productos disponibles exige a la corrida (`whereCorridaEnElPatio`). */
const CORRIDA_EN_EL_PATIO = {
  tenantId: TENANT,
  section: "produccion",
  deletedAt: null,
  status: "registrado",
  quantity: { not: null },
  OR: [{ volumeInputM3: { gt: 0 } }, { consumos: { some: {} } }],
  usadoAt: null,
};
/** Lo que `cambiarApartado` exige para escribir: la madera sigue en el libro. */
const MADERA_VIVA = {
  ctpEntry: { deletedAt: null, status: "registrado" },
  OR: [{ paqueteId: null }, { paquete: { deletedAt: null } }],
};

beforeEach(() => {
  vi.clearAllMocks();
  H.updateMany.mockResolvedValue({ count: 1 });
  H.saldos.mockResolvedValue(new Map());
});

describe("cambiarApartado — extender una reserva viva", () => {
  it("escribe SÓLO el plazo, con tenant y `liberadoAt: null` en el WHERE, y lo audita", async () => {
    H.findFirst.mockResolvedValue(viva());
    const r = await ForestCtpDB.cambiarApartado(
      TENANT,
      "ap-1",
      { hasta: new Date("2026-09-30T00:00:00.000Z") },
      "qaadmin",
    );

    expect(H.findFirst.mock.calls[0]![0].where).toEqual({ id: "ap-1", tenantId: TENANT, ...MADERA_VIVA });
    expect(H.updateMany).toHaveBeenCalledTimes(1);
    expect(H.updateMany.mock.calls[0]![0]).toEqual({
      where: { id: "ap-1", tenantId: TENANT, liberadoAt: null, ...MADERA_VIVA },
      data: { hasta: new Date("2026-09-30T00:00:00.000Z") },
    });
    expect(r.hasta).toEqual(new Date("2026-09-30T00:00:00.000Z"));
    expect(H.audit).toHaveBeenCalledTimes(1);
    expect(H.audit.mock.calls[0]![0]).toMatchObject({
      tenantId: TENANT,
      action: "ctp_cambiar_apartado",
      entityId: "ap-1",
      user: "qaadmin",
    });
    expect(H.audit.mock.calls[0]![0].detail).toBe(
      "Cambió la reserva del paquete SL-7 · para Juancho · plazo: el 2026-09-22 → el 2026-09-30",
    );
  });

  it("una reserva de OTRO tenant no se encuentra: «no existe» y no se escribe nada", async () => {
    H.findFirst.mockResolvedValue(null);
    await expect(
      ForestCtpDB.cambiarApartado(TENANT, "ap-de-otro", { hasta: new Date() }, "qaadmin"),
    ).rejects.toThrow(/Esa reserva no existe/);
    expect(H.updateMany).not.toHaveBeenCalled();
    expect(H.audit).not.toHaveBeenCalled();
  });

  /* Revisión 23-09: desde una pestaña vieja se podía extender la reserva de una
     corrida ya anulada. El WHERE pide la corrida registrada y sin borrar, así
     que Prisma no la encuentra (null) y no se escribe nada. */
  it("una corrida anulada no se encuentra por el WHERE: no se extiende ni se audita", async () => {
    H.findFirst.mockResolvedValue(null);
    await expect(
      ForestCtpDB.cambiarApartado(TENANT, "ap-1", { hasta: new Date("2026-09-30") }, "qaadmin"),
    ).rejects.toThrow(/la corrida se anuló o se borró/);
    expect(H.findFirst.mock.calls[0]![0].where.ctpEntry).toEqual({ deletedAt: null, status: "registrado" });
    expect(H.updateMany).not.toHaveBeenCalled();
    expect(H.audit).not.toHaveBeenCalled();
  });

  it("ya liberada: lo dice y no la revive", async () => {
    H.findFirst.mockResolvedValue(viva({ liberadoAt: new Date("2026-09-23T15:00:00Z") }));
    await expect(
      ForestCtpDB.cambiarApartado(TENANT, "ap-1", { hasta: new Date("2026-09-30") }, "qaadmin"),
    ).rejects.toThrow(/ya se liberó/);
    expect(H.updateMany).not.toHaveBeenCalled();
  });

  it("carrera: otra pestaña la liberó o anuló la corrida entre la lectura y la escritura (0 filas) → error, sin auditar", async () => {
    H.findFirst.mockResolvedValue(viva());
    H.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      ForestCtpDB.cambiarApartado(TENANT, "ap-1", { hasta: new Date("2026-09-30") }, "qaadmin"),
    ).rejects.toThrow(/cambió mientras tanto/);
    expect(H.audit).not.toHaveBeenCalled();
  });

  it("el mismo plazo, el mismo nombre y la misma nota no escriben ni auditan", async () => {
    H.findFirst.mockResolvedValue(viva());
    await ForestCtpDB.cambiarApartado(
      TENANT,
      "ap-1",
      { para: " Juancho ", hasta: new Date("2026-09-22T00:00:00.000Z"), nota: "  " },
      "qaadmin",
    );
    expect(H.updateMany).not.toHaveBeenCalled();
    expect(H.audit).not.toHaveBeenCalled();
  });

  it("un nombre vacío se rechaza en vez de dejar una reserva «para nadie»", async () => {
    H.findFirst.mockResolvedValue(viva());
    await expect(
      ForestCtpDB.cambiarApartado(TENANT, "ap-1", { para: "   " }, "qaadmin"),
    ).rejects.toThrow(/para quién/);
    expect(H.updateMany).not.toHaveBeenCalled();
  });
});

describe("reservasVencidas — la lectura para los pendientes", () => {
  it("filtra por tenant, vivas, la MISMA corrida en el patio que Disponibles, y corta en el día de LIMA", async () => {
    H.findMany.mockResolvedValue([]);
    /* 20:00 del martes 22 en Pucallpa = 01:00 UTC del miércoles 23. */
    await ForestCtpDB.reservasVencidas(TENANT, new Date("2026-09-22T20:00:00-05:00"));
    const where = H.findMany.mock.calls[0]![0].where;
    expect(where).toEqual({
      tenantId: TENANT,
      liberadoAt: null,
      hasta: { lt: new Date("2026-09-22T00:00:00.000Z") },
      ctpEntry: CORRIDA_EN_EL_PATIO,
      OR: [{ paqueteId: null }, { paquete: { deletedAt: null } }],
    });
  });

  it("la campana excluye reservas de corridas usadas o despachadas", async () => {
    const fila = (id: string, ctpEntryId: string, lineNo: number) => ({
      ...viva({ id, ctpEntryId }),
      ctpEntry: { lineNo, speciesCommon: "Cachimbo", productType: "MADERA ASERRADA (COMERCIAL)" },
      paquete: null,
      paqueteId: null,
    });
    /* La usada ni llega: `usadoAt: null` va en el WHERE compartido (arriba).
       La despachada entera sí llega del WHERE, y la saca el saldo. */
    H.findMany.mockResolvedValue([fila("ap-en-patio", "c29", 29), fila("ap-despachada", "c31", 31)]);
    H.saldos.mockResolvedValue(
      new Map([
        ["c29", { disponible: 5.154 }],
        ["c31", { disponible: 0 }],
      ]),
    );
    const lista = await ForestCtpDB.reservasVencidas(TENANT, new Date("2026-09-23T12:00:00-05:00"));

    expect(H.findMany.mock.calls[0]![0].where.ctpEntry.usadoAt).toBeNull();
    expect(H.saldos.mock.calls[0]![1]).toBe(TENANT);
    expect(H.saldos.mock.calls[0]![2]).toEqual(["c29", "c31"]);
    expect(lista.map((r) => r.id)).toEqual(["ap-en-patio"]);
  });

  it("sin candidatas no pide saldos", async () => {
    H.findMany.mockResolvedValue([]);
    expect(await ForestCtpDB.reservasVencidas(TENANT, new Date())).toEqual([]);
    expect(H.saldos).not.toHaveBeenCalled();
  });

  it("devuelve la de Blas como la lee la campana", async () => {
    H.saldos.mockResolvedValue(new Map([["c29", { disponible: 5.154 }]]));
    H.findMany.mockResolvedValue([
      {
        ...viva(),
        ctpEntry: {
          lineNo: 29,
          speciesCommon: "Cachimbo",
          productType: "MADERA ASERRADA (COMERCIAL)",
        },
        paquete: { codigo: "SL-7", volumenM3: "1.2500" },
      },
    ]);
    const lista = await ForestCtpDB.reservasVencidas(TENANT, new Date("2026-09-23T12:00:00-05:00"));
    expect(lista).toEqual([
      {
        id: "ap-1",
        para: "Juancho",
        hasta: "2026-09-22",
        lineNo: 29,
        especie: "Cachimbo",
        producto: "MADERA ASERRADA (COMERCIAL)",
        paqueteCodigo: "SL-7",
        volumenM3: 1.25,
        diasVencida: 1,
      },
    ]);
  });
});
