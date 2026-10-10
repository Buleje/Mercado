/**
 * __tests__/metas-serie-logros.test.ts
 *
 * «Hoy», «Calendario» y «Logros» en el día de Lima (ADR-488). Antes el
 * calendario cortaba con `toISOString()` (una venta de las 20:00 de Pucallpa
 * caía al día siguiente), la racha nunca se escribía y «Mejor día» pedía
 * S/ 5.000 fijos en vez de superar el récord real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  prisma: {
    sale: { findMany: vi.fn() },
    order: { findMany: vi.fn() },
    review: { count: vi.fn(), findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));

import { MetasSerieDB } from "@/lib/db/metas-serie.db";
import { calcularMejorDia, calcularRacha, horaLima } from "@/lib/metas/logros-reglas";

// 20:00 de Lima del 08/10 = 01:00 UTC del 09/10.
const VEINTE_HORAS_DEL_8 = new Date("2026-10-09T01:00:00.000Z");

describe("MetasSerieDB — hora y día de Lima", () => {
  beforeEach(() => {
    H.prisma.sale.findMany.mockResolvedValue([{ createdAt: VEINTE_HORAS_DEL_8, total: 50 }]);
    H.prisma.order.findMany.mockResolvedValue([
      { createdAt: new Date("2026-10-08T14:30:00.000Z"), total: "12.40" },
    ]);
  });
  afterEach(() => vi.clearAllMocks());

  it("una venta a las 20:00 de Lima del 08-10 cae en la hora 20 del 08-10", async () => {
    expect(horaLima(VEINTE_HORAS_DEL_8)).toBe(20);
    const horas = await MetasSerieDB.porHora("t1", "2026-10-08");
    expect(horas).toHaveLength(24);
    expect(horas[20]).toEqual({ total: 50, n: 1 });
    expect(horas[9]).toEqual({ total: 12.4, n: 1 });
    // El día de Lima va de las 05:00 UTC a las 05:00 UTC del día siguiente.
    const where = H.prisma.sale.findMany.mock.calls[0]![0].where;
    expect(where.tenantId).toBe("t1");
    expect(where.createdAt.gte.toISOString()).toBe("2026-10-08T05:00:00.000Z");
    expect(where.createdAt.lt.toISOString()).toBe("2026-10-09T05:00:00.000Z");
    // Los pedidos sólo cuentan si entran como ingreso y no están borrados.
    const wherePedido = H.prisma.order.findMany.mock.calls[0]![0].where;
    expect(wherePedido.deletedAt).toBeNull();
    expect(wherePedido.status.in.length).toBeGreaterThan(0);
  });

  it("porDia pone esa venta en el 08-10, no en el 09-10", async () => {
    const dias = await MetasSerieDB.porDia("t1", "2026-10-01", "2026-10-31");
    expect(dias["2026-10-08"]).toEqual({ total: 62.4, n: 2 });
    expect(dias["2026-10-09"]).toBeUndefined();
  });

  it("«Cliente feliz» cuenta sólo reseñas aprobadas (una `pending` no pasó la moderación)", async () => {
    H.prisma.review.count.mockResolvedValue(0);
    H.prisma.review.findFirst.mockResolvedValue(null);
    await MetasSerieDB.hitosDeResenas("t1", 5, 5);
    const where = H.prisma.review.count.mock.calls[0]![0].where;
    expect(where).toMatchObject({ tenantId: "t1", deletedAt: null, status: "approved" });
  });

  it("más de 400 días: lee sólo los últimos 400", async () => {
    await MetasSerieDB.porDia("t1", "2020-01-01", "2026-10-08");
    const gte: Date = H.prisma.sale.findMany.mock.calls[0]![0].where.createdAt.gte;
    expect(gte.toISOString()).toBe("2025-09-04T05:00:00.000Z");
  });
});

describe("calcularRacha", () => {
  const conVenta = { total: 40, n: 1 };
  const dias = {
    "2026-10-01": conVenta,
    "2026-10-02": conVenta,
    "2026-10-03": conVenta,
    // 04: sin venta → corta
    "2026-10-05": conVenta,
    "2026-10-06": conVenta,
  };

  it("se corta en un día sin venta", () => {
    const r = calcularRacha(dias, "2026-10-01", "2026-10-06", null);
    expect(r.actual).toBe(2);
    expect(r.mejor).toBe(3);
    expect(r.alcanzada[3]).toBe("2026-10-03");
  });

  it("hoy sin vender todavía no corta la racha", () => {
    expect(calcularRacha(dias, "2026-10-01", "2026-10-07", null).actual).toBe(2);
  });

  it("con meta diaria, un día que vendió menos que la meta corta", () => {
    const r = calcularRacha(
      { ...dias, "2026-10-05": { total: 10, n: 3 } },
      "2026-10-01",
      "2026-10-06",
      30,
    );
    expect(r.actual).toBe(1);
    expect(r.mejor).toBe(3);
  });
});

describe("calcularMejorDia — el récord real", () => {
  it("se gana el día que supera al récord anterior", () => {
    const m = calcularMejorDia(
      {
        "2026-10-01": { total: 100, n: 1 },
        "2026-10-02": { total: 50, n: 1 },
        "2026-10-03": { total: 200, n: 2 },
      },
      "2026-10-04",
    );
    expect(m.superadoEn).toBe("2026-10-03");
    expect(m.record).toBe(200);
    expect(m.previoAHoy).toBe(200);
  });

  it("el primer día con ventas no supera nada", () => {
    const m = calcularMejorDia(
      { "2026-10-01": { total: 300, n: 1 }, "2026-10-02": { total: 100, n: 1 } },
      "2026-10-02",
    );
    expect(m.superadoEn).toBeNull();
    expect(m.previoAHoy).toBe(300);
    expect(m.hoyTotal).toBe(100);
  });
});

describe("evaluarLogros", () => {
  beforeEach(() => vi.resetModules());

  /** Monta `evaluarLogros` con una meta diaria de S/ 80 y los módulos `specs` prendidos. */
  async function montar(specs: string[]) {
    const meta = {
      id: "m1",
      name: "Ventas del día",
      category: "ventas",
      period: "diario",
      target: 80,
      current: 0,
      unit: "S/",
      createdAt: "2026-10-01T00:00:00.000Z",
    };
    vi.doMock("@/lib/cache", () => ({
      getOrSet: (_k: string, _t: number, fn: () => unknown) => fn(),
      invalidate: vi.fn(),
    }));
    vi.doMock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
    vi.doMock("@/lib/db/admin-goals.db", () => ({ AdminGoalsDB: { listar: async () => [meta] } }));
    vi.doMock("@/lib/db/customers.db", () => ({
      CustomersDB: { deudaDeFiados: async () => new Map() },
    }));
    vi.doMock("@/lib/db/analytics-fiado.db", () => ({
      AnalyticsFiadoDB: { aggregateCuotasPaidSince: async () => ({ _sum: { monto: 250 } }) },
    }));
    vi.doMock("@/lib/metas/avance", () => ({
      avanceDeMetas: async () => [{ id: "m1", estado: "en_camino" }],
      avanceDePrueba: async (_t: string, q: { category: string }) => ({
        avance: q.category === "madera_ingresada" ? 120 : 0,
      }),
    }));
    vi.doMock("@/lib/db/metas-serie.db", () => ({
      TOPE_DIAS_SERIE: 400,
      MetasSerieDB: {
        porDia: async () => ({
          "2026-10-05": { total: 90, n: 2 },
          "2026-10-06": { total: 100, n: 2 },
          "2026-10-07": { total: 300, n: 3 },
          "2026-10-08": { total: 50, n: 1 },
        }),
        hitosDeVentas: async () => ({
          n: 8,
          fechas: { 1: "2026-10-05" },
          ticketMax: 120,
          fechaTicket: null,
        }),
        hitosDeClientes: async () => ({ n: 3, fechas: {} }),
        hitosDeResenas: async () => ({ n: 0, fechas: {} }),
        cierresDeCaja: async () => [],
      },
    }));
    vi.doMock("@/lib/specializations", () => ({
      listEnabledSpecializations: async () => specs,
    }));
    const { evaluarLogros } = await import("@/lib/metas/logros");
    const { logros } = await evaluarLogros("t1", "2026-10-08");
    return logros;
  }

  it("rachas por días con venta, «Vendedor estrella» por la meta y «Mejor día» por el récord", async () => {
    const logros = await montar(["spec:forestal:ctp-libro", "spec:forestal:herramientas"]);
    const de = (id: string) => logros.find((l) => l.id === id)!;

    expect(logros).toHaveLength(24);
    expect(de("mejor-dia")).toMatchObject({
      ganado: true,
      desde: "2026-10-07",
      progreso: { valor: 50, meta: 300 },
    });
    // Las rachas cuentan días con venta (05 a 08): subir la meta no las borra.
    expect(de("racha-3")).toMatchObject({ ganado: true, desde: "2026-10-07" });
    expect(de("racha-7").progreso).toMatchObject({ valor: 4, meta: 7 });
    // 05, 06 y 07 vendieron ≥ 80; el 08 (hoy) todavía no y no corta.
    expect(de("vendedor-estrella").progreso).toMatchObject({ valor: 3, meta: 5 });
    expect(de("vendedor-estrella").queMide).toContain("meta de hoy");
    expect(de("primera-venta")).toMatchObject({ ganado: true, desde: "2026-10-05" });
    expect(de("todo-cobrado").ganado).toBe(true);
    expect(de("meta-cumplida").ganado).toBe(false);
    expect(de("100-m3-ingresados")).toMatchObject({ area: "forestal", ganado: true });
    expect(de("primer-despacho").ganado).toBe(false);
  });

  it("sin módulo forestal no hay logros del aserradero", async () => {
    const logros = await montar([]);
    expect(logros.filter((l) => l.area === "forestal")).toEqual([]);
    expect(logros).toHaveLength(21);
  });
});

