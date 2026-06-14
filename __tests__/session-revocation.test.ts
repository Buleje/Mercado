import { describe, it, expect } from "vitest";
import { revokeSessionsBefore, isSessionRevoked } from "@/lib/auth/session-revocation";

// Replica del formato real de jti (lib/session.ts): `${Date.now().toString(36)}-${uuid8}`.
function jtiAt(ms: number) {
  return `${ms.toString(36)}-abcd1234`;
}

describe("session-revocation (ADR-133 logout-all)", () => {
  const now = 1_780_000_000_000; // timestamp fijo (no Date.now en test)

  it("no revoca si no hay corte registrado", () => {
    expect(isSessionRevoked(jtiAt(now), "tNone", "uNone")).toBe(false);
  });

  it("revoca tokens emitidos ANTES del corte", () => {
    revokeSessionsBefore("t1", "u1", now);
    expect(isSessionRevoked(jtiAt(now - 60_000), "t1", "u1")).toBe(true);
  });

  it("NO revoca tokens emitidos DESPUÉS del corte (nuevo login)", () => {
    revokeSessionsBefore("t2", "u2", now);
    expect(isSessionRevoked(jtiAt(now + 1_000), "t2", "u2")).toBe(false);
  });

  it("el corte es por (tenant, usuario) — no afecta a otros", () => {
    revokeSessionsBefore("t3", "u3", now);
    expect(isSessionRevoked(jtiAt(now - 1), "t3", "uOtro")).toBe(false);
    expect(isSessionRevoked(jtiAt(now - 1), "tOtro", "u3")).toBe(false);
  });

  it("fail-open: jti sin timestamp o ausente no se bloquea", () => {
    revokeSessionsBefore("t4", "u4", now);
    expect(isSessionRevoked(undefined, "t4", "u4")).toBe(false);
    expect(isSessionRevoked("", "t4", "u4")).toBe(false);
  });

  it("tolera tenant/usuario indefinidos", () => {
    expect(isSessionRevoked(jtiAt(now), undefined, "u")).toBe(false);
    expect(isSessionRevoked(jtiAt(now), "t", undefined)).toBe(false);
  });
});
