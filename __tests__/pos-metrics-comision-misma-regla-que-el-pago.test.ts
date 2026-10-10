/**
 * «Tu comisión estimada» del POS usa la MISMA regla que el pago de Comisiones.
 *
 * Antes el POS estimaba al 2,5 % fijo sobre lo vendido bruto, mientras que lo
 * que se paga (`/api/commissions/calculo`) sale de `calcularComisiones`: la
 * regla del vendedor, si no la general (`*`), si no el 2 %, sobre lo vendido
 * NETO de devoluciones. Con S/ 300 vendidos y sin reglas, el POS decía S/ 7.50
 * y se pagaban S/ 6.00.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  turnoFindFirst: vi.fn(),
  saleFindMany: vi.fn(),
  reglas: vi.fn(),
  porVendedor: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { turno: { findFirst: m.turnoFindFirst }, sale: { findMany: m.saleFindMany } },
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn(async () => ({ tenantId: "t-bodega", username: "rosa", role: "cajero" })) }));
vi.mock("@/lib/db/admin-users.db", () => ({
  AdminUsersDB: { resolveIdByUsername: vi.fn(async () => "u-rosa"), getUsernameById: vi.fn(async () => "rosa") },
}));
vi.mock("@/lib/db/commission-rules.db", () => ({ CommissionRulesDB: { list: m.reglas } }));
vi.mock("@/lib/db/commissions.db", () => ({ CommissionsDB: { cashierSummary: m.porVendedor } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { GET } from "@/app/api/pos/metrics/route";

const ABRIO = new Date("2026-10-10T13:00:00.000Z");
const regla = (cashierId: string, rate: number, minSales = 0, maxSales: number | null = null) =>
  ({ id: `r-${cashierId}-${rate}`, cashierId, label: "x", minSales, maxSales, rate, tenantId: "t-bodega" });
const fila = (cashierId: string, revenue: number, sales = 3) =>
  ({ cashierId, cashierName: cashierId, role: "cajero", sales, revenue, cogs: 0, profit: 0 });

async function metricas() {
  const res = await GET(new NextRequest("http://localhost/api/pos/metrics"));
  expect(res.status).toBe(200);
  return res.json() as Promise<{ comisionEstimada: number; comisionRate: number; totalVentas: number }>;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.turnoFindFirst.mockResolvedValue({ id: "turno-1", tenantId: "t-bodega", adminUserId: "u-rosa", abrioEn: ABRIO });
  m.saleFindMany.mockResolvedValue([
    { total: 100, payment: "efectivo", items: [] },
    { total: 120, payment: "yape", items: [] },
    { total: 80, payment: "efectivo", items: [] },
  ]);
  m.reglas.mockResolvedValue([]);
  m.porVendedor.mockResolvedValue([fila("rosa", 300), fila("pedro", 900)]);
});

describe("POS · comisión estimada con la regla del pago", () => {
  it("sin reglas: el 2 % de Comisiones, no el 2,5 % fijo", async () => {
    const d = await metricas();
    expect(d.totalVentas).toBe(300);
    expect(d.comisionRate).toBe(2);
    expect(d.comisionEstimada).toBe(6);
  });

  it("con la regla general del negocio (5 %)", async () => {
    m.reglas.mockResolvedValue([regla("*", 5)]);
    const d = await metricas();
    expect(d.comisionRate).toBe(5);
    expect(d.comisionEstimada).toBe(15);
  });

  it("la regla propia de la cajera manda sobre la general", async () => {
    m.reglas.mockResolvedValue([regla("*", 5), regla("rosa", 3)]);
    const d = await metricas();
    expect(d.comisionRate).toBe(3);
    expect(d.comisionEstimada).toBe(9);
  });

  it("sobre lo vendido neto de devoluciones, como el pago (y sólo lo de su turno)", async () => {
    // Devolvieron S/ 50 de una venta de Rosa: el pago comisiona S/ 250.
    m.porVendedor.mockResolvedValue([fila("rosa", 250), fila("pedro", 900)]);
    m.reglas.mockResolvedValue([regla("*", 4)]);
    const d = await metricas();
    expect(d.comisionEstimada).toBe(10);
    // Sólo las ventas de ESTA cajera (por sus dos formas de id), no las de todo el negocio.
    expect(m.porVendedor).toHaveBeenCalledWith("t-bodega", { from: ABRIO, cashierIds: ["u-rosa", "rosa"] });
  });
});
