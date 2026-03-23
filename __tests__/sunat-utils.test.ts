/**
 * lib/sunat.ts — unit tests
 * Cubre: calculateIGV, validateRUC, validateDNI, generateXML, generateCorrelativo,
 *        diferencias boleta/factura, moneda PEN vs USD
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// prisma se usa solo en generateCorrelativo — mockear para tests síncronos
const { mockFindFirst, mockCreate } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockCreate: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    activityLog: {
      findFirst: mockFindFirst,
      create: mockCreate,
    },
  },
}));

import {
  calculateIGV,
  validateRUC,
  validateDNI,
  generateXML,
  generateCorrelativo,
  type SunatDocument,
} from "@/lib/sunat";

// ── 1–3. calculateIGV ─────────────────────────────────────────────────────────

describe("calculateIGV", () => {
  // 1. Subtotal normal → 18% IGV correcto
  it("calcula IGV correcto para precio que incluye 18%", () => {
    const result = calculateIGV(118);
    expect(result.igv).toBeCloseTo(18, 1);
    expect(result.gravado).toBeCloseTo(100, 1);
    expect(result.total).toBe(118);
  });

  // 2. Subtotal 0 → todo 0
  it("retorna todo cero cuando el total es 0", () => {
    const result = calculateIGV(0);
    expect(result.gravado).toBe(0);
    expect(result.igv).toBe(0);
    expect(result.total).toBe(0);
  });

  // 3. Subtotal negativo → los campos son numéricos (no explota)
  it("no lanza excepción con total negativo — retorna valores numéricos", () => {
    const result = calculateIGV(-59);
    expect(typeof result.gravado).toBe("number");
    expect(typeof result.igv).toBe("number");
    expect(typeof result.total).toBe("number");
  });
});

// ── 4–7. validateRUC ─────────────────────────────────────────────────────────

describe("validateRUC", () => {
  // 4. RUC válido persona natural (10xxxxxxxxx)
  it("acepta RUC de persona natural que empieza en 10", () => {
    expect(validateRUC("10456789012")).toBe(true);
  });

  // 5. RUC válido empresa (20xxxxxxxxx)
  it("acepta RUC de empresa que empieza en 20", () => {
    expect(validateRUC("20123456789")).toBe(true);
  });

  // 6. RUC inválido — solo 9 dígitos
  it("rechaza RUC con menos de 11 dígitos", () => {
    expect(validateRUC("201234567")).toBe(false);
  });

  // 7. RUC inválido — contiene letras
  it("rechaza RUC con letras", () => {
    expect(validateRUC("2012345678A")).toBe(false);
  });
});

// ── 8–10. validateDNI ────────────────────────────────────────────────────────

describe("validateDNI", () => {
  // 8. DNI válido — 8 dígitos
  it("acepta DNI de 8 dígitos numéricos", () => {
    expect(validateDNI("12345678")).toBe(true);
  });

  // 9. DNI inválido — 7 dígitos
  it("rechaza DNI con solo 7 dígitos", () => {
    expect(validateDNI("1234567")).toBe(false);
  });

  // 10. DNI inválido — contiene letras
  it("rechaza DNI con letras", () => {
    expect(validateDNI("1234567A")).toBe(false);
  });
});

// ── 11–13. generateXML ───────────────────────────────────────────────────────

const sampleDoc: SunatDocument = {
  tipo: "boleta",
  serie: "B001",
  numero: 42,
  fecha: "2026-03-22",
  cliente: { nombre: "Juan Pérez", dni: "12345678" },
  items: [
    { descripcion: "Arroz 5kg", cantidad: 1, precioUnit: 25.0, igv: 3.81 },
    { descripcion: "Aceite 1L", cantidad: 2, precioUnit: 17.0, igv: 5.19 },
  ],
  totalGravado: 47.46,
  totalIgv: 9.0,
  totalVenta: 59.0,
  moneda: "PEN",
};

describe("generateXML", () => {
  beforeEach(() => {
    process.env.RUC_EMISOR = "20123456789";
    process.env.RAZON_SOCIAL_EMISOR = "Bodega San Martín";
  });

  // 11. Genera string con tags UBL esperados
  it("incluye tags UBL 2.1 estándar en el XML generado", () => {
    const xml = generateXML(sampleDoc);
    expect(xml).toContain("cbc:ID");
    expect(xml).toContain("cbc:TaxAmount");
    expect(xml).toContain("cbc:PayableAmount");
    expect(xml).toContain("cac:AccountingCustomerParty");
    expect(xml).toContain("cac:InvoiceLine");
    expect(xml).toContain("UBLVersionID>2.1");
  });

  // 12. Incluye datos del cliente
  it("incluye nombre y número de documento del cliente", () => {
    const xml = generateXML(sampleDoc);
    expect(xml).toContain("Juan Pérez");
    expect(xml).toContain("12345678");
  });

  // 13. Incluye items con IGV
  it("incluye cada item con su descripción e IGV", () => {
    const xml = generateXML(sampleDoc);
    expect(xml).toContain("Arroz 5kg");
    expect(xml).toContain("3.81");
    expect(xml).toContain("Aceite 1L");
    expect(xml).toContain("5.19");
  });
});

// ── 14. Boleta vs Factura — serie diferente ───────────────────────────────────

describe("SunatDocument serie por tipo", () => {
  beforeEach(() => {
    process.env.RUC_EMISOR = "20123456789";
    process.env.RAZON_SOCIAL_EMISOR = "Bodega San Martín";
  });

  // 14. Boleta (03/B001) y factura (01/F001) tienen identificadores distintos en el XML
  it("boleta y factura generan IDs de serie distintos en el XML", () => {
    const xmlBoleta = generateXML({ ...sampleDoc, tipo: "boleta", serie: "B001" });
    const xmlFactura = generateXML({
      ...sampleDoc,
      tipo: "factura",
      serie: "F001",
      cliente: { nombre: "Empresa SAC", ruc: "20123456789" },
    });

    expect(xmlBoleta).toContain("B001-00000042");
    expect(xmlFactura).toContain("F001-00000042");
    // Boleta → tipoDoc 03, Factura → tipoDoc 01
    expect(xmlBoleta).toContain(">03<");
    expect(xmlFactura).toContain(">01<");
  });
});

// ── 15. Moneda PEN vs USD ─────────────────────────────────────────────────────

describe("moneda en comprobante", () => {
  beforeEach(() => {
    process.env.RUC_EMISOR = "20123456789";
    process.env.RAZON_SOCIAL_EMISOR = "Bodega San Martín";
  });

  // 15. PEN por defecto y USD cuando se especifica
  it("usa PEN o USD según lo indicado en el documento", () => {
    const xmlPEN = generateXML({ ...sampleDoc, moneda: "PEN" });
    const xmlUSD = generateXML({ ...sampleDoc, moneda: "USD" });

    expect(xmlPEN).toContain('currencyID="PEN"');
    expect(xmlUSD).toContain('currencyID="USD"');
    expect(xmlPEN).not.toContain('currencyID="USD"');
  });
});

// ── Extra. generateCorrelativo ───────────────────────────────────────────────

describe("generateCorrelativo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna '00000001' cuando no hay registros previos", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({});

    const correlativo = await generateCorrelativo("main", "boleta");
    expect(correlativo).toBe("00000001");
  });

  it("incrementa desde el último correlativo registrado", async () => {
    mockFindFirst.mockResolvedValue({ entityId: "5" });
    mockCreate.mockResolvedValue({});

    const correlativo = await generateCorrelativo("main", "boleta");
    expect(correlativo).toBe("00000006");
  });

  it("usa serie B001 para boleta y F001 para factura", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({});

    await generateCorrelativo("main", "boleta");
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ entity: "B001" }) }),
    );

    await generateCorrelativo("main", "factura");
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ entity: "F001" }) }),
    );
  });
});
