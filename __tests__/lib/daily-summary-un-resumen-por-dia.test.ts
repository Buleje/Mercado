/**
 * DailySummaryDB — una fila por día y autor sin clave única en la tabla (19-10):
 * el candado del día va ANTES de buscar, así dos corridas del cron (o dos clics
 * en «Cerrar el día») hacen fila y la segunda actualiza la fila de la primera.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const orden: string[] = [];
const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  dailySummary: { findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) },
}));
vi.mock("@/lib/db/candado", () => ({
  candadoDelNegocio: vi.fn(async (_tx: unknown, tenantId: string, clave: string) => {
    orden.push(`candado ${tenantId} ${clave}`);
  }),
}));

import { DailySummaryDB } from "@/lib/db/daily-summary.db";

const FECHA = new Date("2026-10-19T00:00:00.000Z");
const CRON = {
  totalVentas: 1, cantidadVentas: 1, ticketPromedio: 1, efectivoEsperado: 0, efectivoContado: null,
  diferenciaCaja: 0, stockAlertas: "[]", productoTop: null,
};
const MANO = {
  ...CRON, fiadosCobrados: 0, fiadosNuevos: 0, fiadosVencidos: 0, mejorHora: null, stockAlertas: null, notas: null, creadoPor: "qacajero",
};

beforeEach(() => {
  vi.clearAllMocks();
  orden.length = 0;
  tx.dailySummary.findFirst.mockImplementation(async () => {
    orden.push("buscar");
    return null;
  });
  tx.dailySummary.create.mockResolvedValue({ id: "nuevo" });
});

describe("guardarDelCron", () => {
  it("candado del día antes de buscar; si ya está la del cron, la actualiza", async () => {
    tx.dailySummary.findFirst.mockImplementationOnce(async () => {
      orden.push("buscar");
      return { id: "ds-cron" };
    });
    await DailySummaryDB.guardarDelCron("t-1", FECHA, CRON);
    expect(orden).toEqual(["candado t-1 resumen-diario:2026-10-19:cron", "buscar"]);
    expect(tx.dailySummary.findFirst.mock.calls[0][0].where).toEqual({ tenantId: "t-1", fecha: FECHA, creadoPor: "cron" });
    expect(tx.dailySummary.updateMany).toHaveBeenCalledWith({ where: { id: "ds-cron", tenantId: "t-1" }, data: { ...CRON, mejorHora: null } });
    expect(tx.dailySummary.create).not.toHaveBeenCalled();
  });
});

describe("guardarAMano", () => {
  it("sin cierre a mano del día: crea; nunca toma la fila del cron", async () => {
    expect(await DailySummaryDB.guardarAMano("t-1", FECHA, MANO)).toEqual({ id: "nuevo", creado: true });
    expect(orden[0]).toBe("candado t-1 resumen-diario:2026-10-19:mano");
    expect(tx.dailySummary.findFirst.mock.calls[0][0].where).toEqual({ tenantId: "t-1", fecha: FECHA, creadoPor: { not: "cron" } });
  });

  it("ya cerrado hoy: actualiza esa fila, no duplica", async () => {
    tx.dailySummary.findFirst.mockResolvedValueOnce({ id: "ds-mano" });
    expect(await DailySummaryDB.guardarAMano("t-1", FECHA, MANO)).toEqual({ id: "ds-mano", creado: false });
    expect(tx.dailySummary.updateMany).toHaveBeenCalledWith({ where: { id: "ds-mano", tenantId: "t-1" }, data: MANO });
    expect(tx.dailySummary.create).not.toHaveBeenCalled();
  });
});
