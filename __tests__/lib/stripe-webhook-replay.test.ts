/**
 * Stripe Webhook Replay — idempotency lock via UNIQUE constraint
 *
 * Escenario crítico: Stripe reintenta un webhook ya procesado (P2002).
 * El route handler debe retornar 200 idempotente sin re-ejecutar processStripeEvent.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Pre-import stubs ────────────────────────────────────────────────────────
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/sentry-alerts", () => ({ reportCriticalError: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// ── Prisma mock (vi.hoisted para que esté disponible en la factory) ─────────
const {
  mockCreate,
  mockUpdate,
  mockDeleteMany,
  mockTenantFindUnique,
  mockTenantFindFirst,
  mockTenantUpdate,
  mockActivityLogCreate,
  mockUpsert,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockDeleteMany: vi.fn(),
  mockTenantFindUnique: vi.fn(),
  mockTenantFindFirst: vi.fn(),
  mockTenantUpdate: vi.fn(),
  mockActivityLogCreate: vi.fn(),
  mockUpsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    stripeWebhookQueue: {
      create: mockCreate,
      update: mockUpdate,
      deleteMany: mockDeleteMany,
      upsert: mockUpsert,
      findMany: vi.fn().mockResolvedValue([]),
    },
    tenant: {
      findUnique: mockTenantFindUnique,
      findFirst: mockTenantFindFirst,
      update: mockTenantUpdate,
    },
    activityLog: { create: mockActivityLogCreate },
    notification: { create: vi.fn().mockResolvedValue({}) },
  },
}));

// ── Stripe SDK mock ─────────────────────────────────────────────────────────
const { mockConstructWebhookEvent } = vi.hoisted(() => ({
  mockConstructWebhookEvent: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  constructWebhookEvent: mockConstructWebhookEvent,
  planFromSubscription: vi.fn().mockReturnValue("pro"),
}));

// stripe-sub-helper es un dynamic import dentro del route; mockeamos el módulo
vi.mock("@/app/api/billing/webhook/stripe-sub-helper", () => ({
  fetchSubscription: vi.fn().mockResolvedValue({
    id: "sub_test",
    cancel_at_period_end: false,
    items: { data: [{ price: { id: "price_test" }, current_period_end: 9999999999 }] },
  }),
}));

// ── Imports bajo test ───────────────────────────────────────────────────────
import { POST } from "@/app/api/billing/webhook/route";
import { NextRequest } from "next/server";
import { logger } from "@/lib/logger";

// ── Helpers ─────────────────────────────────────────────────────────────────
function makeStripeEvent(id = "evt_123", type = "customer.subscription.updated") {
  return {
    id,
    type,
    object: "event" as const,
    api_version: "2023-10-16",
    // Round 28 Sprint 1 (1.9): freshness check rechaza events >1h.
    // Usamos `now` para que los tests pasen el check anti-replay.
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: "sub_abc",
        customer: "cus_test",
        cancel_at_period_end: false,
        metadata: { tenantSlug: "bodega-test" },
        items: { data: [{ price: { id: "price_pro" }, current_period_end: 9999999999 }] },
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: null,
  };
}

function makeRequest(event: ReturnType<typeof makeStripeEvent>) {
  const body = JSON.stringify(event);
  return new NextRequest("http://localhost:3000/api/billing/webhook", {
    method: "POST",
    headers: {
      "stripe-signature": "sig_test",
      "content-type": "application/json",
    },
    body,
  });
}

/** Error de Prisma UNIQUE constraint (P2002) */
function p2002(): Error & { code: string } {
  const err = new Error("Unique constraint failed") as Error & { code: string };
  err.code = "P2002";
  return err;
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("POST /api/billing/webhook — idempotency replay lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Por defecto: firma válida → devuelve el evento mockeado
    mockConstructWebhookEvent.mockImplementation((_buf: Buffer, _sig: string) =>
      makeStripeEvent()
    );
    // Tenant existe y el customerId coincide
    mockTenantFindUnique.mockResolvedValue({
      id: "tenant-1",
      stripeCustomerId: "cus_test",
    });
    mockTenantFindFirst.mockResolvedValue(null);
    mockTenantUpdate.mockResolvedValue({});
    mockActivityLogCreate.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});
    mockDeleteMany.mockResolvedValue({ count: 0 });
  });

  // ── Case 1: primer webhook se procesa OK ──────────────────────────────────
  it("procesa primer webhook correctamente y retorna 200", async () => {
    // Arrange: create no lanza → lock tomado con éxito
    mockCreate.mockResolvedValue({});

    // Act
    const res = await POST(makeRequest(makeStripeEvent()));
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(body.received).toBe(true);
    expect(body.duplicate).toBeUndefined();
    expect(mockCreate).toHaveBeenCalledOnce();
    // Debió actualizar el registro al completar el procesamiento
    expect(mockUpdate).toHaveBeenCalled();
  });

  // ── Case 2: replay — mismo evt_id llega por segunda vez ──────────────────
  it("retorna 200 idempotente cuando el mismo evento ya fue procesado (P2002)", async () => {
    // Arrange: segunda vez → UNIQUE constraint violation
    mockCreate.mockRejectedValue(p2002());

    // Act
    const res = await POST(makeRequest(makeStripeEvent("evt_123")));
    const body = await res.json();

    // Assert: 200 idempotente, NO error
    expect(res.status).toBe(200);
    expect(body.received).toBe(true);
    expect(body.duplicate).toBe(true);

    // processStripeEvent NO se ejecutó → tenant.update NO se llamó
    expect(mockTenantUpdate).not.toHaveBeenCalled();
  });

  // ── Case 3: P2002 se interpreta como "ya procesado", no como error ────────
  it("P2002 NO genera log de error ni llama a enqueueWebhookEvent", async () => {
    mockCreate.mockRejectedValue(p2002());

    await POST(makeRequest(makeStripeEvent("evt_123")));

    // El log de info confirma duplicate; error NO se llama
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      "[Stripe Webhook] Duplicate event skipped (locked)",
      expect.objectContaining({ stripeId: "evt_123" }),
    );
    expect(vi.mocked(logger.error)).not.toHaveBeenCalled();
    // upsert de enqueueWebhookEvent NO se llama
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  // ── Case 4: error real (no P2002) → lock se libera ────────────────────────
  it("libera el lock vía deleteMany cuando processStripeEvent falla con error real", async () => {
    const eventId = "evt_error_real";
    const event = makeStripeEvent(eventId);

    // constructWebhookEvent devuelve el evento con el id específico
    mockConstructWebhookEvent.mockReturnValue(event);

    // Arrange: lock se toma (create OK), pero processStripeEvent falla
    mockCreate.mockResolvedValue({});
    mockTenantFindUnique.mockRejectedValue(new Error("DB connection lost"));

    // Act
    const res = await POST(makeRequest(event));
    const body = await res.json();

    // Assert: responde 200 (Stripe no reintenta; nuestro cron lo hará)
    expect(res.status).toBe(200);
    expect(body.received).toBe(true);
    expect(body.duplicate).toBeUndefined();

    // Lock debe liberarse para que el cron de replay pueda reintentar
    expect(mockDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          stripeId: eventId,
          processedAt: null,
        }),
      }),
    );
  });

  // ── Case 5: falta stripe-signature → 400 ─────────────────────────────────
  it("retorna 400 si no hay stripe-signature header", async () => {
    const req = new NextRequest("http://localhost:3000/api/billing/webhook", {
      method: "POST",
      body: JSON.stringify(makeStripeEvent()),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
