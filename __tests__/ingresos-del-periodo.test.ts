/**
 * Una sola regla de ingresos para Resumen y Ganancias (Mi Plata).
 *
 * Medido 2026-09-28 en el tenant QA `main`, mayo 2026: el Resumen decía 229,20
 * y Ganancias 54,90. Resumen sumaba ventas del POS + pedidos concretados;
 * Ganancias, sólo pedidos «confirmado»/«entregado». Estas filas son las de mayo
 * (montos reales del SELECT, repartidos en filas) y fijan la regla.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ingresosPorMes, pedidoEntraComoIngreso, mesesHasta, parsearMes, rangoDelMesLima, combinarIngresos, mesLima, mesDeGasto,
} from "@/lib/finance/ingresos-del-periodo";

// 7 ventas del POS en mayo = 174,30
const VENTAS_MAYO = [30, 25.5, 19.9, 40, 20, 18.9, 20].map((total, i) => ({ createdAt: `2026-05-${String(3 + i).padStart(2, "0")}T15:00:00.000Z`, total }));
// 3 confirmados (47,70) + 1 entregado (7,20) + 1 preparando (91,50, no entra)
const PEDIDOS_MAYO = [
  { createdAt: "2026-05-02T14:00:00.000Z", total: 15.9, status: "confirmado" },
  { createdAt: "2026-05-09T14:00:00.000Z", total: 15.9, status: "confirmado" },
  { createdAt: "2026-05-16T14:00:00.000Z", total: 15.9, status: "confirmado" },
  { createdAt: "2026-05-20T14:00:00.000Z", total: 7.2, status: "entregado" },
  { createdAt: "2026-05-21T14:00:00.000Z", total: 91.5, status: "preparando" },
];

describe("ingresos del período — el caso de mayo en main", () => {
  it("mayo = 174,30 del POS + 54,90 de pedidos = 229,20 (lo que muestran las dos pestañas)", () => {
    const [mayo] = ingresosPorMes(["2026-05"], VENTAS_MAYO, PEDIDOS_MAYO);
    expect(mayo).toEqual({ month: "2026-05", ventas: 174.3, pedidos: 54.9, ingresos: 229.2 });
  });

  it("la regla vieja de Ganancias (sólo pedidos) daba 54,90: ya no es la de nadie", () => {
    const [mayo] = ingresosPorMes(["2026-05"], [], PEDIDOS_MAYO);
    expect(mayo.ingresos).toBe(54.9);
    expect(mayo.ingresos).not.toBe(229.2);
  });

  it("entran confirmado, en camino y entregado; pendiente, preparando y cancelado no", () => {
    expect(["confirmado", "en_camino", "entregado"].every(pedidoEntraComoIngreso)).toBe(true);
    expect(["pendiente", "preparando", "cancelado", "", undefined, null].some(pedidoEntraComoIngreso)).toBe(false);
  });

  it("el mes es el de LIMA: una venta del 30/09 a las 20:00 de Pucallpa es de setiembre", () => {
    const venta = { createdAt: new Date("2026-09-30T20:00:00-05:00").toISOString(), total: 10 }; // 2026-10-01T01:00Z
    expect(venta.createdAt).toBe("2026-10-01T01:00:00.000Z");
    const [setiembre, octubre] = ingresosPorMes(["2026-09", "2026-10"], [venta], []);
    expect(setiembre.ingresos).toBe(10);
    expect(octubre.ingresos).toBe(0);
    // Y la medianoche de Lima del 01/10 (05:00 UTC) ya es octubre.
    expect(mesLima("2026-10-01T05:00:00.000Z")).toBe("2026-10");
    expect(mesLima("2026-10-01T04:59:59.999Z")).toBe("2026-09");
  });

  it("el servidor corta en el mismo instante: 01 a las 05:00 UTC → 01 siguiente a las 05:00 UTC", () => {
    expect(rangoDelMesLima("2026-05")).toEqual({ start: new Date("2026-05-01T05:00:00.000Z"), end: new Date("2026-06-01T05:00:00.000Z") });
    expect(rangoDelMesLima("2026-12")).toEqual({ start: new Date("2026-12-01T05:00:00.000Z"), end: new Date("2027-01-01T05:00:00.000Z") });
  });

  it("un gasto con la fecha sola del formulario (00:00 UTC) es de su día, no del mes anterior", () => {
    expect(mesDeGasto("2026-09-01T00:00:00.000Z")).toBe("2026-09"); // «2026-09-01» guardado por el formulario
    expect(mesDeGasto("2026-09-01")).toBe("2026-09");
    expect(mesDeGasto("2026-10-01T01:00:00.000Z")).toBe("2026-09"); // pagado el 30/09 a las 20:00 de Lima
    expect(mesDeGasto("no-es-fecha")).toBe("");
  });

  it("mesesHasta arma la serie terminando en el mes pedido, cruzando el año", () => {
    expect(mesesHasta("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(parsearMes("2026-13")).toBeNull();
    expect(parsearMes("2026-05")).toBe("2026-05");
  });

  it("redondea al céntimo la cola de float de las sumas", () => {
    expect(combinarIngresos("2026-05", 0.1 + 0.2, 0).ingresos).toBe(0.3);
  });
});

// ── El endpoint aplica la MISMA regla (lo leen Resumen y Ganancias) ──────────
const m = vi.hoisted(() => ({
  saleAggregate: vi.fn(),
  orderAggregate: vi.fn(),
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { sale: { aggregate: m.saleAggregate }, order: { aggregate: m.orderAggregate } } }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: m.requireAdmin }));
vi.mock("@/lib/cache", () => ({ getOrSet: (_k: string, _t: number, fn: () => unknown) => fn() }));

type WhereFecha = { createdAt: { gte: Date; lt: Date }; status?: { in: string[] } };

describe("GET /api/finanzas/monthly-summary", () => {
  beforeEach(() => {
    m.requireAdmin.mockResolvedValue({ tenantId: "t-qa", username: "qa", role: "admin" });
    m.saleAggregate.mockImplementation(async ({ where }: { where: WhereFecha }) => ({
      _sum: { total: VENTAS_MAYO.filter((v) => new Date(v.createdAt) >= where.createdAt.gte && new Date(v.createdAt) < where.createdAt.lt).reduce((a, v) => a + v.total, 0) },
    }));
    m.orderAggregate.mockImplementation(async ({ where }: { where: WhereFecha }) => ({
      _sum: {
        total: PEDIDOS_MAYO.filter((o) =>
          new Date(o.createdAt) >= where.createdAt.gte && new Date(o.createdAt) < where.createdAt.lt && (where.status?.in ?? []).includes(o.status),
        ).reduce((a, o) => a + o.total, 0),
      },
    }));
  });

  it("con hasta=2026-05 el último mes es mayo y vale 229,20, con su desglose", async () => {
    const { GET } = await import("@/app/api/finanzas/monthly-summary/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest("http://x/api/finanzas/monthly-summary?months=2&hasta=2026-05"));
    const filas = await res.json();
    expect(filas).toEqual([
      { month: "2026-04", ventas: 0, pedidos: 0, ingresos: 0 },
      { month: "2026-05", ventas: 174.3, pedidos: 54.9, ingresos: 229.2 },
    ]);
    const where = m.orderAggregate.mock.calls[0][0].where as WhereFecha & { deletedAt?: null };
    expect(where.status?.in).toEqual(["confirmado", "en_camino", "entregado"]);
    expect(where.deletedAt).toBeNull();
    // El rango que pide a la base es el mes de Lima.
    const ultima = m.saleAggregate.mock.calls.at(-1)?.[0].where as WhereFecha;
    expect(ultima.createdAt).toEqual({ gte: new Date("2026-05-01T05:00:00.000Z"), lt: new Date("2026-06-01T05:00:00.000Z") });
  });

  it("un hasta mal formado es un 400, no un mes inventado", async () => {
    const { GET } = await import("@/app/api/finanzas/monthly-summary/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest("http://x/api/finanzas/monthly-summary?hasta=mayo"));
    expect(res.status).toBe(400);
  });
});

describe("gastos del mes con la misma partición", () => {
  it("setiembre en QA: 150 + 55,50 + 180 = 385,50 (la barra salía en 0)", async () => {
    const { gastoDelMes } = await import("@/lib/finance/ingresos-del-periodo");
    const gastos = [
      { date: "2026-09-05T15:00:00.000Z", amount: 150 },
      { date: "2026-09-12T15:00:00.000Z", amount: 55.5 },
      { date: "2026-09-20T15:00:00.000Z", amount: 180 },
      { date: "2026-08-30T15:00:00.000Z", amount: 930 },
    ];
    expect(gastoDelMes("2026-09", gastos)).toBe(385.5);
    expect(gastoDelMes("2026-08", gastos)).toBe(930);
  });
});
