import { describe, it, expect } from "vitest";
import { constantTimeStringEqual } from "@/lib/constant-time";

describe("constantTimeStringEqual (CSRF double-submit)", () => {
  const token = "a".repeat(64); // 64 hex chars como los tokens reales

  it("acepta tokens idénticos", () => {
    expect(constantTimeStringEqual(token, token)).toBe(true);
  });

  it("rechaza tokens distintos de igual longitud", () => {
    const other = "a".repeat(63) + "b";
    expect(constantTimeStringEqual(token, other)).toBe(false);
  });

  it("rechaza tokens de distinta longitud sin recorrer (early length check)", () => {
    expect(constantTimeStringEqual(token, "a".repeat(32))).toBe(false);
  });

  it("una sola posición distinta basta para rechazar", () => {
    const a = "deadbeef".repeat(8);
    const b = a.slice(0, 40) + "X" + a.slice(41);
    expect(constantTimeStringEqual(a, b)).toBe(false);
  });
});
