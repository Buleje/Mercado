/**
 * Tests for /api/cron/reminders
 *
 * Validates:
 * - Bearer token authorization (CRON_SECRET)
 * - Prisma updateMany is called with correct params
 * - Response shape and status codes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    reminder: {
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import { GET } from "../app/api/cron/reminders/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(authHeader?: string) {
  return new NextRequest("https://localhost/api/cron/reminders", {
    method: "GET",
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/cron/reminders", () => {
  const CRON_SECRET = "test-cron-secret-42";

  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    vi.mocked(prisma.reminder.updateMany).mockResolvedValue({ count: 3 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("returns 401 when no authorization header", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when bearer token does not match CRON_SECRET", async () => {
    const res = await GET(makeRequest("Bearer wrong-token"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(401);
  });

  it("calls updateMany with correct where clause on valid request", async () => {
    const before = new Date();
    await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const after = new Date();

    expect(prisma.reminder.updateMany).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.reminder.updateMany).mock.calls[0][0];
    expect(call?.where?.status).toBe("pendiente");
    expect(call?.data).toEqual({ status: "vencido" });
    // dueDate.lt should be a Date between before and after
    const lt = (call?.where as { dueDate?: { lt?: Date } })?.dueDate?.lt;
    expect(lt).toBeInstanceOf(Date);
    expect((lt as Date).getTime()).toBeGreaterThanOrEqual(before.getTime() - 100);
    expect((lt as Date).getTime()).toBeLessThanOrEqual(after.getTime() + 100);
  });

  it("returns ok:true with markedVencido count and processedAt on success", async () => {
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.markedVencido).toBe(3);
    expect(typeof body.processedAt).toBe("string");
    expect(() => new Date(body.processedAt)).not.toThrow();
  });

  it("returns markedVencido:0 when no reminders are overdue", async () => {
    vi.mocked(prisma.reminder.updateMany).mockResolvedValue({ count: 0 });
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.markedVencido).toBe(0);
  });
});
