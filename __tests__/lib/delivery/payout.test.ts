import { describe, it, expect } from "vitest";
import {
  MIN_PAYOUT_SOLES,
  round2,
  computeAvailable,
  validatePayoutAmount,
  payoutRequestSchema,
} from "@/lib/delivery/payout";

describe("round2", () => {
  it("redondea a 2 decimales", () => {
    expect(round2(5.005)).toBe(5.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(10)).toBe(10);
  });
});

describe("computeAvailable", () => {
  it("resta retiros comprometidos de las ganancias de por vida", () => {
    expect(computeAvailable(100, 30)).toBe(70);
  });

  it("nunca devuelve negativo", () => {
    expect(computeAvailable(20, 50)).toBe(0);
  });

  it("redondea a 2 decimales", () => {
    expect(computeAvailable(100.555, 0.005)).toBe(100.55);
  });

  it("con cero ganancias da cero", () => {
    expect(computeAvailable(0, 0)).toBe(0);
  });
});

describe("validatePayoutAmount", () => {
  it("rechaza monto cero o negativo", () => {
    expect(validatePayoutAmount(0, 100)).toEqual({
      ok: false,
      error: "El monto debe ser mayor a cero.",
    });
    expect(validatePayoutAmount(-5, 100).ok).toBe(false);
  });

  it("rechaza por debajo del mínimo", () => {
    const r = validatePayoutAmount(MIN_PAYOUT_SOLES - 1, 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(`S/ ${MIN_PAYOUT_SOLES}`);
  });

  it("rechaza si excede el disponible", () => {
    const r = validatePayoutAmount(120, 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("100.00");
  });

  it("acepta el mínimo exacto", () => {
    expect(validatePayoutAmount(MIN_PAYOUT_SOLES, 100)).toEqual({
      ok: true,
      amount: MIN_PAYOUT_SOLES,
    });
  });

  it("acepta retirar exactamente todo el disponible", () => {
    expect(validatePayoutAmount(100, 100)).toEqual({ ok: true, amount: 100 });
  });

  it("redondea el monto aceptado a 2 decimales", () => {
    const r = validatePayoutAmount(50.005, 100);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.amount).toBe(50.01);
  });
});

describe("payoutRequestSchema", () => {
  it("acepta entrada válida", () => {
    const r = payoutRequestSchema.safeParse({
      amount: 50,
      yapeNumber: "987654321",
    });
    expect(r.success).toBe(true);
  });

  it("recorta espacios del número Yape", () => {
    const r = payoutRequestSchema.safeParse({
      amount: 50,
      yapeNumber: "  987654321  ",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.yapeNumber).toBe("987654321");
  });

  it("rechaza número Yape que no empieza con 9", () => {
    const r = payoutRequestSchema.safeParse({
      amount: 50,
      yapeNumber: "187654321",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza número Yape con menos de 9 dígitos", () => {
    const r = payoutRequestSchema.safeParse({
      amount: 50,
      yapeNumber: "98765",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza monto no positivo", () => {
    const r = payoutRequestSchema.safeParse({ amount: 0, yapeNumber: "987654321" });
    expect(r.success).toBe(false);
  });
});