describe("Hoy — pronóstico al céntimo", () => {
  it("S/ 0.10 vendido no pronostica «cierras con S/ 0»", async () => {
    const { lineaDelDia, pronosticoDelDia } = await import(
      "@/components/admin/metas/hoy/hoy-calculos"
    );
    // 16:00: 11 horas pasadas desde las 6:00, quedan 5 → 0.10 + 0.10/11·5 = 0.145…
    expect(pronosticoDelDia(0.1, 16)).toBe(0.15);
    const fmt = (n: number) => `S/ ${n}`;
    // Lo que falta, repartido en las horas que quedan hasta las 21:00, al céntimo.
    expect(lineaDelDia(0.1, 5, 16, fmt).texto).toBe(
      "Te faltan S/ 4.9: vende S/ 0.98 por hora en las 5 h que quedan",
    );
    expect(lineaDelDia(0.1, 5, 18, fmt).texto).toContain("vende S/ 1.63 por hora");
    expect(lineaDelDia(0.1, 5, 20, fmt).texto).toContain("en la hora que queda");
  });

  it("el tono de la línea sale del cierre estimado, no de otra cuenta", async () => {
    const { lineaDelDia } = await import("@/components/admin/metas/hoy/hoy-calculos");
    const fmt = (n: number) => `S/ ${n}`;
    expect(lineaDelDia(100, 300, 12, fmt, 320).tono).toBe("exito");
    expect(lineaDelDia(100, 300, 12, fmt, 250).tono).toBe("aviso");
    expect(lineaDelDia(100, 300, 12, fmt, null).tono).toBe("aviso");
    expect(lineaDelDia(320, 300, 12, fmt, null).texto).toBe("Meta superada por S/ 20");
  });
});

