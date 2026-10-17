/**
 * El Tablero de Ventas (`VentasOverviewDB.get`, "use cache", tag
 * `ventas-overview-${tenantId}`) cuenta Order + Sale. Con HEAD sólo la caja
 * purgaba el tag: un pedido borrado/editado o una venta por `SalesDB` dejaban el
 * tablero con la cifra vieja hasta 2 minutos.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  txSale: { create: vi.fn(), deleteMany: vi.fn() },
  txProduct: { findMany: vi.fn() },
}));

vi.mock("next/cache", () => ({ revalidateTag: H.revalidateTag, cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/cache", () => ({ invalidate: vi.fn(), invalidateByPrefix: vi.fn(), getOrSet: (_k: string, _t: number, fn: () => unknown) => fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/prisma-rls", () => ({
  withRlsTx: (_t: string, fn: (tx: unknown) => unknown) => fn({ sale: H.txSale, product: H.txProduct }),
}));

import { invalidateAdminCache } from "@/lib/admin-cache";
import { SalesDB } from "@/lib/db/sales.db";

const tags = () => H.revalidateTag.mock.calls.map((c) => c[0]);

beforeEach(() => {
  vi.clearAllMocks();
  H.txProduct.findMany.mockResolvedValue([{ id: 1 }]);
  H.txSale.create.mockResolvedValue({ id: "s1", items: [], total: 10, payment: "efectivo", amountPaid: 10, change: 0, createdAt: new Date(), tenantId: "t1" });
  H.txSale.deleteMany.mockResolvedValue({ count: 1 });
});

describe("el Tablero de Ventas se purga tras escribir Order/Sale", () => {
  it("invalidateAdminCache.afterOrder (POST/PATCH/DELETE de /api/orders) purga el tag del tenant", () => {
    invalidateAdminCache.afterOrder("t1");
    expect(tags()).toEqual(["ventas-overview-t1"]);
  });

  it("SalesDB.add purga el tag del tenant", async () => {
    await SalesDB.add("t1", { id: "s1", items: [{ productId: 1, name: "x", price: 10, quantity: 1, unit: "und" }], total: 10, payment: "efectivo", amountPaid: 10, change: 0, createdAt: new Date().toISOString() } as never);
    expect(tags()).toEqual(["ventas-overview-t1"]);
  });

  it("SalesDB.delete purga el tag del tenant", async () => {
    await SalesDB.delete("t1", "s1");
    expect(tags()).toEqual(["ventas-overview-t1"]);
  });

  it("no toca el tag de otro tenant", () => {
    invalidateAdminCache.afterOrder("t1");
    expect(tags()).not.toContain("ventas-overview-t2");
  });
});
