/**
 * Tests for /api/cron/reorder-reminders
 *
 * Validates:
 * - Bearer token authorization (CRON_SECRET)
 * - Customer purchase pattern analysis
 * - Push notification fire-and-forget
 * - Response shape
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  },
}));

vi.mock("server-only", () => ({}));

const mockSendPushToPhone = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/push-sender", () => ({
  sendPushToPhone: (...args: unknown[]) => mockSendPushToPhone(...args),
}));

import { GET } from "../app/api/cron/reorder-reminders/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(authHeader?: string) {
  return new NextRequest("https://localhost/api/cron/reorder-reminders", {
    method: "GET",
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/cron/reorder-reminders", () => {
  const CRON_SECRET = "test-cron-secret-42";

  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    mockFindMany.mockReset();
    mockSendPushToPhone.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects requests without authorization", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("rejects wrong CRON_SECRET", async () => {
    const res = await GET(makeRequest("Bearer wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns ok with 0 reminders when no orders exist", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.reminders).toBe(0);
  });

  it("returns ok with 0 reminders when customer has only 1 order", async () => {
    mockFindMany.mockResolvedValue([
      {
        customerPhone: "999111222",
        customerName: "Juan",
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        items: [{ productId: 1, name: "Arroz" }],
      },
    ]);
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.reminders).toBe(0);
    expect(data.analyzed).toBe(1);
  });

  it("detects reorder pattern and counts correctly", async () => {
    // Customer bought arroz 3 times, 10 days apart, last purchase 15 days ago (overdue)
    const now = Date.now();
    mockFindMany.mockResolvedValue([
      {
        customerPhone: "999222333",
        customerName: "Maria",
        createdAt: new Date(now - 35 * 24 * 60 * 60 * 1000),
        items: [{ productId: 1, name: "Arroz" }],
      },
      {
        customerPhone: "999222333",
        customerName: "Maria",
        createdAt: new Date(now - 25 * 24 * 60 * 60 * 1000),
        items: [{ productId: 1, name: "Arroz" }],
      },
      {
        customerPhone: "999222333",
        customerName: "Maria",
        createdAt: new Date(now - 15 * 24 * 60 * 60 * 1000),
        items: [{ productId: 1, name: "Arroz" }],
      },
    ]);

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.analyzed).toBe(1);
    // Reminder should be sent: avg interval ~10 days, last purchase 15 days ago
    expect(data.reminders).toBe(1);
  });

  it("does not send reminder if last purchase was recent (< 3 days)", async () => {
    const now = Date.now();
    mockFindMany.mockResolvedValue([
      {
        customerPhone: "999333444",
        customerName: "Carlos",
        createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
        items: [{ productId: 1, name: "Leche" }],
      },
      {
        customerPhone: "999333444",
        customerName: "Carlos",
        createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
        items: [{ productId: 1, name: "Leche" }],
      },
    ]);

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.reminders).toBe(0);
  });
});
