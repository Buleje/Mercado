import { describe, it, expect } from "vitest";
import { validatePhone } from "@/components/checkout/parts/phone-validation";

describe("validatePhone", () => {
  it("acepta número vacío como inválido sin hint", () => {
    const r = validatePhone("");
    expect(r.valid).toBe(false);
    expect(r.hint).toBe("");
  });

  it("muestra dígitos faltantes con color warning del DS", () => {
    // Brandon 2026-05-17: migración a tokens DS (ADR-069-075). "amber" Tailwind
    // → var(--data-warning-500). Tests success/error ya usan el token.
    const r = validatePhone("987");
    expect(r.valid).toBe(false);
    expect(r.hint).toContain("6");
    expect(r.color).toContain("data-warning");
  });

  it("acepta número de 9 dígitos que empieza con 9", () => {
    const r = validatePhone("987654321");
    expect(r.valid).toBe(true);
    // La función usa tokens CSS del DS: var(--data-success-600), no clases Tailwind
    expect(r.color).toContain("data-success");
  });

  it("rechaza 9 dígitos que no empiezan con 9", () => {
    const r = validatePhone("123456789");
    expect(r.valid).toBe(false);
    expect(r.hint).toContain("Debe empezar con 9");
    expect(r.color).toContain("data-error");
  });

  it("ignora caracteres no numéricos al contar", () => {
    const r = validatePhone("987-654-321");
    expect(r.valid).toBe(true);
  });

  it("rechaza más de 9 dígitos", () => {
    const r = validatePhone("9876543210");
    expect(r.valid).toBe(false);
    expect(r.color).toContain("data-error");
  });
});
