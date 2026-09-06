import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/coupons.db", () => ({
  CouponsDB: { create: vi.fn() },
}));

import {
  issueJuntaCoupon,
  JUNTA_COUPON_PERCENT,
  JUNTA_COUPON_DAYS,
} from "@/lib/junta/reward";
import { CouponsDB } from "@/lib/db/coupons.db";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(CouponsDB.create).mockResolvedValue({ id: "c1" } as never);
});

describe("issueJuntaCoupon", () => {
  it("crea un cupón percent con el código de la junta y maxUses = meta", async () => {
    const now = new Date("2026-06-18T00:00:00Z");
    const code = await issueJuntaCoupon("t1", { code: "BARRIO-AB12", targetMembers: 4 }, now);
    expect(code).toBe("BARRIO-AB12");
    const [tenantId, data] = vi.mocked(CouponsDB.create).mock.calls[0];
    expect(tenantId).toBe("t1");
    expect(data.code).toBe("BARRIO-AB12");
    expect(data.discountType).toBe("percent");
    expect(data.discountValue).toBe(JUNTA_COUPON_PERCENT);
    expect(data.maxUses).toBe(4);
  });

  it("la expiración es +JUNTA_COUPON_DAYS desde now", async () => {
    const now = new Date("2026-06-18T00:00:00Z");
    await issueJuntaCoupon("t1", { code: "BARRIO-AB12", targetMembers: 4 }, now);
    const data = vi.mocked(CouponsDB.create).mock.calls[0][1];
    const expected = new Date(now.getTime() + JUNTA_COUPON_DAYS * 24 * 3600 * 1000);
    expect((data.expiresAt as Date).toISOString()).toBe(expected.toISOString());
  });
});