describe("Hoy — cierre estimado y hora fuerte con la semana pasada", () => {
  const tramos = (porHora: Record<number, number>) =>
    Array.from({ length: 24 }, (_, h) => ({ total: porHora[h] ?? 0, n: porHora[h] ? 1 : 0 }));

  it("cierre = lo de hoy + lo que la semana pasada vendió DESPUÉS de esta hora", async () => {
    const { resumirDia } = await import("@/components/admin/metas/hoy/hoy-calculos");
    // Sábado pasado: S/ 50 a las 9, S/ 200 a las 19. Hoy a las 10 llevas S/ 80.
    const r = resumirDia(tramos({ 8: 30, 10: 50 }), tramos({ 9: 5 }), tramos({ 9: 50, 19: 200 }), 10);
    expect(r.total).toBe(80);
    expect(r.semana).toEqual({ aEstaHora: 50, total: 250 });
    expect(r.ayer).toEqual({ aEstaHora: 5, total: 5 });
    expect(r.cierre).toEqual({ monto: 280, base: "semana" });
    expect(r.horaFuerte).toEqual({ hora: 19, total: 200, n: 1 });
  });

  it("sin ventas hoy igual estima con la semana pasada; casi 0 a esta hora no dispara un cociente", async () => {
    const { cierreEstimado } = await import("@/components/admin/metas/hoy/hoy-calculos");
    expect(cierreEstimado(0, 8, { aEstaHora: 0.1, total: 3000.1 })).toEqual({ monto: 3000, base: "semana" });
  });

  it("sin semana pasada: el ritmo de hoy dentro del horario; sin nada, null", async () => {
    const { cierreEstimado, horaFuerteQueViene } = await import(
      "@/components/admin/metas/hoy/hoy-calculos"
    );
    const vacio = { aEstaHora: 0, total: 0 };
    expect(cierreEstimado(0.1, 16, vacio)).toEqual({ monto: 0.15, base: "ritmo" });
    expect(cierreEstimado(0, 16, vacio)).toBeNull();
    expect(cierreEstimado(100, 22, vacio)).toBeNull();
    // La hora fuerte es la que todavía no llegó: las de antes no cuentan.
    expect(horaFuerteQueViene(tramos({ 9: 500, 18: 40 }), 12)).toEqual({ hora: 18, total: 40, n: 1 });
    expect(horaFuerteQueViene(tramos({ 9: 500 }), 12)).toBeNull();
  });
});
