/**
 * Avisos de Inicio (GET /api/admin/overview): cada uno lleva al destino YA
 * filtrado, los pedidos olvidados no se cuentan dos veces con «en curso», el
 * catálogo incompleto trae sus atajos, y lo urgente va arriba. La regla del
 * catálogo (`leFalta`) es la misma que filtra Inventario.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { leFalta, esFaltaDeCatalogo } from "@/lib/inventario/catalogo-incompleto";
import { margenDelResultado } from "@/lib/admin/margen-del-resultado";
import { esPedidoOlvidado } from "@/lib/admin/pedidos-olvidados";
import { derivarDelResultado, type BaseDelMes } from "@/hooks/resumen-plata-del-resultado";
import type { RespuestaResultado } from "@/lib/finance/resultado-del-negocio";

const H = vi.hoisted(() => ({
  datos: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({ tenantId: "t1", role: "admin", userId: "u1" })),
}));
vi.mock("@/lib/cache", () => ({ getOrSet: vi.fn(async (_k: string, _t: number, fn: () => unknown) => fn()) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/db/documents.db", () => ({ DocumentsDB: { countExpiring: vi.fn(async () => 0) } }));
vi.mock("@/lib/db/overview.db", () => ({
  HORAS_PEDIDO_OLVIDADO: 24,
  OverviewDB: { fetchOverview: vi.fn(async () => H.datos) },
}));

import { GET } from "@/app/api/admin/overview/route";

const base = {
  rangeOrders: [],
  prevOrders: [],
  activeOrders: 0,
  last30dOrders: [],
  criticalStockCount: 0,
  expiringCount: 0,
  overdueCreditCount: 0,
  pedidosOlvidados: { cuantos: 0, monto: 0, desde: null as Date | null },
  catalogo: { bajoStock: 0, sinCosto: 0, sinCodigo: 0, sinMinimo: 0, incompletos: 0 },
  topProducts: [],
  newCustomersInRange: 0,
};

async function avisos(datos: Partial<typeof base>) {
  H.datos = { ...base, ...datos };
  const res = await GET(new NextRequest("http://x/api/admin/overview"));
  expect(res).toBeInstanceOf(NextResponse);
  const json = (await res.json()) as { alerts: Array<{ id: string; href?: string; text: string; enlaces?: Array<{ label: string; href: string }> }> };
  return json.alerts;
}

describe("avisos de Inicio", () => {
  beforeEach(() => {
    H.datos = null;
  });

  it("cada aviso lleva a su destino filtrado", async () => {
    const a = await avisos({ criticalStockCount: 2, expiringCount: 1, overdueCreditCount: 1 });
    const href = Object.fromEntries(a.map((x) => [x.id, x.href]));
    expect(href["stock-critical"]).toBe("/admin?tab=inventario&filter=critical");
    expect(href.expiring).toBe("/admin?tab=inventario&filter=expiring");
    expect(href.overdue).toBe("/admin?tab=fiados&sub=deudores&filter=overdue");
  });

  it("pedidos olvidados: aviso propio, sin repetirlos en «en curso»", async () => {
    const hace = new Date(Date.now() - 10 * 86_400_000);
    const a = await avisos({ activeOrders: 20, pedidosOlvidados: { cuantos: 18, monto: 354.4, desde: hace } });
    const olv = a.find((x) => x.id === "stale-orders");
    expect(olv?.text).toMatch(/^18 pedidos esperan hace más de 24 h/);
    expect(olv?.text).toContain("hace 10 días");
    expect(a.find((x) => x.id === "active-orders")?.text).toBe("2 pedidos en curso");
  });

  it("todos olvidados: no queda «0 pedidos en curso»", async () => {
    const a = await avisos({ activeOrders: 3, pedidosOlvidados: { cuantos: 3, monto: 10, desde: new Date() } });
    expect(a.some((x) => x.id === "active-orders")).toBe(false);
  });

  it("catálogo incompleto: atajos sólo de lo que falta", async () => {
    const a = await avisos({ catalogo: { bajoStock: 0, sinCosto: 28, sinCodigo: 5, sinMinimo: 0, incompletos: 30 } });
    const cat = a.find((x) => x.id === "catalog-incomplete");
    expect(cat?.href).toBe("/admin?tab=inventario&filter=incompleto");
    expect(cat?.enlaces?.map((e) => e.label)).toEqual(["28 sin costo", "5 sin código"]);
    expect(cat?.enlaces?.every((e) => esFaltaDeCatalogo(new URL(e.href, "http://x").searchParams.get("filter")))).toBe(true);
  });

  it("lo urgente arriba: rojo, ámbar, informativo", async () => {
    const a = await avisos({
      activeOrders: 1,
      criticalStockCount: 1,
      overdueCreditCount: 1,
      catalogo: { bajoStock: 1, sinCosto: 1, sinCodigo: 0, sinMinimo: 0, incompletos: 1 },
    });
    expect(a.map((x) => x.id)).toEqual(["overdue", "stock-critical", "active-orders", "catalog-incomplete"]);
  });
});

describe("leFalta — la regla que comparten el aviso y el filtro de Inventario", () => {
  const completo = { type: "product", costPrice: "2.50", barcode: "775", stock: 4, stockMin: 2 };

  it("un producto completo no falta en nada", () => {
    expect(leFalta(completo, "incompleto")).toBe(false);
  });

  it("costo 0 o vacío = sin costo; código en blanco = sin código", () => {
    expect(leFalta({ ...completo, costPrice: 0 }, "sin-costo")).toBe(true);
    expect(leFalta({ ...completo, costPrice: null }, "sin-costo")).toBe(true);
    expect(leFalta({ ...completo, barcode: "  " }, "sin-codigo")).toBe(true);
  });

  it("sin mínimo sólo si lleva stock", () => {
    expect(leFalta({ ...completo, stockMin: null }, "sin-minimo")).toBe(true);
    expect(leFalta({ ...completo, stock: null, stockMin: null }, "sin-minimo")).toBe(false);
  });

  it("los servicios nunca cuentan", () => {
    expect(leFalta({ type: "service", costPrice: null, barcode: null, stock: null }, "incompleto")).toBe(false);
  });
});

describe("Mi Plata: una sola ganancia", () => {
  // Octubre en main (09-10): S/ 0,10 de ingresos, S/ 18,29 de costos.
  const baseVieja: BaseDelMes = {
    mesActual: "2026-10", ingresos: 0, gastos: 0, deuda: 0, fiados: 0, puntoEq: 0,
    diasTranscurridos: 9, diasTotales: 31, fiadosVencidos: 0, payablesVencidos: 0,
    meses: [{ clave: "2026-09", ingresos: 100, gastos: 386 }, { clave: "2026-10", ingresos: 0, gastos: 0 }],
  };
  const delServidor = {
    actual: { mes: "2026-10", totalIngresos: 0.1, totalCostos: 18.29, resultado: -18.19 },
    serie: [
      { mes: "2026-09", ingresos: 100, costos: 3066, resultado: -2966, estimado: false, cerradoCtp: false },
      { mes: "2026-10", ingresos: 0.1, costos: 18.29, resultado: -18.19, estimado: false, cerradoCtp: false },
    ],
    generadoEn: "2026-10-09T00:00:00.000Z",
  } as unknown as RespuestaResultado;

  it("el margen con ingresos casi en cero no se muestra (pasa ±999 %)", () => {
    expect(margenDelResultado(-18.19, 0.1)).toBeNull();
    expect(margenDelResultado(5, 0)).toBeNull();
    expect(margenDelResultado(25, 100)).toBe(25);
    expect(margenDelResultado(-999, 100)).toBe(-999);
  });

  it("ingresos, gastos y utilidad del MISMO resultado: cuadran entre sí", () => {
    const { kpis, monthlyData } = derivarDelResultado(baseVieja, delServidor);
    expect(kpis.ingresos).toBe(0);
    expect(kpis.gastos).toBe(18);
    expect(kpis.utilidad).toBe(-18);
    expect("margen" in kpis).toBe(false);
    // Setiembre: la barra de gastos es el costo del servidor, no los 386 registrados.
    expect(monthlyData[0]).toMatchObject({ ingresos: 100, gastos: 3066, utilidad: -2966 });
    for (const m of monthlyData) expect(Math.abs(m.ingresos - m.gastos - m.utilidad)).toBeLessThanOrEqual(1);
  });

  it("sin el resultado (403) queda la cuenta vieja, también cuadrada", () => {
    const { kpis, monthlyData, projection } = derivarDelResultado(baseVieja, null);
    expect(kpis).toMatchObject({ ingresos: 0, gastos: 0, utilidad: 0 });
    expect(monthlyData[0]).toMatchObject({ ingresos: 100, gastos: 386, utilidad: -286 });
    expect(projection).toMatchObject({ ventasMes: 0, gastosMes: 0 });
  });
});

describe("esPedidoOlvidado — la regla del aviso y de la lista de Pedidos", () => {
  const ahora = Date.parse("2026-10-09T12:00:00.000Z");
  const hace = (h: number) => new Date(ahora - h * 3_600_000).toISOString();

  it("vivo y quieto más de 24 h: olvidado", () => {
    expect(esPedidoOlvidado({ status: "pendiente", updatedAt: hace(25), createdAt: hace(90) }, ahora)).toBe(true);
    expect(esPedidoOlvidado({ status: "en_camino", updatedAt: hace(23), createdAt: hace(90) }, ahora)).toBe(false);
  });

  it("entregado o cancelado nunca cuenta", () => {
    expect(esPedidoOlvidado({ status: "entregado", updatedAt: hace(500), createdAt: hace(500) }, ahora)).toBe(false);
    expect(esPedidoOlvidado({ status: "cancelado", updatedAt: hace(500), createdAt: hace(500) }, ahora)).toBe(false);
  });
});
