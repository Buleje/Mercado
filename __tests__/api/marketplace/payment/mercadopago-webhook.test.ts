/**
 * Mercadopago webhook handler tests — POST /api/marketplace/payment/mercadopago/webhook
 *
 * Test de integracion: mockea prisma + MP SDK + side effects (whatsapp, push,
 * notifications) y verifica las 6 ramas logicas criticas del handler.
 *
 * Ramas cubiertas:
 *   1. Body type != "payment" → returns { received: true } sin side effects
 *   2. Body sin data.id → returns 400
 *   3. Signature invalida (con secret seteado) → returns 401
 *   4. Payment approved → order.updateMany con status="confirmado" + paymentMethod="mercado_pago"
 *   5. Payment rejected → order.updateMany con status="cancelado"
 *   6. Payment pending → order.updateMany NO se llama
 *
 * Side effects (whatsapp/push/notification) son fire-and-forget y mockeados a no-op.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks de dependencias ──────────────────────────────────────────────────

const mockGetMercadoPagoPayment = vi.fn();
const mockVerifyMPWebhookSignature = vi.fn();
const mockOrderUpdateMany = vi.fn();
const mockOrderFindUnique = vi.fn();
const mockOrderFindFirst = vi.fn();
const mockStoreFindFirst = vi.fn();
const mockTenantFindUnique = vi.fn();
const mockStripeWebhookQueueCreate = vi.fn();
const mockSendWhatsApp = vi.fn();
const mockSendPush = vi.fn();
const mockCreateNotification = vi.fn();

vi.mock("@/lib/mercadopago", () => ({
  getMercadoPagoPayment: (...args: unknown[]) => mockGetMercadoPagoPayment(...args),
  verifyMPWebhookSignature: (...args: unknown[]) => mockVerifyMPWebhookSignature(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      updateMany: (...args: unknown[]) => mockOrderUpdateMany(...args),
      findUnique: (...args: unknown[]) => mockOrderFindUnique(...args),
      findFirst: (...args: unknown[]) => mockOrderFindFirst(...args),
    },
    store: {
      findFirst: (...args: unknown[]) => mockStoreFindFirst(...args),
    },
    tenant: {
      findUnique: (...args: unknown[]) => mockTenantFindUnique(...args),
    },
    stripeWebhookQueue: {
      create: (...args: unknown[]) => mockStripeWebhookQueueCreate(...args),
    },
  },
}));

vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppQueued: (...args: unknown[]) => mockSendWhatsApp(...args),
}));

vi.mock("@/lib/push-sender", () => ({
  sendPushToPhone: (...args: unknown[]) => mockSendPush(...args),
}));

vi.mock("@/lib/create-notification", () => ({
  createNotification: (...args: unknown[]) => {
    mockCreateNotification(...args);
    return Promise.resolve();
  },
}));

// ─── Helper: build NextRequest ──────────────────────────────────────────────

function buildRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  const req = new Request("http://localhost/api/marketplace/payment/mercadopago/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return req as unknown as NextRequest;
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockSendWhatsApp.mockResolvedValue(undefined);
  mockSendPush.mockResolvedValue(undefined);
  mockOrderUpdateMany.mockResolvedValue({ count: 1 });
  mockOrderFindUnique.mockResolvedValue(null);
  // PENTEST 2026-05-18 Sprint A #1: nuevo check de monto requiere
  // order.findFirst con total para comparar contra transaction_amount.
  // Default: orden de S/100 — los tests "approved" mockean
  // transaction_amount=100 para hacer match.
  mockOrderFindFirst.mockResolvedValue({ total: 100, status: "pendiente" });
  mockStripeWebhookQueueCreate.mockResolvedValue({});
  // Default: store.findFirst resuelve para que el tenantId-scoped updateMany
  // pueda ejecutarse en los tests "happy path".
  mockStoreFindFirst.mockResolvedValue({ tenantId: "tenant-test" });
  mockTenantFindUnique.mockResolvedValue(null);
  mockCreateNotification.mockResolvedValue(undefined);
  // SECURITY (2026-04-29): secret OBLIGATORIO. Tests que prueban el happy
  // path lo setean + mockean firma valida; tests negativos lo des-setean.
  process.env.MERCADOPAGO_WEBHOOK_SECRET = "test-secret";
  mockVerifyMPWebhookSignature.mockReturnValue(true);
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("MP webhook — body type filtering", () => {
  it("body sin type=payment ni action=payment.* → returns { received: true } sin side effects", async () => {
    const { POST } = await import(
      "@/app/api/marketplace/payment/mercadopago/webhook/route"
    );

    const req = buildRequest({ type: "subscription", data: { id: "12345" } });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ received: true });

    // No debe tocar DB ni MP API
    expect(mockGetMercadoPagoPayment).not.toHaveBeenCalled();
    expect(mockOrderUpdateMany).not.toHaveBeenCalled();
  });

  it("action=payment.created se procesa", async () => {
    const { POST } = await import(
      "@/app/api/marketplace/payment/mercadopago/webhook/route"
    );

    mockGetMercadoPagoPayment.mockResolvedValue({
      status: "pending",
      external_reference: "store-test::order-abc",
    });

    const req = buildRequest({
      action: "payment.created",
      data: { id: "12345" },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockGetMercadoPagoPayment).toHaveBeenCalledWith("12345");
  });
});

describe("MP webhook — validacion de input", () => {
  it("body sin data.id → returns 400", async () => {
    const { POST } = await import(
      "@/app/api/marketplace/payment/mercadopago/webhook/route"
    );

    const req = buildRequest({ type: "payment", data: {} });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/No data\.id/);
  });

  it("acepta data.id en formato top-level body.id como fallback", async () => {
    const { POST } = await import(
      "@/app/api/marketplace/payment/mercadopago/webhook/route"
    );

    mockGetMercadoPagoPayment.mockResolvedValue({
      status: "pending",
      external_reference: "store-x::order-y",
    });

    const req = buildRequest({ type: "payment", id: "fallback-id" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockGetMercadoPagoPayment).toHaveBeenCalledWith("fallback-id");
  });
});

describe("MP webhook — signature validation", () => {
  it("signature invalida con secret seteado → returns 401", async () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = "test-secret";
    mockVerifyMPWebhookSignature.mockReturnValue(false);

    const { POST } = await import(
      "@/app/api/marketplace/payment/mercadopago/webhook/route"
    );

    const req = buildRequest(
      { type: "payment", data: { id: "12345" } },
      { "x-signature": "ts=1,v1=invalid", "x-request-id": "req-123" },
    );
    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(mockVerifyMPWebhookSignature).toHaveBeenCalledWith({
      xSignature: "ts=1,v1=invalid",
      xRequestId: "req-123",
      dataId: "12345",
      secret: "test-secret",
    });

    // No debe procesar el payment
    expect(mockGetMercadoPagoPayment).not.toHaveBeenCalled();
  });

  it("signature valida → procesa payment normalmente", async () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = "test-secret";
    mockVerifyMPWebhookSignature.mockReturnValue(true);
    mockGetMercadoPagoPayment.mockResolvedValue({
      status: "pending",
      external_reference: "store::order",
    });

    const { POST } = await import(
      "@/app/api/marketplace/payment/mercadopago/webhook/route"
    );

    const req = buildRequest(
      { type: "payment", data: { id: "12345" } },
      { "x-signature": "ts=1,v1=valid", "x-request-id": "req-1" },
    );
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockGetMercadoPagoPayment).toHaveBeenCalled();
  });

  it("sin MERCADOPAGO_WEBHOOK_SECRET → returns 503 (secret obligatorio)", async () => {
    // SECURITY: antes este test probaba un BUG (modo dev sin firma). El
    // bug permitia a atacantes mutar ordenes ajenas via POST anonimo. El
    // fix exige el secret siempre — el test ahora valida el rechazo.
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    mockGetMercadoPagoPayment.mockResolvedValue({
      status: "pending",
      external_reference: "store::order",
    });

    const { POST } = await import(
      "@/app/api/marketplace/payment/mercadopago/webhook/route"
    );

    const req = buildRequest({ type: "payment", data: { id: "12345" } });
    const res = await POST(req);

    expect(res.status).toBe(503);
    expect(mockGetMercadoPagoPayment).not.toHaveBeenCalled();
    expect(mockOrderUpdateMany).not.toHaveBeenCalled();
  });
});

describe("MP webhook — order status mapping", () => {
  it("payment approved con monto correcto → order.updateMany con status='confirmado' + paymentMethod='mercado_pago'", async () => {
    mockGetMercadoPagoPayment.mockResolvedValue({
      status: "approved",
      external_reference: "tienda-test::order-abc-123",
      transaction_amount: 100, // PENTEST Sprint A #1: debe matchear order.total mockeado
    });

    const { POST } = await import(
      "@/app/api/marketplace/payment/mercadopago/webhook/route"
    );

    const req = buildRequest({ type: "payment", data: { id: "pay-1" } });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockStoreFindFirst).toHaveBeenCalledWith({
      where: { slug: "tienda-test" },
      select: { tenantId: true },
    });
    expect(mockOrderUpdateMany).toHaveBeenCalledWith({
      where: { id: "order-abc-123", tenantId: "tenant-test" },
      data: {
        status: "confirmado",
        paymentMethod: "mercado_pago",
      },
    });

    const json = await res.json();
    expect(json.received).toBe(true);
    expect(json.orderId).toBe("order-abc-123");
    expect(json.status).toBe("approved");
  });

  // PENTEST 2026-05-18 Sprint A #1: amount mismatch attack defense.
  it("payment approved con monto INCORRECTO → NO confirma + notification HIGH", async () => {
    mockGetMercadoPagoPayment.mockResolvedValue({
      status: "approved",
      external_reference: "tienda-test::order-abc-123",
      transaction_amount: 0.10, // Atacante pagó S/0.10 contra order de S/100
    });

    const { POST } = await import(
      "@/app/api/marketplace/payment/mercadopago/webhook/route"
    );

    const req = buildRequest({ type: "payment", data: { id: "pay-evil" } });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.mismatched_amount).toBe(true);
    // NO debe actualizar la orden a confirmado
    expect(mockOrderUpdateMany).not.toHaveBeenCalled();
    // SI debe haber creado una notification HIGH para review manual
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "HIGH",
        type: "marketplace_payment",
        title: expect.stringContaining("monto incorrecto"),
      }),
    );
  });

  it("payment rejected → order.updateMany con status='cancelado'", async () => {
    mockGetMercadoPagoPayment.mockResolvedValue({
      status: "rejected",
      external_reference: "tienda::order-xyz",
    });

    const { POST } = await import(
      "@/app/api/marketplace/payment/mercadopago/webhook/route"
    );

    const req = buildRequest({ type: "payment", data: { id: "pay-2" } });
    await POST(req);

    expect(mockOrderUpdateMany).toHaveBeenCalledWith({
      where: { id: "order-xyz", tenantId: "tenant-test" },
      data: {
        status: "cancelado",
        paymentMethod: "mercado_pago",
      },
    });
  });

  it("payment cancelled → order.updateMany con status='cancelado'", async () => {
    mockGetMercadoPagoPayment.mockResolvedValue({
      status: "cancelled",
      external_reference: "tienda::order-zzz",
    });

    const { POST } = await import(
      "@/app/api/marketplace/payment/mercadopago/webhook/route"
    );

    const req = buildRequest({ type: "payment", data: { id: "pay-3" } });
    await POST(req);

    expect(mockOrderUpdateMany).toHaveBeenCalledWith({
      where: { id: "order-zzz", tenantId: "tenant-test" },
      data: {
        status: "cancelado",
        paymentMethod: "mercado_pago",
      },
    });
  });

  it("payment pending → NO actualiza order (espera webhook futuro)", async () => {
    mockGetMercadoPagoPayment.mockResolvedValue({
      status: "pending",
      external_reference: "tienda::order-pending",
    });

    const { POST } = await import(
      "@/app/api/marketplace/payment/mercadopago/webhook/route"
    );

    const req = buildRequest({ type: "payment", data: { id: "pay-4" } });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockOrderUpdateMany).not.toHaveBeenCalled();
  });

  it("payment in_process → NO actualiza order", async () => {
    mockGetMercadoPagoPayment.mockResolvedValue({
      status: "in_process",
      external_reference: "tienda::order-inprocess",
    });

    const { POST } = await import(
      "@/app/api/marketplace/payment/mercadopago/webhook/route"
    );

    const req = buildRequest({ type: "payment", data: { id: "pay-5" } });
    await POST(req);

    expect(mockOrderUpdateMany).not.toHaveBeenCalled();
  });
});

describe("MP webhook — external_reference parsing", () => {
  it("external_reference sin '::' → ignora silenciosamente con { received: true }", async () => {
    mockGetMercadoPagoPayment.mockResolvedValue({
      status: "approved",
      external_reference: "malformed-no-delimiter",
    });

    const { POST } = await import(
      "@/app/api/marketplace/payment/mercadopago/webhook/route"
    );

    const req = buildRequest({ type: "payment", data: { id: "pay-mal" } });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ received: true });
    expect(mockOrderUpdateMany).not.toHaveBeenCalled();
  });

  it("external_reference vacio → ignora silenciosamente", async () => {
    mockGetMercadoPagoPayment.mockResolvedValue({
      status: "approved",
      external_reference: "",
    });

    const { POST } = await import(
      "@/app/api/marketplace/payment/mercadopago/webhook/route"
    );

    const req = buildRequest({ type: "payment", data: { id: "pay-empty" } });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockOrderUpdateMany).not.toHaveBeenCalled();
  });
});
