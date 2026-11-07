/**
 * Estrellas honestas del marketplace (09-10): las tarjetas leían la columna
 * sembrada Store.rating/reviewCount (mi-pollo 4,8 con «24 reseñas» y 0
 * aprobadas). `conRatingReal` pisa con el agregado de reseñas APROBADAS.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const groupBy = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { review: { groupBy: (...a: unknown[]) => groupBy(...a) } } }));

import { StoreReviewsDB } from "@/lib/db/store-reviews.db";

describe("StoreReviewsDB.conRatingReal", () => {
  beforeEach(() => groupBy.mockReset());

  it("sin reseñas aprobadas deja 0/0 aunque la columna diga 4,8 / 24", async () => {
    groupBy.mockResolvedValue([]);
    const [s] = await StoreReviewsDB.conRatingReal([{ id: "mi-pollo", rating: 4.8, reviewCount: 24, name: "x" }]);
    expect(s).toMatchObject({ id: "mi-pollo", rating: 0, reviewCount: 0, name: "x" });
  });

  it("con reseñas usa el promedio real redondeado a 1 decimal y su total", async () => {
    groupBy.mockResolvedValue([{ storeId: "a", _avg: { rating: 4.333 }, _count: { rating: 3 } }]);
    const out = await StoreReviewsDB.conRatingReal([
      { id: "a", rating: 5, reviewCount: 99 },
      { id: "b", rating: 4.9, reviewCount: 12 },
    ]);
    expect(out).toEqual([
      { id: "a", rating: 4.3, reviewCount: 3 },
      { id: "b", rating: 0, reviewCount: 0 },
    ]);
    // Una sola consulta para N tiendas, solo aprobadas y no borradas.
    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(groupBy.mock.calls[0][0]).toMatchObject({
      where: { storeId: { in: ["a", "b"] }, status: "approved", deletedAt: null },
    });
  });

  it("lista vacía no consulta la base", async () => {
    expect(await StoreReviewsDB.conRatingReal([])).toEqual([]);
    expect(groupBy).not.toHaveBeenCalled();
  });
});

describe("lives de ejemplo fuera del sitio real", () => {
  it("sin NEXT_PUBLIC_LIVES_DEMO los selectores no inventan transmisiones", async () => {
    vi.resetModules();
    const m = await import("@/lib/mocks/lives.mock");
    expect(m.LIVES_MOCK.length).toBeGreaterThan(0);
    expect(m.getLiveNow()).toBeNull();
    expect(m.getLivesNow()).toEqual([]);
    expect(m.getUpcomingLives()).toEqual([]);
    expect(m.getPastLives()).toEqual([]);
    expect(m.getLiveCategories()).toEqual([]);
    expect(m.getLiveById(m.LIVES_MOCK[0].id)).toBeNull();
  });
});
