/**
 * Eval: Delivery fee based on distance/zone.
 * Contract test: defines expected delivery fee logic for Pucallpa zones.
 * Business rule: free delivery above threshold, zone-based fee otherwise.
 */
import { describe, it, expect } from "vitest";

type DeliveryZone = "centro" | "periferia" | "rural";

const DELIVERY_FEES: Record<DeliveryZone, number> = {
  centro: 3.0,
  periferia: 5.0,
  rural: 8.0,
};
const FREE_DELIVERY_THRESHOLD = 50;

function calculateDeliveryFee(zone: DeliveryZone, subtotal: number): number {
  if (subtotal >= FREE_DELIVERY_THRESHOLD) return 0;
  return DELIVERY_FEES[zone];
}

describe("Checkout > Delivery Fee", () => {
  it("should charge S/3 for centro zone under threshold", () => {
    expect(calculateDeliveryFee("centro", 30)).toBe(3);
  });

  it("should charge S/5 for periferia zone", () => {
    expect(calculateDeliveryFee("periferia", 25)).toBe(5);
  });

  it("should charge S/8 for rural zone", () => {
    expect(calculateDeliveryFee("rural", 10)).toBe(8);
  });

  it("should be free above S/50 threshold", () => {
    expect(calculateDeliveryFee("centro", 50)).toBe(0);
    expect(calculateDeliveryFee("periferia", 75)).toBe(0);
    expect(calculateDeliveryFee("rural", 100)).toBe(0);
  });

  it("should not be free at S/49.99", () => {
    expect(calculateDeliveryFee("centro", 49.99)).toBe(3);
  });
});
