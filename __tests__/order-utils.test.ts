import { describe, it, expect } from "vitest";
import { googleMapsUrl, formatWhatsAppMessage } from "@/lib/order-utils";

describe("googleMapsUrl", () => {
  it("creates url from GPS coordinates", () => {
    const url = googleMapsUrl("GPS: -8.38001, -74.53551");
    expect(url).toBe("https://maps.google.com/maps?q=-8.38001,-74.53551");
  });

  it("creates url from text address", () => {
    const url = googleMapsUrl("Pucallpa Centro");
    expect(url).toContain("maps.google.com");
    expect(url).toContain("Pucallpa%20Centro");
  });
});

describe("formatWhatsAppMessage", () => {
  it("formats a complete order message", () => {
    const customer = {
      name: "Juan",
      phone: "999888777",
      location: "GPS: -8.38001, -74.53551",
      reference: "Cerca del mercado",
    };
    const items = [
      { id: 1, name: "Arroz", price: 3.5, quantity: 2, unit: "kg", image: "" },
    ];
    const msg = formatWhatsAppMessage(customer, items, 7.0);
    expect(msg).toContain("Juan");
    expect(msg).toContain("Arroz");
    expect(msg).toContain("S/ 7.00");
    expect(msg).toContain("maps.google.com");
  });
});
