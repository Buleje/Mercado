/**
 * ADR-047 — Wiring tests para hot paths.
 *
 * Cada hot path de negocio (recommender, whatsapp concierge, SUNAT emit,
 * daily-summary) debe emitir al MeteringBus. Este suite verifica el
 * contrato de emisión sin tocar la base de datos real ni APIs externas.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Shared mock for the bus
const mockEmitMeteringEvent = vi.fn();
const mockReportAICall = vi.fn();

vi.mock("@/lib/billing/wire-up/metering-bus", () => ({
  emitMeteringEvent: mockEmitMeteringEvent,
  getMeteringBus: vi.fn(),
}));

vi.mock("@/lib/billing/wire-up/ai-metering-middleware", () => ({
  reportAICall: mockReportAICall,
  withAIMetering: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

beforeEach(() => {
  mockEmitMeteringEvent.mockReset();
  mockReportAICall.mockReset();
  vi.resetModules();
});

// ─── Recommender API route ─────────────────────────────────────────────────

describe("wiring → recommender hybrid route", () => {
  it("emite ai.recommend.call cuando hay recomendaciones", async () => {
    vi.doMock("@/lib/recommender/hybrid", () => ({
      getHybridRecommendations: vi.fn().mockResolvedValue({
        source: "hybrid",
        recommendations: [
          { productId: 1, name: "Arroz", price: 10, vectorScore: 0.9, copurchaseScore: 0.1, score: 0.7 },
        ],
      }),
    }));
    vi.doMock("@/lib/tenant", () => ({
      getTenantIdFromRequest: vi.fn().mockReturnValue("tenant-abc"),
    }));

    const { GET } = await import("@/app/api/recommender/hybrid/route");
    const req = new Request("http://test/api/recommender/hybrid?productId=1&limit=3");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    expect(mockReportAICall).toHaveBeenCalledTimes(1);
    expect(mockReportAICall).toHaveBeenCalledWith(
      "tenant-abc",
      "ai.recommend.call",
      expect.stringMatching(/^rec:tenant-abc:1:/),
    );
  });

  it("NO emite cuando el source es empty", async () => {
    vi.doMock("@/lib/recommender/hybrid", () => ({
      getHybridRecommendations: vi.fn().mockResolvedValue({
        source: "empty",
        recommendations: [],
      }),
    }));
    vi.doMock("@/lib/tenant", () => ({
      getTenantIdFromRequest: vi.fn().mockReturnValue("tenant-abc"),
    }));

    const { GET } = await import("@/app/api/recommender/hybrid/route");
    const req = new Request("http://test/api/recommender/hybrid?productId=99&limit=5");
    await GET(req as unknown as import("next/server").NextRequest);
    expect(mockReportAICall).not.toHaveBeenCalled();
  });

  it("la idempotencyKey usa bucket de minuto", async () => {
    vi.doMock("@/lib/recommender/hybrid", () => ({
      getHybridRecommendations: vi.fn().mockResolvedValue({
        source: "copurchase",
        recommendations: [{ productId: 1, name: "X", price: 1, vectorScore: 0, copurchaseScore: 1, score: 0.3 }],
      }),
    }));
    vi.doMock("@/lib/tenant", () => ({
      getTenantIdFromRequest: vi.fn().mockReturnValue("tenant-xyz"),
    }));

    const { GET } = await import("@/app/api/recommender/hybrid/route");
    const req = new Request("http://test/api/recommender/hybrid?productId=42&limit=2");
    await GET(req as unknown as import("next/server").NextRequest);
    const calls = mockReportAICall.mock.calls;
    expect(calls.length).toBe(1);
    const key = calls[0][2];
    // Pattern: rec:<tenant>:<productId>:<minuteBucketInt>
    expect(key).toMatch(/^rec:tenant-xyz:42:\d+$/);
    const bucket = Number(key.split(":").pop());
    expect(Math.abs(bucket - Math.floor(Date.now() / 60_000))).toBeLessThanOrEqual(1);
  });
});
