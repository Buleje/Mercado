import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * «Revocar todas las sesiones» del superadmin también corta la vista de tienda
 * (suplantación, hasta 60 min). Antes sólo cortaba la sesión de plataforma.
 */

let corte = 0;
vi.mock("@/lib/superadmin-revocation", () => ({ getMinIssuedAt: () => corte }));

import { isSessionRevoked, revocarVistasDeSuperadmin } from "@/lib/auth/session-revocation";

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

describe("isSessionRevoked · salir del superadmin cierra SUS vistas (18-10)", () => {
  beforeEach(() => {
    corte = 0;
  });

  it("vista emitida antes del corte de su superadmin → revocada, en cualquier tienda", () => {
    const emitida = Date.now() - 60_000;
    revocarVistasDeSuperadmin("sa-uno");
    expect(isSessionRevoked(jtiEn(emitida), "t1", "impersonated-by:sa-uno")).toBe(true);
    expect(isSessionRevoked(jtiEn(emitida), "t2", "impersonated-by:sa-uno")).toBe(true);
  });

  it("vista de OTRO superadmin → sigue", () => {
    revocarVistasDeSuperadmin("sa-dos");
    expect(isSessionRevoked(jtiEn(Date.now() - 60_000), "t1", "impersonated-by:sa-tres")).toBe(false);
  });

  it("usuario real de la tienda (aunque se llame como el superadmin) → nunca", () => {
    revocarVistasDeSuperadmin("sa-cuatro");
    expect(isSessionRevoked(jtiEn(Date.now() - 60_000), "t1", "sa-cuatro")).toBe(false);
    expect(isSessionRevoked(jtiEn(Date.now() - 60_000), "t1", "cajero1")).toBe(false);
  });

  it("vista emitida después del corte (volvió a entrar) → sigue", () => {
    revocarVistasDeSuperadmin("sa-cinco", Date.now() - 60_000);
    expect(isSessionRevoked(jtiEn(Date.now()), "t1", "impersonated-by:sa-cinco")).toBe(false);
  });

  it("vista sin hora en el jti con corte → revocada; un corte más viejo no pisa al nuevo", () => {
    const ahora = Date.now();
    revocarVistasDeSuperadmin("sa-seis", ahora);
    revocarVistasDeSuperadmin("sa-seis", ahora - 120_000);
    expect(isSessionRevoked(undefined, "t1", "impersonated-by:sa-seis")).toBe(true);
    expect(isSessionRevoked(jtiEn(ahora - 60_000), "t1", "impersonated-by:sa-seis")).toBe(true);
  });
});
