/**
 * GET /api/cron/daily-summary — el resumen del día guarda el cuadre REAL de las
 * cajas cerradas (19-10). Antes miraba la caja ABIERTA (closingAmount siempre
 * null): 1 496 filas con esperado 0, contado vacío y diferencia 0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { CUADRE_VACIO, type CuadreDelDia } from "@/lib/caja/cierres-por-dia";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/cron-retry", () => ({ withCronRetry: (_n: string, fn: () => unknown) => fn() }));

const m = vi.hoisted(() => ({
  cuadreDelDia: vi.fn(),
  guardarDelCron: vi.fn(),
  completarCuadre: vi.fn(),
  insights: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: {
      findMany: vi.fn(async () => [{ id: "t-1", slug: "uno", name: "Uno" }]),
      findUnique: vi.fn(async () => ({ ownerPhone: null })),
    },
    dailySummary: { findFirst: vi.fn(async () => null) },
  },
}));
vi.mock("@/lib/db/sales.db", () => ({ SalesDB: { getAll: vi.fn(async () => []) } }));
vi.mock("@/lib/db/orders.db", () => ({ OrdersDB: { getAllFiltered: vi.fn(async () => []) } }));
vi.mock("@/lib/db/products.db", () => ({ ProductsDB: { getAll: vi.fn(async () => []) } }));
vi.mock("@/lib/db/por-cobrar.db", () => ({ PorCobrarDB: { getSummary: vi.fn(async () => null) } }));
vi.mock("@/lib/db/caja-por-dia.db", () => ({ CajaPorDiaDB: { cuadreDelDia: m.cuadreDelDia } }));
vi.mock("@/lib/db/daily-summary.db", () => ({
  DailySummaryDB: { guardarDelCron: m.guardarDelCron, completarCuadre: m.completarCuadre },
}));
vi.mock("@/lib/queue", () => ({
  enqueueActivityLog: vi.fn(async () => undefined),
  enqueueNotification: vi.fn(async () => undefined),
}));
vi.mock("@/lib/push-sender", () => ({ sendPushToPhone: vi.fn(async () => undefined) }));
vi.mock("@/lib/ai/daily-insights", () => ({ generateDailyInsights: m.insights }));
vi.mock("@/lib/billing/wire-up/ai-metering-middleware", () => ({ reportAICall: vi.fn() }));
vi.mock("@/lib/inventario/stock-minimo.server", () => ({ minimoGlobalDelNegocio: vi.fn(async () => 0) }));

import { GET } from "@/app/api/cron/daily-summary/route";

const cuadre = (c: Partial<CuadreDelDia>): CuadreDelDia => ({ ...CUADRE_VACIO, ...c });
const pedir = () =>
  GET(new NextRequest("http://localhost/api/cron/daily-summary", { headers: { authorization: "Bearer s3cr3t" } }));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cr3t";
  // 28/09 a las 16:07 de Lima (21:07 UTC), la hora del cron en vercel.json.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T21:07:00.000Z"));
  m.insights.mockResolvedValue(null);
  m.guardarDelCron.mockResolvedValue(undefined);
  m.completarCuadre.mockResolvedValue(1);
});
afterEach(() => vi.useRealTimers());

describe("cron daily-summary: caja del día desde las cajas cerradas", () => {
  it("guarda esperado, contado y diferencia del cuadre de hoy y completa el de ayer", async () => {
    m.cuadreDelDia.mockImplementation(async (_t: string, dia: string) =>
      dia === "2026-09-28"
        ? cuadre({ cajas: 5, esperado: 55, contado: 0, diferencia: -55, faltante: 55, peor: 55 })
        : cuadre({ cajas: 2, sinConteo: 1, esperado: 100, contado: 98, diferencia: -2, faltante: 2, peor: 2 }),
    );

    const res = await pedir();
    expect(res.status).toBe(200);

    expect(m.cuadreDelDia).toHaveBeenCalledWith("t-1", "2026-09-28");
    expect(m.guardarDelCron).toHaveBeenCalledWith(
      "t-1",
      new Date("2026-09-28T00:00:00.000Z"),
      expect.objectContaining({ efectivoEsperado: 55, efectivoContado: 0, diferenciaCaja: -55 }),
    );
    // Ayer = su día tal cual (no anteayer por correr la medianoche UTC a Lima).
    expect(m.cuadreDelDia).toHaveBeenCalledWith("t-1", "2026-09-27");
    expect(m.completarCuadre).toHaveBeenCalledWith("t-1", new Date("2026-09-27T00:00:00.000Z"), {
      efectivoEsperado: 100,
      efectivoContado: 98,
      diferenciaCaja: -2,
    });
    expect(m.insights.mock.calls[0][0].hoy.diferenciaCaja).toBe(-55);
  });

  it("sin ninguna caja contada: contado null («Sin contar»), esperado 0 y la IA no recibe diferencia", async () => {
    m.cuadreDelDia.mockResolvedValue(cuadre({ cajas: 1, sinConteo: 1 }));

    await pedir();

    expect(m.guardarDelCron).toHaveBeenCalledWith(
      "t-1",
      expect.any(Date),
      expect.objectContaining({ efectivoEsperado: 0, efectivoContado: null, diferenciaCaja: 0 }),
    );
    expect(m.insights.mock.calls[0][0].hoy.diferenciaCaja).toBeNull();
  });

  it("si falla el guardado, el cron sigue y responde 200", async () => {
    m.cuadreDelDia.mockResolvedValue(cuadre({}));
    m.guardarDelCron.mockRejectedValue(new Error("db caída"));

    const res = await pedir();
    expect(res.status).toBe(200);
    expect(m.completarCuadre).not.toHaveBeenCalled();
  });
});
