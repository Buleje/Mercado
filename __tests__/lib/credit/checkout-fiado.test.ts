import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/feature-flags/fiado-digital", () => ({
  isFiadoDigitalPhase3Enabled: vi.fn(),
}));
vi.mock("@/lib/credit/installment-manager", () => ({
  getAvailableCredit: vi.fn(),
}));
vi.mock("@/lib/db/fiados.db", () => ({
  FiadosDB: { validateForNewFiado: vi.fn() },
}));

import { getFiadoCheckoutEligibility } from "@/lib/credit/checkout-fiado";
import { isFiadoDigitalPhase3Enabled } from "@/lib/feature-flags/fiado-digital";
import { getAvailableCredit } from "@/lib/credit/installment-manager";
import { FiadosDB } from "@/lib/db/fiados.db";

const T = "tenant-1";
const C = "+51999111222";

beforeEach(() => {
  vi.mocked(isFiadoDigitalPhase3Enabled).mockReturnValue(true);
  vi.mocked(getAvailableCredit).mockResolvedValue({
    creditLimit: 100,
    usedCredit: 20,
    availableCredit: 80,
    isActive: true,
  });
  vi.mocked(FiadosDB.validateForNewFiado).mockResolvedValue(null);
});

describe("getFiadoCheckoutEligibility", () => {
  it("flag apagado → no elegible", async () => {
    vi.mocked(isFiadoDigitalPhase3Enabled).mockReturnValue(false);
    const r = await getFiadoCheckoutEligibility(T, C, 30);
    expect(r.eligible).toBe(false);
  });

  it("perfil inactivo → no elegible con razón", async () => {
    vi.mocked(getAvailableCredit).mockResolvedValue({
      creditLimit: 0,
      usedCredit: 0,
      availableCredit: 0,
      isActive: false,
    });
    const r = await getFiadoCheckoutEligibility(T, C, 30);
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/no.*activ/i);
  });

  it("bloqueo por mora (validateForNewFiado) → no elegible, propaga el error", async () => {
    vi.mocked(FiadosDB.validateForNewFiado).mockResolvedValue({
      error: "Cliente bloqueado: tiene 3 fiados vencidos sin pagar",
      status: 400,
    });
    const r = await getFiadoCheckoutEligibility(T, C, 30);
    expect(r.eligible).toBe(false);
    expect(r.reason).toContain("vencidos");
  });

  it("elegible → devuelve availableCredit y dueDate", async () => {
    const r = await getFiadoCheckoutEligibility(T, C, 30);
    expect(r.eligible).toBe(true);
    expect(r.availableCredit).toBe(80);
    expect(r.dueDate).toBeInstanceOf(Date);
  });

  it("pasa el creditLimit del perfil a validateForNewFiado", async () => {
    await getFiadoCheckoutEligibility(T, C, 30);
    expect(FiadosDB.validateForNewFiado).toHaveBeenCalledWith(T, C, 30, 100);
  });
});
