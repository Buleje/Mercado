/**
 * Reportes comparativos de Mi Plata (11-10): la pantalla mostraba S/ 0,00 y
 * «NaN%» porque leía un endpoint que ignora el rango. Fija la regla pura
 * (ningún NaN, «—» sin base) y la ruta nueva (tenantId del JWT primero, los
 * dos meses de Lima correctos, 400 con parámetros malos).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ delMes: vi.fn(), delRangoCompleto: vi.fn(), auth: vi.fn() }));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: (...a: unknown[]) => H.auth(...a) }));
vi.mock("@/lib/cache", () => ({
  getOrSet: async (_k: string, _t: number, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/db/comparativo-periodos.db", () => ({
  ComparativoPeriodosDB: {
    delMes: (...a: unknown[]) => H.delMes(...a),
    delRangoCompleto: (...a: unknown[]) => H.delRangoCompleto(...a),
  },
}));

import { NextRequest, NextResponse } from "next/server";
import {
  armarPeriodo,
  armarPeriodoDeComparacion,
  etiquetaDelRango,
  instantesDelRango,
  mesDeComparacion,
  parsearDia,
  periodoSiguiente,
  rangoDeComparacion,
  rangoDelPeriodo,
  variacion,
  type AgregadosDelMes,
  type AgregadosDelRango,
} from "@/lib/finance/comparativo-periodos";
import { rangoDelMesLima } from "@/lib/finance/ingresos-del-periodo";
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
    expect(p).toEqual({
      mes: "2026-10",
      ventas: 150,
      transacciones: 3,
      ticketPromedio: 50,
      margen: 40,
      clientesNuevos: 3,
      fiadoDado: 20.5,
    });
  });

  it("un mes vacío no da NaN: ticket y margen null", () => {
    const p = armarPeriodo("2026-09", vacio);
    expect(p.ventas).toBe(0);
    expect(p.ticketPromedio).toBeNull();
    expect(p.margen).toBeNull();
    expect(Object.values(p).some((v) => typeof v === "number" && Number.isNaN(v))).toBe(false);
  });

  it("basura en los agregados cuenta como 0, nunca NaN", () => {
    const p = armarPeriodo("2026-10", {
      ...vacio,
      ventasPos: { total: Number.NaN, cuantas: Number.NaN, conCosto: 0, costo: 0 },
    });
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

beforeEach(() => {
  H.auth.mockReset();
  H.auth.mockResolvedValue({ tenantId: "t-1", role: "admin" });
});

describe("GET /api/finanzas/comparativo", () => {
  beforeEach(() => {
    H.delMes.mockReset();
    H.delMes.mockImplementation(async (_t: string, mes: string) =>
      mes === "2026-10"
        ? { ...vacio, ventasPos: { total: 0.1, cuantas: 1, conCosto: 0.1, costo: 18.29 } }
        : vacio,
    );
  });

  it("lee los dos meses con el tenant del JWT primero y no devuelve NaN", async () => {
    const res = await GET(
      new NextRequest("http://x/api/finanzas/comparativo?contra=mes_pasado&mes=2026-10"),
    );
    expect(res.status).toBe(200);
    expect(H.delMes.mock.calls).toEqual([
      ["t-1", "2026-10"],
      ["t-1", "2026-09"],
    ]);
    const body = await res.json();
    expect(body.actual.ventas).toBe(0.1);
    expect(body.actual.transacciones).toBe(1);
    expect(body.base.ticketPromedio).toBeNull();
    expect(JSON.stringify(body)).not.toContain("NaN");
  });

  it("400 con contra o mes inválidos", async () => {
    expect(
      (await GET(new NextRequest("http://x/api/finanzas/comparativo?contra=semana"))).status,
    ).toBe(400);
    expect(
      (await GET(new NextRequest("http://x/api/finanzas/comparativo?mes=2026-13"))).status,
    ).toBe(400);
    expect(H.delMes).not.toHaveBeenCalled();
  });
});

/* ───────────── Comparar períodos (11-10, tanda 5) ─────────────
 * Antes sumaba en el navegador sólo ventas del POS (las últimas 1 000) con el
 * reloj del navegador: 2026 en `main` daba S/ 259,30 contra los S/ 397,50 de
 * Mi Plata. Fija los rangos de días de Lima, el armado en céntimos y el modo
 * `periodo` de la ruta (tenant del JWT, 400 con parámetros malos). */

const vacioRango: AgregadosDelRango = {
  ...vacio,
  clientesUnicos: 0,
  devoluciones: { total: 0, cuantas: 0 },
};

