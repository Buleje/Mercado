/**
 * __tests__/sunat-invoice-builder.test.ts
 *
 * Unit tests del invoice builder SUNAT.
 * Cubre: boleta sin RUC, factura con RUC, cálculo IGV 18%,
 *        items múltiples, nota de crédito, RUC inválido.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Mockear calculateIGV desde lib/sunat
vi.mock("@/lib/sunat", () => ({
  calculateIGV: (total: number) => {
    const igv = +(total - total / 1.18).toFixed(2);
    const gravado = +(total / 1.18).toFixed(2);
    return { total, igv, gravado };
  },
}));

import {
  buildBoleta,
  buildFactura,
  buildNotaCredito,
  buildBaja,
  type BuilderOrder,
  type BuilderTenant,
  type BuilderSettings,
} from "@/lib/sunat/invoice-builder";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const tenant: BuilderTenant = {
  ruc: "20601234567",
  razonSocial: "BODEGA SAN MARTIN SAC",
  direccionFiscal: "Jr. Lima 123, Pucallpa",
};

const settings: BuilderSettings = {
  boletaSeries: "B001",
  facturaSeries: "F001",
  nextBoletaNum: 1,
  nextFacturaNum: 1,
};

const singleItemOrder: BuilderOrder = {
  id: "order-001",
  customerName: "CONSUMIDOR FINAL",
  total: 118,
  items: [
    {
      name: "Cerveza Cristal 650ml",
      quantity: 2,
      price: 59,
      unit: "NIU",
    },
  ],
};

const multiItemOrder: BuilderOrder = {
  id: "order-002",
  customerName: "Juan Pérez",
  total: 236,
  items: [
    { name: "Arroz Costeño 5kg", quantity: 2, price: 25, unit: "KGM" },
    { name: "Aceite Primor 1L", quantity: 3, price: 12, unit: "NIU" },
    { name: "Azúcar Blanca 1kg", quantity: 4, price: 5, unit: "KGM" },
  ],
};

// ── Tests buildBoleta ─────────────────────────────────────────────────────────

describe("buildBoleta", () => {
  it("genera payload con tipo_de_comprobante=2 (boleta)", () => {
    const payload = buildBoleta(singleItemOrder, tenant, settings);
    expect(payload.tipo_de_comprobante).toBe(2);
    expect(payload.operacion).toBe("generar_comprobante");
    expect(payload.serie).toBe("B001");
    expect(payload.numero).toBe(1);
  });

  it("usa '00000000' cuando no hay DNI (consumidor final anónimo)", () => {
    const payload = buildBoleta(singleItemOrder, tenant, settings);
    expect(payload.cliente_numero_de_documento).toBe("00000000");
    expect(payload.cliente_tipo_de_documento).toBe(1);
  });

  it("usa DNI cuando se provee y tiene 8 dígitos", () => {
    const payload = buildBoleta(
      singleItemOrder,
      tenant,
      settings,
      "12345678"
    );
    expect(payload.cliente_numero_de_documento).toBe("12345678");
  });

  it("ignora DNI con formato inválido y usa 00000000", () => {
    const payload = buildBoleta(singleItemOrder, tenant, settings, "123");
    expect(payload.cliente_numero_de_documento).toBe("00000000");
  });

  it("calcula IGV 18% correctamente para orden de S/118", () => {
    const payload = buildBoleta(singleItemOrder, tenant, settings);
    // 118 / 1.18 = 100 (gravado), 118 - 100 = 18 (igv)
    expect(payload.total_gravada).toBeCloseTo(100, 0);
    expect(payload.total_igv).toBeCloseTo(18, 0);
    expect(payload.total).toBeCloseTo(118, 0);
  });

  it("genera items para cada producto del pedido", () => {
    const payload = buildBoleta(multiItemOrder, tenant, settings);
    expect(payload.items).toHaveLength(3);
    expect(payload.items[0].descripcion).toBe("Arroz Costeño 5kg");
    expect(payload.items[0].cantidad).toBe(2);
  });

  it("usa moneda 1 (PEN) siempre", () => {
    const payload = buildBoleta(singleItemOrder, tenant, settings);
    expect(payload.moneda).toBe(1);
  });

  it("aplica porcentaje_de_igv=18 siempre", () => {
    const payload = buildBoleta(singleItemOrder, tenant, settings);
    expect(payload.porcentaje_de_igv).toBe(18);
  });

  it("incluye email cuando se provee", () => {
    const payload = buildBoleta(
      singleItemOrder,
      tenant,
      settings,
      "12345678",
      "cliente@test.com"
    );
    expect(payload.cliente_email).toBe("cliente@test.com");
  });

  it("usa 'CONSUMIDOR FINAL' si customerName está vacío", () => {
    const orderSinNombre: BuilderOrder = {
      ...singleItemOrder,
      customerName: "",
    };
    const payload = buildBoleta(orderSinNombre, tenant, settings);
    expect(payload.cliente_denominacion).toBe("CONSUMIDOR FINAL");
  });
});

// ── Tests buildFactura ────────────────────────────────────────────────────────

describe("buildFactura", () => {
  const customer = {
    ruc: "20601234568",
    razonSocial: "RESTAURANTE EL BUEN SABOR SRL",
    direccion: "Av. Ucayali 456",
    email: "contabilidad@restaurante.com",
  };

  it("genera payload con tipo_de_comprobante=1 (factura)", () => {
    const payload = buildFactura(singleItemOrder, tenant, settings, customer);
    expect(payload.tipo_de_comprobante).toBe(1);
    expect(payload.serie).toBe("F001");
  });

  it("usa tipo_de_documento=6 (RUC) para facturas", () => {
    const payload = buildFactura(singleItemOrder, tenant, settings, customer);
    expect(payload.cliente_tipo_de_documento).toBe(6);
    expect(payload.cliente_numero_de_documento).toBe("20601234568");
  });

  it("usa la razón social del cliente", () => {
    const payload = buildFactura(singleItemOrder, tenant, settings, customer);
    expect(payload.cliente_denominacion).toBe("RESTAURANTE EL BUEN SABOR SRL");
  });

  it("lanza error si el RUC no tiene 11 dígitos", () => {
    const badCustomer = { ...customer, ruc: "12345" };
    expect(() =>
      buildFactura(singleItemOrder, tenant, settings, badCustomer)
    ).toThrow(/RUC inválido/);
  });

  it("lanza error si el RUC tiene letras", () => {
    const badCustomer = { ...customer, ruc: "2060123456A" };
    expect(() =>
      buildFactura(singleItemOrder, tenant, settings, badCustomer)
    ).toThrow(/RUC inválido/);
  });

  it("calcula IGV 18% correctamente", () => {
    const payload = buildFactura(singleItemOrder, tenant, settings, customer);
    expect(payload.total_gravada).toBeCloseTo(100, 0);
    expect(payload.total_igv).toBeCloseTo(18, 0);
  });
});

// ── Tests buildNotaCredito ────────────────────────────────────────────────────

describe("buildNotaCredito", () => {
  it("genera nota de crédito tipo_de_comprobante=4", () => {
    const payload = buildNotaCredito({
      originalSeries: "B001",
      originalNumber: 5,
      originalTipoComprobante: 2,
      customerName: "Juan Pérez",
      customerDocTipo: 1,
      customerDoc: "12345678",
      total: 59,
      igv: 9,
      gravado: 50,
      items: [{ name: "Devolución", quantity: 1, price: 59, unit: "NIU" }],
      series: "BC01",
      nextNumber: 1,
      motivo: "Devolución de mercadería",
    });

    expect(payload.tipo_de_comprobante).toBe(4);
    expect(payload.serie).toBe("BC01");
    expect(payload.documento_que_se_modifica_serie).toBe("B001");
    expect(payload.documento_que_se_modifica_numero).toBe(5);
    expect(payload.motivo).toBe("Devolución de mercadería");
  });
});

// ── Tests buildBaja ───────────────────────────────────────────────────────────

describe("buildBaja", () => {
  it("genera payload de anulación operacion=generar_anulacion", () => {
    const payload = buildBaja(2, "B001", 10, "Error en emisión");
    expect(payload.operacion).toBe("generar_anulacion");
    expect(payload.tipo_de_comprobante).toBe(2);
    expect(payload.serie).toBe("B001");
    expect(payload.numero).toBe(10);
    expect(payload.motivo).toBe("Error en emisión");
  });
});
