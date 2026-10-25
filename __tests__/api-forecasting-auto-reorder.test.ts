import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const gen = vi.fn();
const crear = vi.fn();
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({ tenantId: "t1", username: "u" })),
}));
vi.mock("@/lib/forecasting/auto-reorder", () => ({
  generateReorderSuggestions: (...a: unknown[]) => gen(...a),
  createAutoPurchaseOrders: (...a: unknown[]) => crear(...a),
}));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));

import { POST } from "@/app/api/forecasting/auto-reorder/route";

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/forecasting/auto-reorder", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("POST /api/forecasting/auto-reorder", () => {
  beforeEach(() => {
    gen.mockReset();
    crear.mockReset();
    gen.mockResolvedValue([{ productId: 1 }, { productId: 2 }, { productId: 3 }]);
    crear.mockResolvedValue([]);
  });

  it("sin productIds pide todo lo sugerido del tenant", async () => {
    await POST(req({ usePrecalculated: false }));
    expect(gen).toHaveBeenCalledWith("t1");
    expect(crear.mock.calls[0][1]).toHaveLength(3);
  });

  it("con productIds filtra y descarta ids que no son sugerencias del tenant", async () => {
    const res = await POST(req({ productIds: ["2", "999"] }));
    expect(res.status).toBe(200);
    expect(crear.mock.calls[0][1]).toEqual([{ productId: 2 }]);
  });

  it("productIds vacío o sobre el tope = 400", async () => {
    expect((await POST(req({ productIds: [] }))).status).toBe(400);
    expect((await POST(req({ productIds: Array(501).fill("1") }))).status).toBe(400);
    expect(crear).not.toHaveBeenCalled();
  });

  it("ninguna coincidencia no crea órdenes", async () => {
    const res = await POST(req({ productIds: ["999"] }));
    expect(crear).not.toHaveBeenCalled();
    expect((await res.json()).purchaseOrders).toEqual([]);
  });
});