describe("rangoDelPeriodo / rangoDeComparacion", () => {
  it("semana de lunes a domingo; el domingo cierra su semana", () => {
    expect(rangoDelPeriodo("semana", "2026-10-11")).toEqual({
      desde: "2026-10-05",
      hasta: "2026-10-11",
    });
    expect(rangoDelPeriodo("semana", "2026-10-12")).toEqual({
      desde: "2026-10-12",
      hasta: "2026-10-18",
    });
  });

  it("mes, trimestre y año de calendario (febrero bisiesto incluido)", () => {
    expect(rangoDelPeriodo("mes", "2028-02-10")).toEqual({
      desde: "2028-02-01",
      hasta: "2028-02-29",
    });
    expect(rangoDelPeriodo("trimestre", "2026-11-30")).toEqual({
      desde: "2026-10-01",
      hasta: "2026-12-31",
    });
    expect(rangoDelPeriodo("anyo", "2026-06-15")).toEqual({
      desde: "2026-01-01",
      hasta: "2026-12-31",
    });
  });

  it("anterior cruza el año; hace un año conserva el período (la semana, 52 semanas atrás)", () => {
    const sem = rangoDelPeriodo("semana", "2026-01-01");
    expect(sem).toEqual({ desde: "2025-12-29", hasta: "2026-01-04" });
    expect(rangoDeComparacion("semana", sem, "anterior")).toEqual({
      desde: "2025-12-22",
      hasta: "2025-12-28",
    });
    expect(rangoDeComparacion("semana", sem, "hace_un_anyo")).toEqual({
      desde: "2024-12-30",
      hasta: "2025-01-05",
    });
    const t1 = rangoDelPeriodo("trimestre", "2026-02-01");
    expect(rangoDeComparacion("trimestre", t1, "anterior")).toEqual({
      desde: "2025-10-01",
      hasta: "2025-12-31",
    });
    expect(rangoDeComparacion("mes", rangoDelPeriodo("mes", "2026-10-11"), "hace_un_anyo")).toEqual(
      { desde: "2025-10-01", hasta: "2025-10-31" },
    );
    expect(periodoSiguiente("mes", rangoDelPeriodo("mes", "2026-12-05"))).toEqual({
      desde: "2027-01-01",
      hasta: "2027-01-31",
    });
  });

  it("el mes de Lima corta en el MISMO instante que Mi Plata (rangoDelMesLima)", () => {
    expect(instantesDelRango(rangoDelPeriodo("mes", "2026-10-11"))).toEqual(
      rangoDelMesLima("2026-10"),
    );
    expect(instantesDelRango(rangoDelPeriodo("mes", "2026-12-01"))).toEqual(
      rangoDelMesLima("2026-12"),
    );
  });

  it("parsearDia rechaza días que no existen y años absurdos", () => {
    expect(parsearDia("2026-02-28")).toBe("2026-02-28");
    expect(parsearDia("2026-02-30")).toBeNull();
    expect(parsearDia("1999-12-31")).toBeNull();
    expect(parsearDia("2026-1-01")).toBeNull();
  });

  it("etiquetas cortas y con «setiembre»", () => {
    expect(etiquetaDelRango("mes", rangoDelPeriodo("mes", "2026-09-03"))).toBe("Setiembre 2026");
    expect(etiquetaDelRango("semana", { desde: "2026-10-05", hasta: "2026-10-11" })).toBe(
      "5–11 oct 2026",
    );
    expect(etiquetaDelRango("semana", { desde: "2026-09-28", hasta: "2026-10-04" })).toBe(
      "28 set–4 oct 2026",
    );
    expect(etiquetaDelRango("trimestre", rangoDelPeriodo("trimestre", "2026-10-11"))).toBe(
      "Oct–dic 2026",
    );
    expect(etiquetaDelRango("anyo", rangoDelPeriodo("anyo", "2026-10-11"))).toBe("2026");
  });
});

