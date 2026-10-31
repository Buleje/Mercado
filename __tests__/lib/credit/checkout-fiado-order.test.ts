import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/credit/checkout-fiado", () => ({
  getFiadoCheckoutEligibility: vi.fn(),
}));
vi.mock("@/lib/db/fiados.db", () => ({
  FiadosDB: { create: vi.fn() },
}));

import { createFiadoForOrder } from "@/lib/credit/checkout-fiado-order";
import { getFiadoCheckoutEligibility } from "@/lib/credit/checkout-fiado";
import { FiadosDB } from "@/lib/db/fiados.db";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getFiadoCheckoutEligibility).mockResolvedValue({
    eligible: true,
    availableCredit: 80,
    creditLimit: 100,
    dueDate: new Date("2026-06-15"),
    reason: null,
  });
  vi.mocked(FiadosDB.create).mockResolvedValue({ id: "fiado-1" } as never);
});

describe("createFiadoForOrder", () => {
  it("crea el Fiado con fechaVence = dueDate y descripción del pedido", async () => {
    await createFiadoForOrder("t1", {
      orderId: "ord-9",
      customerId: "+51999",
      total: 30,
    });
    expect(FiadosDB.create).toHaveBeenCalledWith({
      tenantId: "t1",
      customerId: "+51999",
      total: 30,
      descripcion: "Pedido ord-9",
      fechaVence: new Date("2026-06-15"),
    });
  });

  it("rechaza si la elegibilidad falla (anti-fraude server-side)", async () => {
    vi.mocked(getFiadoCheckoutEligibility).mockResolvedValue({
      eligible: false,
      availableCredit: 0,
      creditLimit: 0,
      dueDate: null,
      reason: "Supera límite",
    });
    await expect(
      createFiadoForOrder("t1", { orderId: "ord-9", customerId: "+51999", total: 999 }),
    ).rejects.toThrow(/límite/i);
    expect(FiadosDB.create).not.toHaveBeenCalled();
  });
});
