/**
 * Reportes comparativos de Mi Plata (11-10): la pantalla mostraba S/ 0,00 y
 * «NaN%» porque leía un endpoint que ignora el rango. Fija la regla pura
 * (ningún NaN, «—» sin base) y la ruta nueva (tenantId del JWT primero, los
 * dos meses de Lima correctos, 400 con parámetros malos).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ delMes: vi.fn() }));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: async () => ({ tenantId: "t-1", role: "admin" }) }));
vi.mock("@/lib/cache", () => ({ getOrSet: async (_k: string, _t: number, fn: () => Promise<unknown>) => fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/comparativo-periodos.db", () => ({ ComparativoPeriodosDB: { delMes: (...a: unknown[]) => H.delMes(...a) } }));

import { NextRequest } from "next/server";
import { armarPeriodo, mesDeComparacion, variacion, type AgregadosDelMes } from "@/lib/finance/comparativo-periodos";
import { GET } from "@/app/api/finanzas/comparativo/route";

const vacio: AgregadosDelMes = {
  ventasPos: { total: 0, cuantas: 0, conCosto: 0, costo: 0 },
  pedidos: { total: 0, cuantos: 0, conCosto: 0, costo: 0 },
  clientesNuevos: 0,
  fiado: { total: 0, cuantos: 0 },
};

describe("armarPeriodo", () => {
  it("suma POS + pedidos concretados y calcula ticket y margen sólo con costo", () => {
    const p = armarPeriodo("2026-10", {
      ventasPos: { total: 100, cuantas: 2, conCosto: 60, costo: 30 },
      pedidos: { total: 50, cuantos: 1, conCosto: 40, costo: 30 },
      clientesNuevos: 3,
      fiado: { total: 20.5, cuantos: 1 },
    });
    expect(p).toEqual({ mes: "2026-10", ventas: 150, transacciones: 3, ticketPromedio: 50, margen: 40, clientesNuevos: 3, fiadoDado: 20.5 });
  });

  it("un mes vacío no da NaN: ticket y margen null", () => {
    const p = armarPeriodo("2026-09", vacio);
    expect(p.ventas).toBe(0);
    expect(p.ticketPromedio).toBeNull();
    expect(p.margen).toBeNull();
    expect(Object.values(p).some((v) => typeof v === "number" && Number.isNaN(v))).toBe(false);
  });

  it("basura en los agregados cuenta como 0, nunca NaN", () => {
    const p = armarPeriodo("2026-10", { ...vacio, ventasPos: { total: Number.NaN, cuantas: Number.NaN, conCosto: 0, costo: 0 } });
    expect(p.ventas).toBe(0);
    expect(p.transacciones).toBe(0);
  });
});

describe("variacion", () => {
  it("sin base (0 o null) es null, no +100 %", () => {
    expect(variacion(0.1, 0)).toBeNull();
    expect(variacion(5, null)).toBeNull();
    expect(variacion(null, 5)).toBeNull();
    expect(variacion(Number.NaN, 5)).toBeNull();
  });
  it("redondea a un decimal", () => {
    expect(variacion(150, 100)).toBe(50);
    expect(variacion(1, 3)).toBe(-66.7);
  });
});

describe("mesDeComparacion", () => {
  it("mes pasado cruza el año; hace un año conserva el mes", () => {
    expect(mesDeComparacion("2026-10", "mes_pasado")).toBe("2026-09");
    expect(mesDeComparacion("2026-01", "mes_pasado")).toBe("2025-12");
    expect(mesDeComparacion("2026-10", "mismo_mes_anyo")).toBe("2025-10");
  });
});

describe("GET /api/finanzas/comparativo", () => {
  beforeEach(() => {
    H.delMes.mockReset();
    H.delMes.mockImplementation(async (_t: string, mes: string) =>
      mes === "2026-10" ? { ...vacio, ventasPos: { total: 0.1, cuantas: 1, conCosto: 0.1, costo: 18.29 } } : vacio,
    );
  });

  it("lee los dos meses con el tenant del JWT primero y no devuelve NaN", async () => {
    const res = await GET(new NextRequest("http://x/api/finanzas/comparativo?contra=mes_pasado&mes=2026-10"));
    expect(res.status).toBe(200);
    expect(H.delMes.mock.calls).toEqual([["t-1", "2026-10"], ["t-1", "2026-09"]]);
    const body = await res.json();
    expect(body.actual.ventas).toBe(0.1);
    expect(body.actual.transacciones).toBe(1);
    expect(body.base.ticketPromedio).toBeNull();
    expect(JSON.stringify(body)).not.toContain("NaN");
  });

  it("400 con contra o mes inválidos", async () => {
    expect((await GET(new NextRequest("http://x/api/finanzas/comparativo?contra=semana"))).status).toBe(400);
    expect((await GET(new NextRequest("http://x/api/finanzas/comparativo?mes=2026-13"))).status).toBe(400);
    expect(H.delMes).not.toHaveBeenCalled();
  });
});
