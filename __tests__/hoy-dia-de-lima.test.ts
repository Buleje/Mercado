/**
 * «Hoy» del panel = el día de LIMA, no el del servidor (2026-10-09).
 *
 * El servidor de Vercel corre en UTC: `setHours(0)` / `new Date(y, m, d)` daban
 * la medianoche UTC = 19:00 de Lima del día ANTERIOR, así que a las 20:00 de
 * Lima «hoy» ya era mañana (perdía el día) y antes de las 19:00 mezclaba las
 * ventas de anoche. Estos tests fijan el reloj a las 20:00 de Lima del 09-10
 * (01:00 UTC del 10-10) y fuerzan el proceso a UTC, como en producción.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { llamadas, ventas, tzOriginal } = vi.hoisted(() => {
  const tzOriginal = process.env.TZ;
  process.env.TZ = "UTC"; // el servidor real; en la PC de Brandon (Lima) el bug no se ve
  return {
    tzOriginal,
    llamadas: [] as { modelo: string; metodo: string; args: { where?: Record<string, unknown> } }[],
    ventas: { filas: [] as { id: string; total: number; createdAt: Date; paymentMethod: string }[] },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_t, modelo: string) =>
        modelo.startsWith("$")
          ? async () => [] // $queryRaw de la cabecera (no mira fechas)
          : new Proxy(
          {},
          {
            get: (_m, metodo: string) => async (args: { where?: Record<string, unknown> }) => {
              llamadas.push({ modelo, metodo, args });
              if (metodo === "findMany") return modelo === "sale" ? ventas.filas : [];
              if (metodo === "aggregate") return { _sum: { total: 0 }, _count: 0 };
              if (metodo === "count") return 0;
              if (metodo === "groupBy") return [];
              return null;
            },
          },
        ),
    },
  ),
}));

import { VentasOverviewDB, buildDateRange, horaLima, prevRangeStart, rangeStart } from "@/lib/db/ventas-overview.db";
import { AdminTodaySummaryDB } from "@/lib/db/admin-today-summary.db";
import { AdminStatsDB } from "@/lib/db/admin-stats.db";
import { getPeruDayBounds } from "@/lib/db/cierre-diario.db";

const LAS_20_DE_LIMA = new Date("2026-10-10T01:00:00.000Z"); // 09-10 20:00 Lima
const HOY_LIMA = "2026-10-09T05:00:00.000Z"; // 09-10 00:00 Lima
const AYER_LIMA = "2026-10-08T05:00:00.000Z";

const gteDe = (modelo: string, metodo: string, i = 0): string | undefined => {
  const c = llamadas.filter((l) => l.modelo === modelo && l.metodo === metodo)[i];
  const createdAt = c?.args.where?.createdAt as { gte?: Date } | undefined;
  return createdAt?.gte?.toISOString();
};

beforeEach(() => {
  llamadas.length = 0;
  ventas.filas = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(LAS_20_DE_LIMA);
});

afterAll(() => {
  vi.useRealTimers();
  process.env.TZ = tzOriginal;
});

describe("el proceso simula al servidor de producción", () => {
  it("corre en UTC (si no, el bug viejo no se reproduce y el test no prueba nada)", () => {
    expect(new Date().getTimezoneOffset()).toBe(0);
  });
});

describe("Tablero de Ventas (VentasOverviewDB)", () => {
  it("rangos: hoy, ayer, 7 y 30 días arrancan a las 00:00 de Lima", () => {
    const hoy = rangeStart("hoy");
    expect(hoy.toISOString()).toBe(HOY_LIMA);
    expect(prevRangeStart("hoy", hoy).toISOString()).toBe(AYER_LIMA);
    expect(rangeStart("7d").toISOString()).toBe("2026-10-02T05:00:00.000Z");
    expect(rangeStart("30d").toISOString()).toBe("2026-09-09T05:00:00.000Z");
    expect(prevRangeStart("7d", rangeStart("7d")).toISOString()).toBe("2026-09-25T05:00:00.000Z");
  });

  it("serie diaria con días de Lima y horas de Lima", () => {
    const dias = buildDateRange(rangeStart("7d"), new Date());
    expect(dias).toHaveLength(8);
    expect(dias[0]).toBe("2026-10-02");
    expect(dias.at(-1)).toBe("2026-10-09"); // a las 20:00 de Lima sigue siendo el 09
    expect(horaLima(new Date("2026-10-10T00:30:00.000Z"))).toBe(19);
    expect(horaLima(new Date("2026-10-09T04:00:00.000Z"))).toBe(23);
  });

  it("«hoy» cuenta la venta de las 19:30 y deja la de anoche (23:00 del 08) en el período anterior", async () => {
    ventas.filas = [
      { id: "anoche", total: 10, createdAt: new Date("2026-10-09T04:00:00.000Z"), paymentMethod: "efectivo" },
      { id: "manana", total: 20, createdAt: new Date("2026-10-09T14:00:00.000Z"), paymentMethod: "efectivo" },
      { id: "noche", total: 30, createdAt: new Date("2026-10-10T00:30:00.000Z"), paymentMethod: "yape" },
    ];
    const d = await VentasOverviewDB.get("t1", "hoy");
    expect(gteDe("sale", "findMany")).toBe(AYER_LIMA); // trae desde ayer para la tendencia
    expect(d.channels.pos.revenue).toBe(50);
    expect(d.previous.revenue).toBe(10);
    expect(d.series).toEqual([{ date: "2026-10-09", marketplace: 0, tienda: 0, pos: 50 }]);
    expect(d.hourly[9].revenue).toBe(20);
    expect(d.hourly[19].revenue).toBe(30);
    expect(d.hourly[23].revenue).toBe(0);
  });
});

describe("«Mi negocio hoy» (AdminTodaySummaryDB) y la cabecera del panel (AdminStatsDB)", () => {
  it("hoy y ayer son días de Lima", async () => {
    await AdminTodaySummaryDB.getSummaryForTenant("t1");
    expect(gteDe("sale", "aggregate", 0)).toBe(HOY_LIMA);
    expect(gteDe("sale", "aggregate", 1)).toBe(AYER_LIMA);
    const ayer = llamadas.filter((l) => l.modelo === "sale" && l.metodo === "aggregate")[1];
    expect((ayer.args.where?.createdAt as { lt: Date }).lt.toISOString()).toBe(HOY_LIMA);
  });

  it("pedidos de hoy y de la semana desde las 00:00 de Lima", async () => {
    await AdminStatsDB.getHeaderStats("t1");
    const desdes = llamadas
      .filter((l) => l.modelo === "order")
      .map((l) => (l.args.where?.createdAt as { gte?: Date } | undefined)?.gte?.toISOString())
      .filter(Boolean);
    expect(desdes).toContain(HOY_LIMA);
    expect(desdes).toContain("2026-10-03T05:00:00.000Z"); // 7 días móviles con hoy
    expect(desdes).toContain(AYER_LIMA);
  });
});

describe("Cierre diario (getPeruDayBounds)", () => {
  it("a las 20:00 de Lima la fecha sigue siendo el 09-10", () => {
    const b = getPeruDayBounds();
    expect(b.fecha).toBe("2026-10-09");
    expect(b.startOfDay.toISOString()).toBe(HOY_LIMA);
    expect(b.endOfDay.toISOString()).toBe("2026-10-10T05:00:00.000Z");
  });

  it("a las 09:00 de Lima también (la cuenta vieja daba AYER en una PC en Lima)", () => {
    process.env.TZ = "America/Lima";
    try {
      const b = getPeruDayBounds(new Date("2026-10-09T14:00:00.000Z"));
      expect(b.fecha).toBe("2026-10-09");
      expect(b.startOfDay.toISOString()).toBe(HOY_LIMA);
    } finally {
      process.env.TZ = "UTC";
    }
  });
});
