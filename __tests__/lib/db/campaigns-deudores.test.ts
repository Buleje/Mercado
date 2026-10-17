import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const deudaDeFiados = vi.fn();
const count = vi.fn();
const findMany = vi.fn();
vi.mock("@/lib/db/customers.db", () => ({ CustomersDB: { deudaDeFiados: (...a: unknown[]) => deudaDeFiados(...a) } }));
vi.mock("@/lib/prisma", () => ({ prisma: { customer: { count: (...a: unknown[]) => count(...a), findMany: (...a: unknown[]) => findMany(...a) } } }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));

import { CampaignsDB } from "@/lib/db/campaigns.db";

describe("campañas › Con fiado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deudaDeFiados.mockResolvedValue(new Map([["c1", { deuda: 50, vencido: 0 }]]));
  });

  it("estima por la deuda real de fiados, con el tenant primero", async () => {
    expect(await CampaignsDB.estimateAudience("t1", "deudores")).toBe(1);
    expect(deudaDeFiados).toHaveBeenCalledWith("t1");
    expect(count).not.toHaveBeenCalled();
  });

  it("la audiencia real filtra por esos clientes y respeta el consentimiento", async () => {
    findMany.mockResolvedValue([{ id: "c1", name: "Ana", phone: "999" }]);
    const r = await CampaignsDB.resolveAudience("t1", "deudores");
    expect(r).toEqual([{ id: "c1", name: "Ana", phone: "999" }]);
    expect(findMany.mock.calls[0][0].where).toEqual({ tenantId: "t1", notifPromotions: true, id: { in: ["c1"] } });
  });
});