describe("armarPeriodoDeComparacion", () => {
  const r = { desde: "2026-10-01", hasta: "2026-10-31" };

  it("suma en céntimos (0,10 + 0,20 = 0,30 exacto) con la regla de Mi Plata", () => {
    const p = armarPeriodoDeComparacion("mes", r, {
      ...vacioRango,
      ventasPos: { total: 0.1, cuantas: 1, conCosto: 0.1, costo: 0.05 },
      pedidos: { total: 0.2, cuantos: 2, conCosto: 0, costo: 0 },
      clientesUnicos: 2,
      devoluciones: { total: 24.9, cuantas: 1 },
    });
    expect(p.ventas).toBe(0.3);
    expect(p.transacciones).toBe(3);
    expect(p.ticketPromedio).toBe(0.1);
    expect(p.costoDeVentas).toBe(0.05);
    expect(p.margen).toBe(50);
    expect(p.clientesUnicos).toBe(2);
    expect(p.devoluciones).toBe(24.9);
    expect(p.etiqueta).toBe("Octubre 2026");
  });

  it("margen fuera de ±999 % (S/ 0,10 vendidos con S/ 18,29 de costo) es «—», no −18190 %", () => {
    const p = armarPeriodoDeComparacion("mes", r, {
      ...vacioRango,
      ventasPos: { total: 0.1, cuantas: 1, conCosto: 0.1, costo: 18.29 },
    });
    expect(p.margen).toBeNull();
    expect(p.costoDeVentas).toBe(18.29);
  });

  it("vacío: nada NaN, ticket y margen null", () => {
    const p = armarPeriodoDeComparacion(
      "semana",
      { desde: "2026-10-05", hasta: "2026-10-11" },
      vacioRango,
    );
    expect(p.ticketPromedio).toBeNull();
    expect(p.margen).toBeNull();
    expect(JSON.stringify(p)).not.toContain("NaN");
  });
});

describe("GET /api/finanzas/comparativo?periodo=…", () => {
  beforeEach(() => {
    H.delRangoCompleto.mockReset();
    H.delRangoCompleto.mockImplementation(async (_t: string, rango: { start: Date }) =>
      rango.start.toISOString() === "2026-10-01T05:00:00.000Z"
        ? {
            ...vacioRango,
            ventasPos: { total: 0.1, cuantas: 1, conCosto: 0.1, costo: 18.29 },
            devoluciones: { total: 24.9, cuantas: 1 },
          }
        : vacioRango,
    );
  });

  it("mes de Lima contra el anterior, con el tenant del JWT (un tenantId en la URL no cuenta)", async () => {
    const res = await GET(
      new NextRequest(
        "http://x/api/finanzas/comparativo?periodo=mes&fecha=2026-10-11&tenantId=otro",
      ),
    );
    expect(res.status).toBe(200);
    expect(H.delRangoCompleto.mock.calls.map((c) => c[0])).toEqual(["t-1", "t-1"]);
    expect(H.delRangoCompleto.mock.calls[0][1]).toEqual(rangoDelMesLima("2026-10"));
    expect(H.delRangoCompleto.mock.calls[1][1]).toEqual(rangoDelMesLima("2026-09"));
    const body = await res.json();
    expect(body).toMatchObject({ periodo: "mes", contra: "anterior" });
    expect(body.actual).toMatchObject({
      desde: "2026-10-01",
      hasta: "2026-10-31",
      ventas: 0.1,
      devoluciones: 24.9,
      margen: null,
    });
    expect(body.base).toMatchObject({ desde: "2026-09-01", etiqueta: "Setiembre 2026", ventas: 0 });
    expect(H.delMes).not.toHaveBeenCalled();
  });

  it("hace un año: misma semana 52 semanas atrás", async () => {
    await GET(
      new NextRequest(
        "http://x/api/finanzas/comparativo?periodo=semana&contra=hace_un_anyo&fecha=2026-10-11",
      ),
    );
    expect(H.delRangoCompleto.mock.calls[1][1]).toEqual(
      instantesDelRango({ desde: "2025-10-06", hasta: "2025-10-12" }),
    );
  });

  it("400 con periodo, contra o fecha inválidos, sin tocar la base", async () => {
    for (const q of [
      "periodo=dia",
      "periodo=mes&contra=mes_pasado",
      "periodo=mes&fecha=2026-02-30",
      "periodo=mes&fecha=hoy",
    ]) {
      expect((await GET(new NextRequest(`http://x/api/finanzas/comparativo?${q}`))).status, q).toBe(
        400,
      );
    }
    expect(H.delRangoCompleto).not.toHaveBeenCalled();
  });

  it("gestión + analista, como monthly-summary (cajero y almacenero quedan afuera)", async () => {
    await GET(new NextRequest("http://x/api/finanzas/comparativo?periodo=mes"));
    expect(H.auth.mock.calls[0][1]).toEqual(["admin", "owner", "manager", "analista"]);
  });

  it("sin sesión: 401 y no se lee nada", async () => {
    H.auth.mockResolvedValueOnce(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    expect(
      (await GET(new NextRequest("http://x/api/finanzas/comparativo?periodo=mes"))).status,
    ).toBe(401);
    expect(H.delRangoCompleto).not.toHaveBeenCalled();
  });
});
