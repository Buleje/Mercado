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
const mockStoreFindFirst = vi.fn();
const mockTenantFindUnique = vi.fn();
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
    },
    store: {
      findFirst: (...args: unknown[]) => mockStoreFindFirst(...args),
    },
    tenant: {
      findUnique: (...args: unknown[]) => mockTenantFindUnique(...args),
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
  mockStoreFindFirst.mockResolvedValue(null);
  mockTenantFindUnique.mockResolvedValue(null);
  delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
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

  it("sin MERCADOPAGO_WEBHOOK_SECRET → no valida firma (modo dev)", async () => {
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

    expect(res.status).toBe(200);
    expect(mockVerifyMPWebhookSignature).not.toHaveBeenCalled();
  });
});

describe("MP webhook — order status mapping", () => {
  it("payment approved → order.updateMany con status='confirmado' + paymentMethod='mercado_pago'", async () => {
    mockGetMercadoPagoPayment.mockResolvedValue({
      status: "approved",
      external_reference: "tienda-test::order-abc-123",
    });

    const { POST } = await import(
      "@/app/api/marketplace/payment/mercadopago/webhook/route"
    );

    const req = buildRequest({ type: "payment", data: { id: "pay-1" } });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockOrderUpdateMany).toHaveBeenCalledWith({
      where: { id: "order-abc-123" },
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
      where: { id: "order-xyz" },
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
      where: { id: "order-zzz" },
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
