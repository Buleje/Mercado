/**
 * «Hoy» del POS sumado en el servidor (2026-10-09).
 *
 * - SalesDB.resumenDelDia: ventana del día de LIMA (no la medianoche del
 *   servidor), céntimos enteros, el mixto repartido con `desglosarPago` (lo que
 *   el detalle no explica queda en «mixto») y la suma por medio cierra con el total.
 * - GET /api/sales/resumen-hoy: 401 sin sesión, el tenant sale del JWT (nunca
 *   del query), un cajero sólo ve lo suyo, `dia` futuro o mal escrito = 400.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const groupBy = vi.fn();
const findMany = vi.fn();
const aggregate = vi.fn();
const tx = { sale: { groupBy, findMany }, return: { aggregate } };

vi.mock("@/lib/prisma-rls", () => ({
  withRlsTx: (_tenantId: string, fn: (t: typeof tx) => unknown) => fn(tx),
  withRlsTenant: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("next/cache", async (orig) => ({
  ...(await orig<typeof import("next/cache")>()),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

const grupo = (payment: string, total: string, n: number) => ({ payment, _sum: { total }, _count: { _all: n } });

describe("SalesDB.resumenDelDia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aggregate.mockResolvedValue({ _sum: { total: "12.50" }, _count: { _all: 1 } });
  });

  it("cuenta el día de Lima: 00:00 −05:00 a +24 h, filtrado por tenant", async () => {
    groupBy.mockResolvedValue([]);
    findMany.mockResolvedValue([]);
    const { SalesDB } = await import("@/lib/db/sales.db");
    await SalesDB.resumenDelDia("tenant-a", { dia: "2026-10-09" });

    const where = groupBy.mock.calls[0][0].where;
    expect(where.tenantId).toBe("tenant-a");
    expect((where.createdAt.gte as Date).toISOString()).toBe("2026-10-09T05:00:00.000Z");
    expect((where.createdAt.lt as Date).toISOString()).toBe("2026-10-10T05:00:00.000Z");
    expect(where.cashierId).toBeUndefined();
    expect(aggregate.mock.calls[0][0].where).toMatchObject({ tenantId: "tenant-a", saleId: { not: null } });
  });

  it("suma en céntimos, reparte el mixto y la suma por medio cierra con el total", async () => {
    groupBy.mockResolvedValue([
      grupo("efectivo", "100.10", 3),
      grupo("Yape", "20.20", 2),
      grupo("MIXTO", "25.50", 2),
    ]);
    findMany.mockResolvedValue([
      // 15,50 = 10 efectivo + 5,50 yape
      { payment: "MIXTO", total: "15.50", paymentDetails: JSON.stringify([{ method: "efectivo", amount: 10 }, { method: "yape", amount: 5.5 }]) },
      // el detalle sólo explica 6 de 10 → 4 quedan en «mixto»
      { payment: "mixto", total: "10.00", paymentDetails: JSON.stringify([{ method: "plin", amount: 6 }]) },
    ]);
    const { SalesDB } = await import("@/lib/db/sales.db");
    const r = await SalesDB.resumenDelDia("tenant-a", { dia: "2026-10-09" });

    expect(r.ventas).toBe(7);
    expect(r.total).toBe(145.8);
    expect(r.ticketPromedio).toBe(20.83);
    const porMedio = Object.fromEntries(r.porMedio.map((m) => [m.medio, m.monto]));
    expect(porMedio).toEqual({ efectivo: 110.1, yape: 25.7, plin: 6, mixto: 4 });
    const suma = r.porMedio.reduce((s, m) => s + Math.round(m.monto * 100), 0);
    expect(suma).toBe(Math.round(r.total * 100));
    expect(r.porMedio[0].medio).toBe("efectivo"); // de mayor a menor
    expect(r.devuelto).toEqual({ monto: 12.5, cantidad: 1 });
    expect(r.alcance).toBe("todas");
  });

  it("un cajero: sólo sus ventas y sin las devoluciones del local", async () => {
    groupBy.mockResolvedValue([grupo("efectivo", "30.00", 1)]);
    findMany.mockResolvedValue([]);
    const { SalesDB } = await import("@/lib/db/sales.db");
    const r = await SalesDB.resumenDelDia("tenant-a", { dia: "2026-10-09", cashierId: "cajero1" });

    expect(groupBy.mock.calls[0][0].where.cashierId).toBe("cajero1");
    expect(findMany.mock.calls[0][0].where.cashierId).toBe("cajero1");
    expect(aggregate).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ventas: 1, total: 30, devuelto: null, alcance: "tuyas" });
  });

  it("sin ventas: todo en cero, sin dividir por cero", async () => {
    groupBy.mockResolvedValue([]);
    findMany.mockResolvedValue([]);
    const { SalesDB } = await import("@/lib/db/sales.db");
    const r = await SalesDB.resumenDelDia("tenant-a", { dia: "2026-10-09" });
    expect(r).toMatchObject({ ventas: 0, total: 0, ticketPromedio: 0, porMedio: [] });
  });
});

// ── Ruta ──────────────────────────────────────────────────────────────────────

const requireAdmin = vi.fn();
const resumenDelDia = vi.fn();
vi.mock("@/lib/require-admin", () => ({ requireAdmin: (...a: unknown[]) => requireAdmin(...a) }));

describe("GET /api/sales/resumen-hoy", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // 21:00 de Lima del 09-10 = 02:00 UTC del 10-10: «hoy» tiene que ser el 09.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T02:00:00.000Z"));
    const { SalesDB } = await import("@/lib/db/sales.db");
    vi.spyOn(SalesDB, "resumenDelDia").mockImplementation(resumenDelDia);
    resumenDelDia.mockResolvedValue({ dia: "2026-10-09", ventas: 0, total: 0, ticketPromedio: 0, porMedio: [], devuelto: null, alcance: "todas" });
  });
  afterEach(() => vi.useRealTimers());

  const pedir = async (qs = "", extra: Record<string, string> = {}) => {
    const { GET } = await import("@/app/api/sales/resumen-hoy/route");
    return GET(new NextRequest(`http://localhost/api/sales/resumen-hoy${qs}`, { headers: extra }));
  };

  it("sin sesión: 401 y no toca la base", async () => {
    requireAdmin.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    const res = await pedir();
    expect(res.status).toBe(401);
    expect(resumenDelDia).not.toHaveBeenCalled();
  });

  it("el tenant sale de la sesión, nunca del header ni del query; hoy = día de Lima", async () => {
    requireAdmin.mockResolvedValue({ tenantId: "tenant-a", role: "admin", username: "dueno" });
    const res = await pedir("?tenantId=tenant-b", { "x-tenant-id": "tenant-b" });
    expect(res.status).toBe(200);
    expect(resumenDelDia).toHaveBeenCalledWith("tenant-a", { dia: "2026-10-09", cashierId: undefined });
  });

  it("un cajero sólo pide lo suyo", async () => {
    requireAdmin.mockResolvedValue({ tenantId: "tenant-a", role: "cajero", username: "cajero1" });
    await pedir("?dia=2026-10-08");
    expect(resumenDelDia).toHaveBeenCalledWith("tenant-a", { dia: "2026-10-08", cashierId: "cajero1" });
  });

  it("dia futuro o mal escrito: 400", async () => {
    requireAdmin.mockResolvedValue({ tenantId: "tenant-a", role: "admin", username: "dueno" });
    expect((await pedir("?dia=2026-10-10")).status).toBe(400);
    expect((await pedir("?dia=hoy")).status).toBe(400);
    expect(resumenDelDia).not.toHaveBeenCalled();
  });
});
