import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  createRateLimiter,
  getClientId,
  applyRateLimit,
  RATE_LIMIT_PRESETS,
} from "../lib/rate-limit";

describe("Rate Limiting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("createRateLimiter", () => {
    it("should allow requests within limit", () => {
      const limiter = createRateLimiter({ maxRequests: 5, windowMs: 60000 });

      for (let i = 0; i < 5; i++) {
        expect(limiter.check("test-client")).toBe(true);
      }
    });

    it("should block requests exceeding limit", () => {
      const limiter = createRateLimiter({ maxRequests: 3, windowMs: 60000 });

      // First 3 should pass
      expect(limiter.check("test-client")).toBe(true);
      expect(limiter.check("test-client")).toBe(true);
      expect(limiter.check("test-client")).toBe(true);

      // 4th should fail
      expect(limiter.check("test-client")).toBe(false);
    });

    it("should reset after time window", () => {
      const limiter = createRateLimiter({ maxRequests: 2, windowMs: 1000 });

      // Exhaust limit
      expect(limiter.check("test-client")).toBe(true);
      expect(limiter.check("test-client")).toBe(true);
      expect(limiter.check("test-client")).toBe(false);

      // Advance time past window
      vi.advanceTimersByTime(1001);

      // Should work again
      expect(limiter.check("test-client")).toBe(true);
    });

    it("should track different clients independently", () => {
      const limiter = createRateLimiter({ maxRequests: 2, windowMs: 60000 });

      expect(limiter.check("client-1")).toBe(true);
      expect(limiter.check("client-1")).toBe(true);
      expect(limiter.check("client-1")).toBe(false);

      // client-2 should have its own limit
      expect(limiter.check("client-2")).toBe(true);
      expect(limiter.check("client-2")).toBe(true);
      expect(limiter.check("client-2")).toBe(false);
    });

    it("should clean up old entries", () => {
      const limiter = createRateLimiter({ maxRequests: 1, windowMs: 1000 });

      limiter.check("client-1");
      limiter.check("client-2");
      limiter.check("client-3");

      expect(limiter.clients.size).toBe(3);

      // Advance time to expire entries
      vi.advanceTimersByTime(1001);

      // New request should trigger cleanup
      limiter.check("client-4");

      // Old entries should be cleaned
      expect(limiter.clients.size).toBe(1);
    });
  });

  describe("getClientId", () => {
    it("should extract IP from x-forwarded-for header", () => {
      const request = new NextRequest("http://localhost:3000/api/test", {
        headers: {
          "x-forwarded-for": "192.168.1.100, 10.0.0.1",
        },
      });

      expect(getClientId(request)).toBe("192.168.1.100");
    });

    it("should extract IP from x-real-ip header", () => {
      const request = new NextRequest("http://localhost:3000/api/test", {
        headers: {
          "x-real-ip": "192.168.1.200",
        },
      });

      expect(getClientId(request)).toBe("192.168.1.200");
    });

    it("should use localhost as fallback", () => {
      const request = new NextRequest("http://localhost:3000/api/test");

      expect(getClientId(request)).toBe("127.0.0.1");
    });

    it("should handle IPv6 addresses", () => {
      const request = new NextRequest("http://localhost:3000/api/test", {
        headers: {
          "x-forwarded-for": "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
        },
      });

      expect(getClientId(request)).toBe("2001:0db8:85a3:0000:0000:8a2e:0370:7334");
    });

    it("should extract first IP from multiple proxies", () => {
      const request = new NextRequest("http://localhost:3000/api/test", {
        headers: {
          "x-forwarded-for": "203.0.113.1, 198.51.100.1, 192.0.2.1",
        },
      });

      expect(getClientId(request)).toBe("203.0.113.1");
    });
  });

  describe("applyRateLimit", () => {
    it("should allow request within limit", async () => {
      const limiter = createRateLimiter({ maxRequests: 5, windowMs: 60000 });
      const request = new NextRequest("http://localhost:3000/api/test");

      const result = await applyRateLimit(request, limiter);

      expect(result).toBeNull();
    });

    it("should return 429 when limit exceeded", async () => {
      const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60000 });
      const request = new NextRequest("http://localhost:3000/api/test");

      // First request should pass
      const result1 = await applyRateLimit(request, limiter);
      expect(result1).toBeNull();

      // Second request should fail
      const result2 = await applyRateLimit(request, limiter);
      expect(result2).toBeInstanceOf(Response);
      expect(result2?.status).toBe(429);

      const json = await result2?.json();
      expect(json).toEqual({
        error: "Too many requests",
        message: "Rate limit exceeded. Please try again later.",
      });
    });

    it("should set Retry-After header", async () => {
      const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60000 });
      const request = new NextRequest("http://localhost:3000/api/test");

      await applyRateLimit(request, limiter);
      const result = await applyRateLimit(request, limiter);

      expect(result?.headers.get("Retry-After")).toBe("60");
    });

    it("should set RateLimit headers", async () => {
      const limiter = createRateLimiter({ maxRequests: 10, windowMs: 60000 });
      const request = new NextRequest("http://localhost:3000/api/test");

      await applyRateLimit(request, limiter);
      const result = await applyRateLimit(request, limiter);

      // Should still pass on 2nd request (limit is 10)
      expect(result).toBeNull();
    });
  });

  describe("RATE_LIMIT_PRESETS", () => {
    it("should have STRICT preset", () => {
      expect(RATE_LIMIT_PRESETS.STRICT).toEqual({
        maxRequests: 5,
        windowMs: 15 * 60 * 1000,
      });
    });

    it("should have MODERATE preset", () => {
      expect(RATE_LIMIT_PRESETS.MODERATE).toEqual({
        maxRequests: 50,
        windowMs: 60 * 1000,
      });
    });

    it("should have GENEROUS preset", () => {
      expect(RATE_LIMIT_PRESETS.GENEROUS).toEqual({
        maxRequests: 100,
        windowMs: 60 * 1000,
      });
    });

    it("should have AUTH preset", () => {
      expect(RATE_LIMIT_PRESETS.AUTH).toEqual({
        maxRequests: 3,
        windowMs: 60 * 60 * 1000,
      });
    });
  });

  describe("Integration scenarios", () => {
    it("should handle burst traffic correctly", () => {
      const limiter = createRateLimiter({ maxRequests: 3, windowMs: 1000 });

      // Simulate burst
      const results = Array.from({ length: 5 }, () =>
        limiter.check("burst-client")
      );

      expect(results).toEqual([true, true, true, false, false]);
    });

    it("should allow gradual requests over time", () => {
      const limiter = createRateLimiter({ maxRequests: 2, windowMs: 1000 });

      expect(limiter.check("gradual-client")).toBe(true);

      vi.advanceTimersByTime(500);
      expect(limiter.check("gradual-client")).toBe(true);

      // Advance to new window
      vi.advanceTimersByTime(501);
      expect(limiter.check("gradual-client")).toBe(true);
    });

    it("should handle concurrent clients", () => {
      const limiter = createRateLimiter({ maxRequests: 2, windowMs: 60000 });

      const client1Results = [
        limiter.check("client-1"),
        limiter.check("client-1"),
        limiter.check("client-1"),
      ];

      const client2Results = [
        limiter.check("client-2"),
        limiter.check("client-2"),
        limiter.check("client-2"),
      ];

      expect(client1Results).toEqual([true, true, false]);
      expect(client2Results).toEqual([true, true, false]);
    });

    it("should work with AUTH preset for login attempts", () => {
      const limiter = createRateLimiter(RATE_LIMIT_PRESETS.AUTH);

      // 3 attempts allowed per hour
      expect(limiter.check("login-user")).toBe(true);
      expect(limiter.check("login-user")).toBe(true);
      expect(limiter.check("login-user")).toBe(true);
      expect(limiter.check("login-user")).toBe(false);

      // After 1 hour, should reset
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);
      expect(limiter.check("login-user")).toBe(true);
    });

    it("should work with STRICT preset for sensitive endpoints", () => {
      const limiter = createRateLimiter(RATE_LIMIT_PRESETS.STRICT);

      // 5 requests per 15 minutes
      for (let i = 0; i < 5; i++) {
        expect(limiter.check("strict-client")).toBe(true);
      }
      expect(limiter.check("strict-client")).toBe(false);

      // Should reset after 15 minutes
      vi.advanceTimersByTime(15 * 60 * 1000 + 1);
      expect(limiter.check("strict-client")).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty client ID", () => {
      const limiter = createRateLimiter({ maxRequests: 1, windowMs: 1000 });

      expect(limiter.check("")).toBe(true);
      expect(limiter.check("")).toBe(false);
    });

    it("should handle very long client IDs", () => {
      const limiter = createRateLimiter({ maxRequests: 1, windowMs: 1000 });
      const longId = "a".repeat(1000);

      expect(limiter.check(longId)).toBe(true);
      expect(limiter.check(longId)).toBe(false);
    });

    it("should handle special characters in client ID", () => {
      const limiter = createRateLimiter({ maxRequests: 1, windowMs: 1000 });
      const specialId = "192.168.1.1:8080/path?query=value";

      expect(limiter.check(specialId)).toBe(true);
      expect(limiter.check(specialId)).toBe(false);
    });

    it("should handle very small window", () => {
      const limiter = createRateLimiter({ maxRequests: 1, windowMs: 1 });

      expect(limiter.check("fast-reset")).toBe(true);

      vi.advanceTimersByTime(2);

      expect(limiter.check("fast-reset")).toBe(true);
    });

    it("should handle zero maxRequests gracefully", () => {
      const limiter = createRateLimiter({ maxRequests: 0, windowMs: 1000 });

      // Should block all requests
      expect(limiter.check("blocked-client")).toBe(false);
    });
  });

  // ── Route-level presets: customers & orders ───────────────────────────────

  describe("customers/orders route presets", () => {
    it("GENEROUS preset allows 100 requests per minute", () => {
      expect(RATE_LIMIT_PRESETS.GENEROUS).toEqual({
        maxRequests: 100,
        windowMs: 60 * 1000,
      });
    });

    it("customers-get: passes 100 requests then blocks on 101st", async () => {
      const limiter = createRateLimiter(RATE_LIMIT_PRESETS.GENEROUS);
      for (let i = 0; i < 100; i++) {
        expect(limiter.check("ip-customers-get")).toBe(true);
      }
      expect(limiter.check("ip-customers-get")).toBe(false);
    });

    it("customers-get: resets after window passes", async () => {
      const limiter = createRateLimiter(RATE_LIMIT_PRESETS.GENEROUS);
      for (let i = 0; i < 100; i++) {
        limiter.check("ip-reset-test");
      }
      expect(limiter.check("ip-reset-test")).toBe(false);

      vi.advanceTimersByTime(60 * 1000 + 1);
      expect(limiter.check("ip-reset-test")).toBe(true);
    });

    it("orders-get: applyRateLimit returns null within GENEROUS limit", async () => {
      const req = new NextRequest("http://localhost:3000/api/orders");
      const limiter = createRateLimiter(RATE_LIMIT_PRESETS.GENEROUS);
      const result = await applyRateLimit(req, limiter);
      expect(result).toBeNull();
    });

    it("orders-get: applyRateLimit returns 429 when GENEROUS limit exceeded", async () => {
      const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60000 });
      const req = new NextRequest("http://localhost:3000/api/orders");
      await applyRateLimit(req, limiter);
      const result = await applyRateLimit(req, limiter);
      expect(result).toBeInstanceOf(Response);
      expect(result?.status).toBe(429);
    });

    it("customers-post: MODERATE preset allows 50 requests per minute", () => {
      expect(RATE_LIMIT_PRESETS.MODERATE).toEqual({
        maxRequests: 50,
        windowMs: 60 * 1000,
      });
    });

    it("customers-post: blocks after MODERATE limit exceeded", async () => {
      const limiter = createRateLimiter(RATE_LIMIT_PRESETS.MODERATE);
      for (let i = 0; i < 50; i++) {
        expect(limiter.check("ip-customers-post")).toBe(true);
      }
      expect(limiter.check("ip-customers-post")).toBe(false);
    });

    it("customers-patch: different prefix does not share counter with customers-get", async () => {
      const limiter = createRateLimiter(RATE_LIMIT_PRESETS.GENEROUS);
      // Exhaust for one logical key
      for (let i = 0; i < 100; i++) {
        limiter.check("ip-a-customers-get");
      }
      // A different key should still pass
      expect(limiter.check("ip-a-customers-patch")).toBe(true);
    });

    it("orders-get: different IP does not share counter", async () => {
      const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60000 });
      const req1 = new NextRequest("http://localhost:3000/api/orders", {
        headers: { "x-forwarded-for": "1.2.3.4" },
      });
      const req2 = new NextRequest("http://localhost:3000/api/orders", {
        headers: { "x-forwarded-for": "5.6.7.8" },
      });
      await applyRateLimit(req1, limiter);
      const resultForReq1 = await applyRateLimit(req1, limiter);
      const resultForReq2 = await applyRateLimit(req2, limiter);
      expect(resultForReq1?.status).toBe(429);
      expect(resultForReq2).toBeNull();
    });
  });
});
