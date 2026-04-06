/**
 * Queue system unit tests — connection.ts + queues.ts
 *
 * Covers:
 *   connection.ts: getQueueConnection() with/without REDIS_URL, URL parsing, isQueueEnabled()
 *   queues.ts:     enqueue functions return null when Redis is not configured
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock: logger — swallow all log output ──────────────────────────────────
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─────────────────────────────────────────────────────────────────────────────
// connection.ts tests
// ─────────────────────────────────────────────────────────────────────────────

describe("lib/queue/connection.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the module cache so the singleton `_connection` is cleared between tests
    vi.resetModules();
    delete process.env.REDIS_URL;
  });

  describe("getQueueConnection()", () => {
    it("returns null when REDIS_URL is not set", async () => {
      delete process.env.REDIS_URL;
      const { getQueueConnection } = await import("@/lib/queue/connection");
      const result = getQueueConnection();
      expect(result).toBeNull();
    });

    it("parses a valid Redis URL correctly (host, port, password)", async () => {
      process.env.REDIS_URL = "redis://:mysecret@redis.example.com:6380/0";
      const { getQueueConnection } = await import("@/lib/queue/connection");
      const conn = getQueueConnection();

      expect(conn).not.toBeNull();
      expect(conn!.host).toBe("redis.example.com");
      expect(conn!.port).toBe(6380);
      expect(conn!.password).toBe("mysecret");
      expect(conn!.maxRetriesPerRequest).toBeNull();
    });

    it("uses default port 6379 when port is not specified in URL", async () => {
      process.env.REDIS_URL = "redis://redis.example.com";
      const { getQueueConnection } = await import("@/lib/queue/connection");
      const conn = getQueueConnection();

      expect(conn).not.toBeNull();
      expect(conn!.port).toBe(6379);
    });

    it("sets password to undefined when no password in URL", async () => {
      process.env.REDIS_URL = "redis://redis.example.com:6379";
      const { getQueueConnection } = await import("@/lib/queue/connection");
      const conn = getQueueConnection();

      expect(conn).not.toBeNull();
      expect(conn!.password).toBeUndefined();
    });

    it("returns null for an invalid URL", async () => {
      process.env.REDIS_URL = "not-a-valid-url";
      const { getQueueConnection } = await import("@/lib/queue/connection");
      const result = getQueueConnection();
      expect(result).toBeNull();
    });

    it("caches the connection on subsequent calls", async () => {
      process.env.REDIS_URL = "redis://redis.example.com:6379";
      const { getQueueConnection } = await import("@/lib/queue/connection");

      const first = getQueueConnection();
      const second = getQueueConnection();
      expect(first).toBe(second); // same reference
    });
  });

  describe("isQueueEnabled()", () => {
    it("returns false when REDIS_URL is not set", async () => {
      delete process.env.REDIS_URL;
      const { isQueueEnabled } = await import("@/lib/queue/connection");
      expect(isQueueEnabled()).toBe(false);
    });

    it("returns true when REDIS_URL is set", async () => {
      process.env.REDIS_URL = "redis://localhost:6379";
      const { isQueueEnabled } = await import("@/lib/queue/connection");
      expect(isQueueEnabled()).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// queues.ts tests — enqueue functions without Redis
// ─────────────────────────────────────────────────────────────────────────────

describe("lib/queue/queues.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.REDIS_URL;
  });

  describe("enqueueEmail()", () => {
    it("returns null when Redis is not configured", async () => {
      const { enqueueEmail } = await import("@/lib/queue/queues");
      const result = await enqueueEmail({
        to: "test@example.com",
        subject: "Test",
        html: "<p>Hello</p>",
        tenantId: "main",
      });
      expect(result).toBeNull();
    });
  });

  describe("enqueueNotification()", () => {
    it("returns null when Redis is not configured", async () => {
      const { enqueueNotification } = await import("@/lib/queue/queues");
      const result = await enqueueNotification({
        type: "email",
        recipient: "test@example.com",
        message: "Hello",
        tenantId: "main",
      });
      expect(result).toBeNull();
    });
  });

  describe("enqueueActivityLog()", () => {
    it("returns null when Redis is not configured", async () => {
      const { enqueueActivityLog } = await import("@/lib/queue/queues");
      const result = await enqueueActivityLog({
        action: "create",
        resource: "product",
        resourceId: "prod-1",
        userId: "user-1",
        tenantId: "main",
        timestamp: new Date().toISOString(),
      });
      expect(result).toBeNull();
    });
  });

  describe("enqueuePdf()", () => {
    it("returns null when Redis is not configured", async () => {
      const { enqueuePdf } = await import("@/lib/queue/queues");
      const result = await enqueuePdf({
        type: "invoice",
        data: { orderId: "order-1" },
        tenantId: "main",
      });
      expect(result).toBeNull();
    });
  });

  describe("enqueueStockSync()", () => {
    it("returns null when Redis is not configured", async () => {
      const { enqueueStockSync } = await import("@/lib/queue/queues");
      const result = await enqueueStockSync({
        productId: "prod-1",
        tenantId: "main",
        operation: "increment",
        quantity: 5,
        reason: "restock",
      });
      expect(result).toBeNull();
    });
  });

  describe("QUEUE_NAMES constants", () => {
    it("exports expected queue name constants", async () => {
      const { QUEUE_NAMES } = await import("@/lib/queue/queues");
      expect(QUEUE_NAMES.EMAIL).toBe("email");
      expect(QUEUE_NAMES.PDF).toBe("pdf-generation");
      expect(QUEUE_NAMES.NOTIFICATION).toBe("notification");
      expect(QUEUE_NAMES.ACTIVITY_LOG).toBe("activity-log");
      expect(QUEUE_NAMES.STOCK_SYNC).toBe("stock-sync");
    });
  });

  describe("Job data types", () => {
    it("EmailJobData accepts all optional fields", async () => {
      const { enqueueEmail } = await import("@/lib/queue/queues");
      const data = {
        to: "user@test.com",
        subject: "Welcome",
        html: "<h1>Hi</h1>",
        tenantId: "main",
        from: "noreply@test.com",
        replyTo: "support@test.com",
      };
      const result = await enqueueEmail(data);
      expect(result).toBeNull();
    });

    it("NotificationJobData supports all notification types", async () => {
      const { enqueueNotification } = await import("@/lib/queue/queues");
      for (const type of ["whatsapp", "push", "email", "sms"] as const) {
        const result = await enqueueNotification({
          type,
          recipient: "test@example.com",
          message: "Test message",
          tenantId: "main",
        });
        expect(result).toBeNull();
      }
    });

    it("ActivityLogJobData includes all required and optional fields", async () => {
      const { enqueueActivityLog } = await import("@/lib/queue/queues");
      const data = {
        action: "update",
        resource: "order",
        resourceId: "ord-123",
        userId: "usr-456",
        tenantId: "main",
        details: { previousStatus: "pending", newStatus: "completed" },
        timestamp: "2026-04-05T12:00:00.000Z",
      };
      const result = await enqueueActivityLog(data);
      expect(result).toBeNull();
    });
  });
});
