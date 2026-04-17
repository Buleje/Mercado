/**
 * ADR-047 — Tests del cron meter-to-stripe.
 *
 * Verifica:
 *   - auth con CRON_SECRET
 *   - dryRun no invoca meterEvents.create
 *   - identifier por tenant+event+mes (idempotencia Stripe)
 *   - tenants sin stripeCustomerId se saltan sin error
 *   - mapeo MeteredEvent → meter event_name via env vars
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockMeterEventsCreate = vi.fn();
vi.mock("@/lib/stripe", () => ({
  stripe: {
    billing: {
      meterEvents: { create: mockMeterEventsCreate },
    },
  },
}));

const mockFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { tenant: { findMany: mockFindMany } },
}));

const mockGetMeteredUsage = vi.fn();
vi.mock("@/lib/billing/metering", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/metering")>(
    "@/lib/billing/metering",
  );
  return {
    ...actual,
    getMeteredUsage: mockGetMeteredUsage,
  };
});

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  mockMeterEventsCreate.mockReset();
  mockFindMany.mockReset();
  mockGetMeteredUsage.mockReset();

  process.env.CRON_SECRET = "test-cron-secret";
  process.env.STRIPE_METER_AI_RECOMMEND = "ai_recommend_call";
  process.env.STRIPE_METER_WHATSAPP_SENT = "whatsapp_message_sent";
  delete process.env.STRIPE_METER_ORDER_CREATED;
  delete process.env.STRIPE_METER_AI_CALL;
  delete process.env.STRIPE_METER_AI_INSIGHT;
  delete process.env.STRIPE_METER_SUNAT_EMITTED;
  delete process.env.STRIPE_METER_SMS_SENT;
  delete process.env.STRIPE_METER_STORAGE_BLOB;
});

afterEach(() => {
  vi.resetModules();
});

function buildReq(path: string, authHeader?: string) {
  return new Request(`http://test${path}`, {
    headers: authHeader ? { authorization: authHeader } : {},
  }) as unknown as import("next/server").NextRequest;
}

describe("cron/meter-to-stripe", () => {
  it("rechaza sin CRON_SECRET header", async () => {
    const { GET } = await import("@/app/api/cron/meter-to-stripe/route");
    const res = await GET(buildReq("/api/cron/meter-to-stripe"));
    expect(res.status).toBe(401);
  });

  it("rechaza con CRON_SECRET incorrecto", async () => {
    const { GET } = await import("@/app/api/cron/meter-to-stripe/route");
    const res = await GET(
      buildReq("/api/cron/meter-to-stripe", "Bearer wrong"),
    );
    expect(res.status).toBe(401);
  });

  it("devuelve noop cuando no hay meter env vars", async () => {
    delete process.env.STRIPE_METER_AI_RECOMMEND;
    delete process.env.STRIPE_METER_WHATSAPP_SENT;
    const { GET } = await import("@/app/api/cron/meter-to-stripe/route");
    const res = await GET(
      buildReq("/api/cron/meter-to-stripe", "Bearer test-cron-secret"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pushed).toBe(0);
    expect(body.note).toMatch(/env vars/);
  });

  it("dryRun=1 no invoca meterEvents.create pero lista los pushes teoricos", async () => {
    mockFindMany.mockResolvedValue([
      { id: "tenant-1", stripeCustomerId: "cus_1" },
    ]);
    mockGetMeteredUsage.mockResolvedValue({
      "order.created": 0,
      "ai.call": 0,
      "ai.recommend": 120,
      "ai.insight": 0,
      "sms.sent": 0,
      "whatsapp.sent": 40,
      "sunat.emitted": 0,
      "storage.blob": 0,
    });

    const { GET } = await import("@/app/api/cron/meter-to-stripe/route");
    const res = await GET(
      buildReq(
        "/api/cron/meter-to-stripe?dryRun=1",
        "Bearer test-cron-secret",
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mockMeterEventsCreate).not.toHaveBeenCalled();
    expect(body.totalPushed).toBe(0);
    expect(body.results[0].pushed).toHaveLength(2);
    expect(body.results[0].pushed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "ai.recommend", amount: 120, meterName: "ai_recommend_call" }),
        expect.objectContaining({ event: "whatsapp.sent", amount: 40, meterName: "whatsapp_message_sent" }),
      ]),
    );
  });

  it("invoca meterEvents.create con identifier por tenant+event+mes", async () => {
    mockFindMany.mockResolvedValue([
      { id: "tenant-1", stripeCustomerId: "cus_1" },
    ]);
    mockGetMeteredUsage.mockResolvedValue({
      "order.created": 0,
      "ai.call": 0,
      "ai.recommend": 150,
      "ai.insight": 0,
      "sms.sent": 0,
      "whatsapp.sent": 0,
      "sunat.emitted": 0,
      "storage.blob": 0,
    });
    mockMeterEventsCreate.mockResolvedValue({ id: "mte_1" });

    const { GET } = await import("@/app/api/cron/meter-to-stripe/route");
    const res = await GET(
      buildReq("/api/cron/meter-to-stripe", "Bearer test-cron-secret"),
    );
    expect(res.status).toBe(200);
    expect(mockMeterEventsCreate).toHaveBeenCalledTimes(1);
    const [params] = mockMeterEventsCreate.mock.calls[0];
    expect(params).toEqual(
      expect.objectContaining({
        event_name: "ai_recommend_call",
        identifier: expect.stringMatching(/^meter:tenant-1:ai\.recommend:\d{4}-\d{2}$/),
        payload: expect.objectContaining({
          stripe_customer_id: "cus_1",
          value: "150",
        }),
      }),
    );
  });

  it("salta tenants sin stripeCustomerId sin tirar", async () => {
    mockFindMany.mockResolvedValue([]); // el query ya filtra por not null
    const { GET } = await import("@/app/api/cron/meter-to-stripe/route");
    const res = await GET(
      buildReq("/api/cron/meter-to-stripe", "Bearer test-cron-secret"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenants).toBe(0);
    expect(body.totalPushed).toBe(0);
  });

  it("ignora eventos sin env var mapeada", async () => {
    mockFindMany.mockResolvedValue([
      { id: "tenant-1", stripeCustomerId: "cus_1" },
    ]);
    // order.created no tiene env var → no se reporta
    mockGetMeteredUsage.mockResolvedValue({
      "order.created": 999, // debería ignorarse
      "ai.call": 0,
      "ai.recommend": 5,
      "ai.insight": 0,
      "sms.sent": 0,
      "whatsapp.sent": 0,
      "sunat.emitted": 0,
      "storage.blob": 0,
    });
    mockMeterEventsCreate.mockResolvedValue({ id: "x" });

    const { GET } = await import("@/app/api/cron/meter-to-stripe/route");
    await GET(
      buildReq("/api/cron/meter-to-stripe", "Bearer test-cron-secret"),
    );
    expect(mockMeterEventsCreate).toHaveBeenCalledTimes(1);
    expect(mockMeterEventsCreate.mock.calls[0][0].event_name).toBe("ai_recommend_call");
  });

  it("amount 0 no se reporta", async () => {
    mockFindMany.mockResolvedValue([
      { id: "tenant-1", stripeCustomerId: "cus_1" },
    ]);
    mockGetMeteredUsage.mockResolvedValue({
      "order.created": 0,
      "ai.call": 0,
      "ai.recommend": 0,
      "ai.insight": 0,
      "sms.sent": 0,
      "whatsapp.sent": 0,
      "sunat.emitted": 0,
      "storage.blob": 0,
    });

    const { GET } = await import("@/app/api/cron/meter-to-stripe/route");
    await GET(
      buildReq("/api/cron/meter-to-stripe", "Bearer test-cron-secret"),
    );
    expect(mockMeterEventsCreate).not.toHaveBeenCalled();
  });

  it("un error en un meter event no bloquea los siguientes", async () => {
    mockFindMany.mockResolvedValue([
      { id: "tenant-1", stripeCustomerId: "cus_1" },
    ]);
    mockGetMeteredUsage.mockResolvedValue({
      "order.created": 0,
      "ai.call": 0,
      "ai.recommend": 50,
      "ai.insight": 0,
      "sms.sent": 0,
      "whatsapp.sent": 30,
      "sunat.emitted": 0,
      "storage.blob": 0,
    });
    mockMeterEventsCreate
      .mockRejectedValueOnce(new Error("Stripe 503"))
      .mockResolvedValueOnce({ id: "mte_2" });

    const { GET } = await import("@/app/api/cron/meter-to-stripe/route");
    const res = await GET(
      buildReq("/api/cron/meter-to-stripe", "Bearer test-cron-secret"),
    );
    expect(res.status).toBe(200);
    expect(mockMeterEventsCreate).toHaveBeenCalledTimes(2);
    const body = await res.json();
    // Solo 1 se pushed efectivamente (el segundo)
    expect(body.totalPushed).toBe(1);
    expect(body.results[0].pushed).toHaveLength(1);
  });
});
