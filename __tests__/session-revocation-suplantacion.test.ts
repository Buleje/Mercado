import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * «Revocar todas las sesiones» del superadmin también corta la vista de tienda
 * (suplantación, hasta 60 min). Antes sólo cortaba la sesión de plataforma.
 */

let corte = 0;
vi.mock("@/lib/superadmin-revocation", () => ({ getMinIssuedAt: () => corte }));

import { isSessionRevoked } from "@/lib/auth/session-revocation";

const jtiEn = (ms: number) => `${ms.toString(36)}-abcd1234`;
const VISTA = "impersonated-by:superadmin";

describe("isSessionRevoked · vista de tienda y corte global del superadmin", () => {
  beforeEach(() => {
    corte = 0;
  });

  it("sin corte global, la vista sigue viva", () => {
    expect(isSessionRevoked(jtiEn(Date.now()), "t1", VISTA)).toBe(false);
  });

  it("vista emitida antes del corte → revocada", () => {
    const emitida = Date.now() - 60_000;
    corte = Date.now();
    expect(isSessionRevoked(jtiEn(emitida), "t1", VISTA)).toBe(true);
  });

  it("vista emitida después del corte → sigue", () => {
    corte = Date.now() - 60_000;
    expect(isSessionRevoked(jtiEn(Date.now()), "t1", VISTA)).toBe(false);
  });

  it("vista sin hora en el jti con corte activo → revocada", () => {
    corte = Date.now();
    expect(isSessionRevoked(undefined, "t1", VISTA)).toBe(true);
  });

  it("el corte del superadmin no toca a los usuarios reales de la tienda", () => {
    const emitida = Date.now() - 60_000;
    corte = Date.now();
    expect(isSessionRevoked(jtiEn(emitida), "t1", "cajero1")).toBe(false);
  });
});
