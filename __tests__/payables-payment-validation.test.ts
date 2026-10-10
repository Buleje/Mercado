import { describe, it, expect } from "vitest";
import { remainingBalance, exceedsRemaining } from "@/lib/payables/payment-validation";

describe("remainingBalance", () => {
  it("resta lo pagado del total", () => {
    expect(remainingBalance(100, 30)).toBe(70);
  });
  it("nunca es negativo (sobre-pago previo)", () => {
    expect(remainingBalance(100, 120)).toBe(0);
  });
});

describe("exceedsRemaining (anti sobre-pago)", () => {
  it("permite pagar exactamente el saldo", () => {
    expect(exceedsRemaining(70, 100, 30)).toBe(false);
  });
  it("rechaza pagar más que el saldo", () => {
    expect(exceedsRemaining(71, 100, 30)).toBe(true);
  });
  it("tolera el redondeo de centavos", () => {
    expect(exceedsRemaining(70.004, 100, 30)).toBe(false);
  });
  it("rechaza cualquier pago sobre una cuenta ya saldada", () => {
    expect(exceedsRemaining(0.01, 100, 100)).toBe(true);
  });
});
