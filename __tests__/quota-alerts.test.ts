/**
 * ADR-047 — Unit tests del sistema de quota alerts.
 *
 * Cubre:
 * - checkQuota: nivel null a 50%, warning a 80%, critical a 90%+
 * - checkQuota: evento bloqueado (limit=0) → critical si usage > 0
 * - checkQuota: enterprise (Infinity) → siempre null
 * - deduper: isDuplicate false en primer envío, true en segundo
 * - deduper: resetea entre días (timestamps distintos)
 * - notifyQuotaAlert: fire-and-forget, no lanza si email falla
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock SettingsDB para checkQuota
vi.mock("@/lib/db/settings.db", () => ({
  SettingsDB: {
    get: vi.fn().mockResolvedValue({
      planName: "starter",
      businessName: "Bodega Test",
      mode: "checkout",
    }),
  },
}));

// Mock Resend via hoisted to guarantee stable reference across mock factories
const { mockResendSend } = vi.hoisted(() => ({
  mockResendSend: vi.fn().mockResolvedValue({ id: "email_001" }),
}));
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockResendSend },
  })),
}));
// Mock the resend-sender wrapper which notifier imports directly
vi.mock("@/lib/billing/alerts/resend-sender", () => ({
  sendQuotaAlert: vi.fn(async () => {
    mockResendSend();
  }),
}));

// Mock WhatsApp
vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppText: vi.fn().mockResolvedValue(true),
  sendWhatsAppQueued: vi.fn(async () => ({ queued: true })),
}));

// Mock activity logger
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

import { checkQuota } from "@/lib/billing/alerts/quota-checker";
import {
  isDuplicate,
  markSent,
  _resetForTest,
} from "@/lib/billing/alerts/deduper";
import { notifyQuotaAlert } from "@/lib/billing/alerts/quota-notifier";
import { SettingsDB } from "@/lib/db/settings.db";

beforeEach(() => {
  _resetForTest();
  mockResendSend.mockReset();
  mockResendSend.mockResolvedValue({ id: "email_001" });
  // RESEND_API_KEY necesaria para que new Resend() no lance
  process.env.RESEND_API_KEY = "re_test_key";
  vi.mocked(SettingsDB.get).mockResolvedValue({
    planName: "starter",
    businessName: "Bodega Test",
    mode: "checkout" as const,
    adminBypassLogin: false,
  });
});

// ─── checkQuota ──────────────────────────────────────────────────────────────

describe("checkQuota — starter plan", () => {
  it("devuelve level null cuando el uso es < 80% del límite", async () => {
    // starter "order.created" limit = 1000, alertAt = 0.8
    const result = await checkQuota("t1", "order.created", 500); // 50%
    expect(result.level).toBeNull();
    expect(result.percentUsed).toBeCloseTo(50);
  });

  it("devuelve 'warning' cuando el uso es ≥ 80% del límite", async () => {
    const result = await checkQuota("t1", "order.created", 800); // 80%
    expect(result.level).toBe("warning");
    expect(result.percentUsed).toBeCloseTo(80);
  });

  it("devuelve 'critical' cuando el uso es ≥ 90% del límite", async () => {
    const result = await checkQuota("t1", "order.created", 950); // 95%
    expect(result.level).toBe("critical");
    expect(result.percentUsed).toBeCloseTo(95);
  });

  it("devuelve planName y businessName del tenant", async () => {
    const result = await checkQuota("t1", "order.created", 100);
    expect(result.planName).toBe("starter");
    expect(result.businessName).toBe("Bodega Test");
  });
});

describe("checkQuota — evento bloqueado en free tier (sunat.emitted, limit=0)", () => {
  beforeEach(() => {
    vi.mocked(SettingsDB.get).mockResolvedValue({
      planName: "free",
      businessName: "Bodega Free",
      mode: "checkout" as const,
      adminBypassLogin: false,
    });
  });

  it("devuelve 'critical' si usage > 0 en evento bloqueado", async () => {
    const result = await checkQuota("t_free", "sunat.emitted", 1);
    expect(result.level).toBe("critical");
    expect(result.limit).toBe(0);
  });

  it("devuelve null si usage = 0 en evento bloqueado", async () => {
    const result = await checkQuota("t_free", "sunat.emitted", 0);
    expect(result.level).toBeNull();
  });
});

describe("checkQuota — enterprise tier (Infinity)", () => {
  beforeEach(() => {
    vi.mocked(SettingsDB.get).mockResolvedValue({
      planName: "enterprise",
      businessName: "Bodega Enterprise",
      mode: "checkout" as const,
      adminBypassLogin: false,
    });
  });

  it("siempre devuelve null para enterprise (limit Infinity)", async () => {
    const result = await checkQuota("t_ent", "order.created", 99999);
    expect(result.level).toBeNull();
    // checkQuota devuelve Infinity — el dashboard lo convierte a null en la respuesta HTTP
    expect(result.limit).toBe(Infinity);
  });
});

// ─── Deduper ─────────────────────────────────────────────────────────────────

describe("Deduper", () => {
  it("primer envío: isDuplicate = false", () => {
    const result = isDuplicate("tenant1", "order.created", "warning");
    expect(result).toBe(false);
  });

  it("después de markSent: isDuplicate = true", () => {
    markSent("tenant1", "order.created", "warning");
    expect(isDuplicate("tenant1", "order.created", "warning")).toBe(true);
  });

  it("distinto nivel: no es duplicado", () => {
    markSent("tenant1", "order.created", "warning");
    expect(isDuplicate("tenant1", "order.created", "critical")).toBe(false);
  });

  it("distinto tenant: no es duplicado", () => {
    markSent("tenant1", "order.created", "warning");
    expect(isDuplicate("tenant2", "order.created", "warning")).toBe(false);
  });

  it("timestamp del día siguiente: no es duplicado", () => {
    const today = Date.now();
    markSent("tenant1", "order.created", "warning", today);
    const tomorrow = today + 25 * 60 * 60 * 1000; // +25h
    expect(isDuplicate("tenant1", "order.created", "warning", tomorrow)).toBe(false);
  });
});

// ─── notifyQuotaAlert ─────────────────────────────────────────────────────────

describe("notifyQuotaAlert", () => {
  const baseCheck = {
    level: "warning" as const,
    percentUsed: 82,
    currentUsage: 820,
    limit: 1000,
    planName: "starter",
    businessName: "Bodega Test",
  };

  it("no lanza si level es null", async () => {
    await expect(
      notifyQuotaAlert({
        tenantId: "t1",
        event: "order.created",
        checkResult: { ...baseCheck, level: null },
        adminEmail: "admin@test.pe",
      }),
    ).resolves.toBeUndefined();
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("envía email cuando level es 'warning'", async () => {
    await notifyQuotaAlert({
      tenantId: "t2",
      event: "order.created",
      checkResult: baseCheck,
      adminEmail: "admin@test.pe",
    });
    expect(mockResendSend).toHaveBeenCalledOnce();
  });

  it("suprime duplicado el mismo día", async () => {
    await notifyQuotaAlert({
      tenantId: "t3",
      event: "order.created",
      checkResult: baseCheck,
      adminEmail: "admin@test.pe",
    });
    await notifyQuotaAlert({
      tenantId: "t3",
      event: "order.created",
      checkResult: baseCheck,
      adminEmail: "admin@test.pe",
    });
    // Solo un envío
    expect(mockResendSend).toHaveBeenCalledTimes(1);
  });

  it("no lanza si el email falla (fire-and-forget)", async () => {
    mockResendSend.mockRejectedValue(new Error("SMTP down"));
    await expect(
      notifyQuotaAlert({
        tenantId: "t4",
        event: "ai.call",
        checkResult: { ...baseCheck, level: "critical" },
        adminEmail: "admin@test.pe",
      }),
    ).resolves.toBeUndefined();
  });
});
