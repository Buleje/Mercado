/**
 * __tests__/sunat-invoice-worker.test.ts
 *
 * El worker de reintentos NO debe reenviar una factura de madera sin su
 * detracción: si el registro quedó como operación sujeta (tipoOperacion
 * "1001"), el payload reconstruido debe salir con sunat_transaction 30 + SPOT.
 * Si no se puede reconstruir, aborta en vez de reenviar sin detracción.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/domain-events", () => ({
  DomainEvents: { facturaEmitida: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/lib/sunat/sale-events", () => ({
  sunatEventBus: { emitInvoiceUpdated: vi.fn(), onSaleCreated: vi.fn() },
}));

const sendInvoice = vi.fn();
vi.mock("@/lib/sunat/nubefact-client", () => ({
  sendInvoice: (...args: unknown[]) => sendInvoice(...args),
}));

const getInvoiceById = vi.fn();
const getConfig = vi.fn();
const updateInvoice = vi.fn().mockResolvedValue({});
vi.mock("@/lib/db/sunat.db", () => ({
  SunatDB: {
    getInvoiceById: (...a: unknown[]) => getInvoiceById(...a),
    getConfig: (...a: unknown[]) => getConfig(...a),
    updateInvoice: (...a: unknown[]) => updateInvoice(...a),
  },
}));

const orderFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { order: { findFirst: (...a: unknown[]) => orderFindFirst(...a) } },
}));

import { retryInvoice } from "@/lib/sunat/invoice-worker";

const TENANT = "t-blas";

const maderaOrder = {
  id: "order-1",
  customerName: "MADERERA LIMA SRL",
  customerPhone: null,
  total: 1180,
  items: [
    {
      name: "Madera aserrada tornillo",
      quantity: 1,
      price: 1180,
      unit: "NIU",
      product: { taxType: "gravado" },
    },
  ],
};

const config = {
  ruc: "20601234567",
  razonSocial: "INVERSIONES BLAS SA",
  direccionFiscal: "Pucallpa",
  boletaSeries: "B001",
  facturaSeries: "F001",
  cuentaDetracciones: "00-123-456789",
};

function invoice1001(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    tenantId: TENANT,
    orderId: "order-1",
    type: "factura",
    number: 7,
    customerRuc: "20601234568",
    customerName: "MADERERA LIMA SRL",
    sunatStatus: "retrying",
    errorMessage: null,
    tipoOperacion: "1001",
    detraccionCodigo: "008",
    detraccionPorcentaje: 4,
    detraccionMonto: 47.2,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getConfig.mockResolvedValue(config);
  orderFindFirst.mockResolvedValue(maderaOrder);
  sendInvoice.mockResolvedValue({ sunat_accepted: true, nubefact_id: "nf-1" });
  updateInvoice.mockResolvedValue({});
});

describe("retryInvoice de una factura 1001 (detracción)", () => {
  it("reconstruye el SPOT: sunat_transaction 30 + detraccion_total", async () => {
    getInvoiceById.mockResolvedValue(invoice1001());

    await retryInvoice(TENANT, "inv-1");

    expect(sendInvoice).toHaveBeenCalledTimes(1);
    const payload = sendInvoice.mock.calls[0][1];
    expect(payload.sunat_transaction).toBe(30);
    expect(payload.detraccion).toBe(true);
    expect(payload.detraccion_tipo).toBe(8);
    expect(payload.detraccion_porcentaje).toBe(4);
    expect(payload.detraccion_total).toBe(47.2);
    expect(payload.medio_de_pago_detraccion).toBe(1);
  });

  it("aborta (rejected) y NO reenvía si no se puede reconstruir el SPOT", async () => {
    // tipoOperacion 1001 pero sin código de bien → no se puede reconstruir.
    getInvoiceById.mockResolvedValue(invoice1001({ detraccionCodigo: null }));

    await retryInvoice(TENANT, "inv-1");

    expect(sendInvoice).not.toHaveBeenCalled();
    expect(updateInvoice).toHaveBeenCalledWith(
      TENANT,
      "inv-1",
      expect.objectContaining({ sunatStatus: "rejected" }),
    );
  });
});
