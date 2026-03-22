/**
 * __tests__/order-utils-extended.test.ts
 *
 * Unit tests for lib/order-utils.ts — googleMapsUrl, formatWhatsAppMessage.
 * Canvas-dependent functions (generateReceiptBlob, sendOrder) require a real DOM
 * and are excluded from this Node environment test suite.
 */

import { describe, it, expect } from "vitest";
import { googleMapsUrl, formatWhatsAppMessage } from "@/lib/order-utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

const baseCustomer = {
  name: "Juan Pérez",
  phone: "987654321",
  location: "Jr. Lima 123, Pucallpa",
  reference: "Al lado de la farmacia",
};

const baseItems = [
  { id: 1, name: "Arroz 1kg", price: 5.5, quantity: 2, unit: "kg", image: "" },
  { id: 2, name: "Aceite 1L", price: 8.0, quantity: 1, unit: "und", image: "" },
];

// ── googleMapsUrl ─────────────────────────────────────────────────────────────

describe("googleMapsUrl", () => {
  it("generates GPS-based URL when location contains GPS coordinates", () => {
    const url = googleMapsUrl("GPS: -8.3791500, -74.5539200");
    expect(url).toBe("https://maps.google.com/maps?q=-8.3791500,-74.5539200");
  });

  it("generates encoded search URL when location is a text address", () => {
    const url = googleMapsUrl("Jr. Lima 123, Pucallpa");
    expect(url).toContain("https://maps.google.com/maps?q=");
    expect(url).toContain(encodeURIComponent("Jr. Lima 123, Pucallpa"));
  });

  it("handles empty string as a text address", () => {
    const url = googleMapsUrl("");
    expect(url).toContain("https://maps.google.com/maps?q=");
  });

  it("handles GPS with negative latitude and longitude", () => {
    const url = googleMapsUrl("GPS: -12.046374, -77.042793");
    expect(url).toContain("-12.046374");
    expect(url).toContain("-77.042793");
  });

  it("is case-sensitive on GPS prefix — falls back to text when lowercase", () => {
    // The regex matches "GPS:" exactly
    const url = googleMapsUrl("gps: -8.37, -74.55");
    expect(url).toContain(encodeURIComponent("gps: -8.37, -74.55"));
  });
});

// ── formatWhatsAppMessage ─────────────────────────────────────────────────────

describe("formatWhatsAppMessage", () => {
  it("includes the customer name in the message", () => {
    const msg = formatWhatsAppMessage(baseCustomer, baseItems, 19.0);
    expect(msg).toContain("Juan Pérez");
  });

  it("includes the customer location", () => {
    const msg = formatWhatsAppMessage(baseCustomer, baseItems, 19.0);
    expect(msg).toContain("Jr. Lima 123, Pucallpa");
  });

  it("includes the total in S/", () => {
    const msg = formatWhatsAppMessage(baseCustomer, baseItems, 19.0);
    expect(msg).toContain("S/ 19.00");
  });

  it("includes all item names", () => {
    const msg = formatWhatsAppMessage(baseCustomer, baseItems, 19.0);
    expect(msg).toContain("Arroz 1kg");
    expect(msg).toContain("Aceite 1L");
  });

  it("shows correct subtotal per item (price × quantity)", () => {
    const msg = formatWhatsAppMessage(baseCustomer, baseItems, 19.0);
    // Arroz: 5.5 * 2 = 11.00
    expect(msg).toContain("11.00");
    // Aceite: 8.0 * 1 = 8.00
    expect(msg).toContain("8.00");
  });

  it("includes a Google Maps link", () => {
    const msg = formatWhatsAppMessage(baseCustomer, baseItems, 19.0);
    expect(msg).toContain("maps.google.com");
  });

  it("includes the header 'Bodega San Martin'", () => {
    const msg = formatWhatsAppMessage(baseCustomer, baseItems, 19.0);
    expect(msg).toContain("Bodega San Martin");
  });

  it("formats total with exactly 2 decimal places", () => {
    const msg = formatWhatsAppMessage(baseCustomer, baseItems, 7);
    expect(msg).toContain("S/ 7.00");
  });

  it("handles a single item correctly", () => {
    const singleItem = [baseItems[0]];
    const msg = formatWhatsAppMessage(baseCustomer, singleItem, 11.0);
    expect(msg).toContain("Arroz 1kg x2");
  });

  it("includes the reference field", () => {
    const msg = formatWhatsAppMessage(baseCustomer, baseItems, 19.0);
    expect(msg).toContain("Al lado de la farmacia");
  });
});
