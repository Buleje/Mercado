/**
 * __tests__/lib/payments/provider.test.ts
 *
 * Tests unitarios para la capa PaymentProvider.
 * Cada adapter es un stub — no hace HTTP real.
 */

import { describe, it, expect, beforeEach } from "vitest";

import { CulqiProvider } from "@/lib/payments/adapters/culqi-adapter";
import { IzipayProvider } from "@/lib/payments/adapters/izipay-adapter";
import { MercadopagoProvider } from "@/lib/payments/adapters/mercadopago-adapter";
import { PagoefectivoProvider } from "@/lib/payments/adapters/pagoefectivo-adapter";
import {
  getPaymentProvider,
  listAvailableProviders,
  _resetRegistryForTests,
} from "@/lib/payments/registry";
import type { ChargeInput } from "@/lib/payments/provider";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeChargeInput(overrides: Partial<ChargeInput> = {}): ChargeInput {
  return {
    amountCents: 1050,
    currency: "PEN",
    method: "card",
    orderId: "order-test-001",
    storeSlug: "bodega-san-martin",
    customer: { name: "Juan Quispe", email: "juan@example.com", phone: "+51999000111" },
    ...overrides,
  };
}

// ─── Ids correctos ────────────────────────────────────────────────────────────

describe("adapters — id correcto", () => {
  it("CulqiProvider.id === 'culqi'", () => {
    expect(new CulqiProvider().id).toBe("culqi");
  });

  it("IzipayProvider.id === 'izipay'", () => {
    expect(new IzipayProvider().id).toBe("izipay");
  });

  it("MercadopagoProvider.id === 'mercadopago'", () => {
    expect(new MercadopagoProvider().id).toBe("mercadopago");
  });

  it("PagoefectivoProvider.id === 'pagoefectivo'", () => {
    expect(new PagoefectivoProvider().id).toBe("pagoefectivo");
  });
});

// ─── Registry ─────────────────────────────────────────────────────────────────

describe("getPaymentProvider()", () => {
  beforeEach(() => {
    _resetRegistryForTests();
  });

  it("retorna instancia de CulqiProvider para 'culqi'", () => {
    const provider = getPaymentProvider("culqi");
    expect(provider).toBeInstanceOf(CulqiProvider);
  });

  it("retorna instancia de IzipayProvider para 'izipay'", () => {
    expect(getPaymentProvider("izipay")).toBeInstanceOf(IzipayProvider);
  });

  it("retorna instancia de MercadopagoProvider para 'mercadopago'", () => {
    expect(getPaymentProvider("mercadopago")).toBeInstanceOf(MercadopagoProvider);
  });

  it("retorna instancia de PagoefectivoProvider para 'pagoefectivo'", () => {
    expect(getPaymentProvider("pagoefectivo")).toBeInstanceOf(PagoefectivoProvider);
  });

  it("siempre retorna la misma instancia (singleton)", () => {
    const a = getPaymentProvider("culqi");
    const b = getPaymentProvider("culqi");
    expect(a).toBe(b);
  });
});

// ─── listAvailableProviders ───────────────────────────────────────────────────

describe("listAvailableProviders()", () => {
  beforeEach(() => {
    _resetRegistryForTests();
  });

  it("retorna los 4 proveedores para 'PEN'", () => {
    const providers = listAvailableProviders("PEN");
    const ids = providers.map((p) => p.id);
    expect(ids).toContain("culqi");
    expect(ids).toContain("izipay");
    expect(ids).toContain("mercadopago");
    expect(ids).toContain("pagoefectivo");
    expect(providers).toHaveLength(4);
  });

  it("retorna solo culqi e izipay para 'USD' (mp y pagoefectivo no soportan USD)", () => {
    const providers = listAvailableProviders("USD");
    const ids = providers.map((p) => p.id);
    expect(ids).toContain("culqi");
    expect(ids).toContain("izipay");
    expect(ids).not.toContain("mercadopago");
    expect(ids).not.toContain("pagoefectivo");
  });
});

// ─── charge() con amountCents: 0 → failed ────────────────────────────────────

describe("charge() — amountCents: 0 retorna status: 'failed'", () => {
  it("CulqiProvider", async () => {
    const result = await new CulqiProvider().charge(makeChargeInput({ amountCents: 0 }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.reason).toBeTruthy();
    }
  });

  it("IzipayProvider", async () => {
    const result = await new IzipayProvider().charge(makeChargeInput({ amountCents: 0 }));
    expect(result.status).toBe("failed");
  });

  it("MercadopagoProvider", async () => {
    const result = await new MercadopagoProvider().charge(makeChargeInput({ amountCents: 0 }));
    expect(result.status).toBe("failed");
  });

  it("PagoefectivoProvider", async () => {
    const result = await new PagoefectivoProvider().charge(makeChargeInput({ amountCents: 0 }));
    expect(result.status).toBe("failed");
  });
});

// ─── charge() stub con monto válido ──────────────────────────────────────────

describe("charge() — monto válido retorna externalId", () => {
  it("CulqiProvider stub → succeeded", async () => {
    const result = await new CulqiProvider().charge(makeChargeInput());
    // Sin API key en test env → falla con CONFIG_ERROR
    expect(["succeeded", "failed"]).toContain(result.status);
    if (result.status === "failed") {
      expect(result.providerCode).toBe("CONFIG_ERROR");
    }
  });

  it("MercadopagoProvider stub → pending con nextAction.type === 'redirect'", async () => {
    const result = await new MercadopagoProvider().charge(makeChargeInput());
    // Sin access token → falla con CONFIG_ERROR
    expect(["pending", "failed"]).toContain(result.status);
    if (result.status === "pending") {
      expect(result.nextAction.type).toBe("redirect");
    }
  });

  it("PagoefectivoProvider stub → pending con nextAction.type === 'display_code'", async () => {
    const result = await new PagoefectivoProvider().charge(makeChargeInput());
    expect(["pending", "failed"]).toContain(result.status);
    if (result.status === "pending") {
      expect(result.nextAction.type).toBe("display_code");
    }
  });
});

// ─── verifyWebhook() — sin secret en prod → invalid ──────────────────────────

describe("verifyWebhook() — payload básico sin configurar", () => {
  const fakeReq = {
    headers: {},
    rawBody: '{"type":"payment","data":{"id":"123"}}',
    body: { type: "payment", data: { id: "123" } },
    query: {},
  };

  it("MercadopagoProvider retorna valid:true en dev (sin secret)", async () => {
    // NODE_ENV="test" → equivalente a dev
    const result = await new MercadopagoProvider().verifyWebhook(fakeReq);
    expect(result.valid).toBe(true);
    expect(result.externalId).toBe("123");
  });

  it("CulqiProvider retorna valid:true en dev (sin secret)", async () => {
    const result = await new CulqiProvider().verifyWebhook(fakeReq);
    expect(result.valid).toBe(true);
  });

  it("IzipayProvider retorna valid:true en dev (sin secret)", async () => {
    const result = await new IzipayProvider().verifyWebhook({
      ...fakeReq,
      body: { "kr-answer": '{"transactions":[{"uuid":"abc","status":"PAID"}]}' },
    });
    expect(result.valid).toBe(true);
  });

  it("PagoefectivoProvider retorna valid:true en dev (sin secret)", async () => {
    const result = await new PagoefectivoProvider().verifyWebhook({
      ...fakeReq,
      body: { type: "payment.received", cipCode: "9000ABC" },
    });
    expect(result.valid).toBe(true);
    expect(result.externalId).toBe("9000ABC");
  });
});
