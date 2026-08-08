/**
 * lib/integrations/sunat-ruc.test.ts — Unit tests for SUNAT RUC verification.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/cache", () => ({
  cacheStore: {
    get: vi.fn(() => null),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { verifyRuc, isInvoiceable } from "@/lib/integrations/sunat-ruc";

describe("verifyRuc — formato peruano", () => {
  beforeEach(() => {
    // Mock EXPLÍCITO, no ausencia de variable: sin variable el default es
    // `auto`, que sale a la API pública de verdad — y contesta «no existe» a
    // un RUC inventado, además de meter red en un test unitario.
    process.env.SUNAT_RUC_PROVIDER = "mock";
  });

  it("rechaza RUC con menos de 11 dígitos", async () => {
    const r = await verifyRuc("2012345678");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_format");
  });

  it("rechaza RUC que no empieza con 10/15/17/20", async () => {
    const r = await verifyRuc("30123456789");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_format");
  });

  it("acepta RUC 20XXXXXXXXX (persona jurídica) en mock", async () => {
    const r = await verifyRuc("20123456789");
    expect(r.ok).toBe(true);
    expect(r.source).toBe("mock");
    expect(r.estado).toBe("ACTIVO");
    expect(r.condicion).toBe("HABIDO");
  });

  it("acepta RUC 10XXXXXXXXX (persona natural con negocio) en mock", async () => {
    const r = await verifyRuc("10123456789");
    expect(r.ok).toBe(true);
  });

  it("acepta RUC 15/17 (casos especiales)", async () => {
    expect((await verifyRuc("15123456789")).ok).toBe(true);
    expect((await verifyRuc("17123456789")).ok).toBe(true);
  });
});

describe("isInvoiceable — ACTIVO + HABIDO requirement", () => {
  it("invoiceable cuando ACTIVO + HABIDO", () => {
    expect(
      isInvoiceable({
        ok: true,
        estado: "ACTIVO",
        condicion: "HABIDO",
        source: "apisperu",
      }),
    ).toBe(true);
  });

  it("NO invoiceable si NO HABIDO (facturas no deducibles)", () => {
    expect(
      isInvoiceable({
        ok: true,
        estado: "ACTIVO",
        condicion: "NO HABIDO",
        source: "apisperu",
      }),
    ).toBe(false);
  });

  it("NO invoiceable si BAJA DE OFICIO", () => {
    expect(
      isInvoiceable({
        ok: true,
        estado: "BAJA DE OFICIO",
        condicion: "HABIDO",
        source: "apisperu",
      }),
    ).toBe(false);
  });

  it("NO invoiceable si !ok", () => {
    expect(
      isInvoiceable({
        ok: false,
        source: "apisperu",
        reason: "not_found",
      }),
    ).toBe(false);
  });
});
