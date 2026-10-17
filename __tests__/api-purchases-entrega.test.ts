/**
 * PATCH /api/purchases/[id] — cambiar la fecha prometida de entrega (C14, noche 17-10).
 * Sólo mientras la orden espera mercadería; queda el rastro «antes → después».
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockRequireAdmin, mockGetById, mockUpdate, mockLogActivity } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockGetById: vi.fn(),
  mockUpdate: vi.fn(),
  mockLogActivity: vi.fn(async (..._args: unknown[]) => undefined),
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/cache", () => ({ revalidateTenantTag: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: mockLogActivity }));
vi.mock("@/lib/jsondb", () => ({
  PurchasesDB: { getById: mockGetById, update: mockUpdate, pertenencia: vi.fn() },
}));

const OC = {
  id: "oc-entrega-123456",
  status: "pendiente",
  deliveryDate: "2026-10-20T00:00:00.000Z",
  items: [{ productId: 1, name: "Arroz", quantity: 10, unitCost: 20 }],
  igvIncluded: true,
};

function patch(body: unknown) {
  return new NextRequest(`http://localhost/api/purchases/${OC.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: OC.id }) };

describe("PATCH /api/purchases/[id] — fecha de entrega", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ role: "admin", username: "qa", tenantId: "main" });
    mockUpdate.mockImplementation(async (_t: string, _id: string, p: Record<string, unknown>) => ({ ...OC, ...p }));
  });

  it("mueve la fecha y deja el rastro antes → después, sin tocar estado ni stock", async () => {
    mockGetById.mockResolvedValueOnce(OC);
    const { PATCH } = await import("@/app/api/purchases/[id]/route");
    const res = await PATCH(patch({ deliveryDate: "2026-10-23" }), params);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith("main", OC.id, { deliveryDate: "2026-10-23" });
    expect(mockLogActivity).toHaveBeenCalledWith(
      "Actualizar", "compra", "Entrega de la orden 123456: martes 20/10 → viernes 23/10", OC.id, "qa",
    );
  });

  it("\"\" la deja sin fecha prometida", async () => {
    mockGetById.mockResolvedValueOnce(OC);
    const { PATCH } = await import("@/app/api/purchases/[id]/route");
    await PATCH(patch({ deliveryDate: "" }), params);
    expect(mockLogActivity.mock.calls[0][2]).toBe("Entrega de la orden 123456: martes 20/10 → sin fecha");
  });

  it("una orden recibida o cancelada ya no espera: 422 y no escribe", async () => {
    for (const status of ["recibido", "cancelado"]) {
      mockGetById.mockResolvedValueOnce({ ...OC, status });
      const { PATCH } = await import("@/app/api/purchases/[id]/route");
      const res = await PATCH(patch({ deliveryDate: "2026-10-23" }), params);
      expect(res.status).toBe(422);
    }
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("la misma fecha no deja rastro; una fecha mal escrita es 400", async () => {
    mockGetById.mockResolvedValueOnce({ ...OC, status: "recibido" });
    const { PATCH } = await import("@/app/api/purchases/[id]/route");
    const igual = await PATCH(patch({ deliveryDate: "2026-10-20", notes: "ok" }), params);
    expect(igual.status).toBe(200);
    expect(mockLogActivity).not.toHaveBeenCalled();
    const mal = await PATCH(patch({ deliveryDate: "20/10/2026" }), params);
    expect(mal.status).toBe(400);
  });
});
