import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only before the module is imported
vi.mock("server-only", () => ({}));

// Mock the logger to suppress output and allow assertions
vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Declare mock functions using vi.hoisted so they are available when the
// factory runs (vi.mock factories are hoisted to the top of the file by
// Vitest's transform, before const declarations are executed).
const { mockUpsert, mockUpdate, mockFindMany } = vi.hoisted(() => ({
  mockUpsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockFindMany: vi.fn(),
}));

// Mock Prisma client
vi.mock("@/lib/prisma", () => ({
  prisma: {
    stripeWebhookQueue: {
      upsert: mockUpsert,
      update: mockUpdate,
      findMany: mockFindMany,
    },
  },
}));

import {
  enqueueWebhookEvent,
  markWebhookProcessed,
  getPendingWebhookEvents,
  recordReplayFailure,
} from "@/lib/stripe-webhook-queue";
import { logger } from "@/lib/logger";
import type Stripe from "stripe";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<Stripe.Event> = {}): Stripe.Event {
  return {
    id: "evt_test_123",
    type: "payment_intent.succeeded",
    object: "event",
    api_version: "2023-10-16",
    created: 1_700_000_000,
    data: { object: {} as Stripe.PaymentIntent },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    ...overrides,
  } as unknown as Stripe.Event;
}

// ---------------------------------------------------------------------------
// enqueueWebhookEvent
// ---------------------------------------------------------------------------

describe("enqueueWebhookEvent", () => {
  beforeEach(() => {
    mockUpsert.mockReset();
    vi.mocked(logger.warn).mockReset();
    vi.mocked(logger.error).mockReset();
  });

  it("returns true and calls prisma.upsert on success", async () => {
    mockUpsert.mockResolvedValue({});
    const event = makeEvent();
    const result = await enqueueWebhookEvent(event, "DB timeout");

    expect(result).toBe(true);
    expect(mockUpsert).toHaveBeenCalledOnce();
    const call = mockUpsert.mock.calls[0][0];
    expect(call.where).toEqual({ stripeId: "evt_test_123" });
    expect(call.create.stripeId).toBe("evt_test_123");
    expect(call.create.eventType).toBe("payment_intent.succeeded");
    expect(call.create.lastError).toBe("DB timeout");
    expect(call.create.attempts).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(
      "[webhook-queue] Event queued for retry",
      expect.objectContaining({ stripeId: "evt_test_123" })
    );
  });

  it("returns false and logs error when prisma.upsert throws", async () => {
    mockUpsert.mockRejectedValue(new Error("Connection refused"));
    const event = makeEvent();
    const result = await enqueueWebhookEvent(event, "error");

    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      "[webhook-queue] Failed to queue event — event may be lost",
      expect.objectContaining({ stripeId: "evt_test_123", err: "Connection refused" })
    );
  });

  it("handles non-Error rejections gracefully", async () => {
    mockUpsert.mockRejectedValue("string error");
    const result = await enqueueWebhookEvent(makeEvent(), "e");

    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      "[webhook-queue] Failed to queue event — event may be lost",
      expect.objectContaining({ err: "string error" })
    );
  });

  it("sets nextRetryAt at least 60 s into the future on first attempt", async () => {
    const before = Date.now() + 59_000;
    mockUpsert.mockResolvedValue({});
    await enqueueWebhookEvent(makeEvent(), "e");

    const nextRetryAt: Date = mockUpsert.mock.calls[0][0].create.nextRetryAt;
    expect(nextRetryAt.getTime()).toBeGreaterThan(before);
  });
});

// ---------------------------------------------------------------------------
// markWebhookProcessed
// ---------------------------------------------------------------------------

describe("markWebhookProcessed", () => {
  beforeEach(() => mockUpdate.mockReset());

  it("calls prisma.update with processedAt = now", async () => {
    mockUpdate.mockResolvedValue({});
    const before = new Date();
    await markWebhookProcessed("evt_abc");

    expect(mockUpdate).toHaveBeenCalledOnce();
    const call = mockUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ stripeId: "evt_abc" });
    const processedAt: Date = call.data.processedAt;
    expect(processedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});

// ---------------------------------------------------------------------------
// getPendingWebhookEvents
// ---------------------------------------------------------------------------

describe("getPendingWebhookEvents", () => {
  beforeEach(() => mockFindMany.mockReset());

  it("queries for unprocessed events due for retry with attempts < 6", async () => {
    mockFindMany.mockResolvedValue([]);
    await getPendingWebhookEvents(5);

    expect(mockFindMany).toHaveBeenCalledOnce();
    const call = mockFindMany.mock.calls[0][0];
    expect(call.where.processedAt).toBeNull();
    expect(call.where.attempts).toEqual({ lt: 6 });
    expect(call.take).toBe(5);
    expect(call.orderBy).toEqual({ nextRetryAt: "asc" });
  });

  it("uses default limit of 10 when no argument is provided", async () => {
    mockFindMany.mockResolvedValue([]);
    await getPendingWebhookEvents();

    expect(mockFindMany.mock.calls[0][0].take).toBe(10);
  });

  it("returns the rows returned by Prisma", async () => {
    const rows = [{ id: "1", stripeId: "evt_1" }, { id: "2", stripeId: "evt_2" }];
    mockFindMany.mockResolvedValue(rows);
    const result = await getPendingWebhookEvents();

    expect(result).toBe(rows);
  });
});

// ---------------------------------------------------------------------------
// recordReplayFailure
// ---------------------------------------------------------------------------

describe("recordReplayFailure", () => {
  beforeEach(() => mockUpdate.mockReset());

  it("increments attempts, sets lastError, and advances nextRetryAt", async () => {
    mockUpdate.mockResolvedValue({});
    const before = Date.now();
    await recordReplayFailure("row_id_1", 2, "timeout on retry");

    expect(mockUpdate).toHaveBeenCalledOnce();
    const call = mockUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ id: "row_id_1" });
    expect(call.data.attempts).toEqual({ increment: 1 });
    expect(call.data.lastError).toBe("timeout on retry");
    // nextRetryAt should be in the future (backoff for attempt index 3 → 15 min)
    const nextRetryAt: Date = call.data.nextRetryAt;
    expect(nextRetryAt.getTime()).toBeGreaterThan(before + 60_000); // at least 1 min ahead
  });

  it("uses the last backoff tier when attempts exceed the backoff array length", async () => {
    mockUpdate.mockResolvedValue({});
    const before = Date.now();
    await recordReplayFailure("row_id_2", 99, "extreme retry");

    const nextRetryAt: Date = mockUpdate.mock.calls[0][0].data.nextRetryAt;
    // Last tier is 6 h = 21_600_000 ms — just verify it's far in the future
    expect(nextRetryAt.getTime()).toBeGreaterThan(before + 3_600_000); // > 1 h
  });
});
