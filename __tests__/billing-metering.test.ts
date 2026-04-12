/**
 * Unit tests for lib/billing/metering.ts
 * Covers: valid record, invalid amount, idempotency no-op, aggregation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { mockCreate, mockFindFirst, mockFindMany } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindFirst: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    activityLog: {
      create: mockCreate,
      findFirst: mockFindFirst,
      findMany: mockFindMany,
    },
  },
}));

import {
  recordUsageEvent,
  getMeteredUsage,
  currentBillingMonth,
} from "@/lib/billing/metering";

beforeEach(() => {
  mockCreate.mockReset().mockResolvedValue({ id: "log_1" });
  mockFindFirst.mockReset().mockResolvedValue(null);
  mockFindMany.mockReset().mockResolvedValue([]);
});

describe("recordUsageEvent", () => {
  it("records a valid event with metadata", async () => {
    const ok = await recordUsageEvent({
      tenantId: "main",
      event: "order.created",
      amount: 1,
      metadata: { orderId: "ord_42" },
    });
    expect(ok).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const arg = mockCreate.mock.calls[0][0];
    expect(arg.data.tenantId).toBe("main");
    expect(arg.data.entity).toBe("usage.meter");
    expect(arg.data.action).toBe("order.created");
    const detail = JSON.parse(arg.data.detail);
    expect(detail.amount).toBe(1);
    expect(detail.metadata.orderId).toBe("ord_42");
  });

  it("rejects zero or negative amounts", async () => {
    const a = await recordUsageEvent({ tenantId: "main", event: "ai.call", amount: 0 });
    const b = await recordUsageEvent({ tenantId: "main", event: "ai.call", amount: -3 });
    expect(a).toBe(false);
    expect(b).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects amount over the MAX_AMOUNT cap", async () => {
    const ok = await recordUsageEvent({
      tenantId: "main",
      event: "storage.blob",
      amount: 20_000,
    });
    expect(ok).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("is a no-op when idempotencyKey matches a recent row", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: "existing" });
    const ok = await recordUsageEvent({
      tenantId: "main",
      event: "whatsapp.sent",
      amount: 1,
      idempotencyKey: "msg_123",
    });
    expect(ok).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses to record when tenantId is empty", async () => {
    const ok = await recordUsageEvent({ tenantId: "", event: "ai.call", amount: 1 });
    expect(ok).toBe(false);
  });
});

describe("getMeteredUsage", () => {
  it("aggregates amounts by event type", async () => {
    mockFindMany.mockResolvedValueOnce([
      { action: "ai.call", detail: JSON.stringify({ amount: 2 }) },
      { action: "ai.call", detail: JSON.stringify({ amount: 5 }) },
      { action: "order.created", detail: JSON.stringify({ amount: 1 }) },
      { action: "bogus.event", detail: JSON.stringify({ amount: 99 }) },
      { action: "whatsapp.sent", detail: "not json" },
    ]);
    const usage = await getMeteredUsage("main", currentBillingMonth());
    expect(usage["ai.call"]).toBe(7);
    expect(usage["order.created"]).toBe(1);
    expect(usage["whatsapp.sent"]).toBe(0);
    expect(usage).not.toHaveProperty("bogus.event");
  });

  it("returns zeros when tenantId is empty", async () => {
    const usage = await getMeteredUsage("", currentBillingMonth());
    expect(usage["ai.call"]).toBe(0);
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});

describe("currentBillingMonth", () => {
  it("returns the first day of the month as from and first of next as to", () => {
    const now = new Date(Date.UTC(2026, 3, 15)); // 2026-04-15
    const { from, to } = currentBillingMonth(now);
    expect(from.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });
});
