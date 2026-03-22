/**
 * __tests__/timing-safe.test.ts
 *
 * Unit tests for lib/timing-safe.ts — timingSafeCompare.
 * The function must return true only when both strings are identical,
 * and must not throw for any input combination.
 */

import { describe, it, expect } from "vitest";
import { timingSafeCompare } from "@/lib/timing-safe";

describe("timingSafeCompare", () => {
  // ── Positive cases ─────────────────────────────────────────────────────────

  it("returns true for two identical strings", () => {
    expect(timingSafeCompare("secret123", "secret123")).toBe(true);
  });

  it("returns true for empty strings", () => {
    expect(timingSafeCompare("", "")).toBe(true);
  });

  it("returns true for long identical strings", () => {
    const s = "a".repeat(512);
    expect(timingSafeCompare(s, s)).toBe(true);
  });

  it("returns true for strings with special characters", () => {
    const s = "S/!@#$%^&*()_+áéíóú";
    expect(timingSafeCompare(s, s)).toBe(true);
  });

  // ── Negative cases ─────────────────────────────────────────────────────────

  it("returns false when strings differ by one character", () => {
    expect(timingSafeCompare("secret123", "secret124")).toBe(false);
  });

  it("returns false when lengths differ", () => {
    expect(timingSafeCompare("abc", "abcd")).toBe(false);
  });

  it("returns false when one string is empty", () => {
    expect(timingSafeCompare("", "notempty")).toBe(false);
    expect(timingSafeCompare("notempty", "")).toBe(false);
  });

  it("returns false for case-different strings", () => {
    expect(timingSafeCompare("Secret", "secret")).toBe(false);
  });

  it("returns false when trailing whitespace differs", () => {
    expect(timingSafeCompare("token ", "token")).toBe(false);
  });

  // ── Type-safety guards ─────────────────────────────────────────────────────

  it("returns false when first argument is not a string", () => {
    // @ts-expect-error — intentional type violation for runtime safety test
    expect(timingSafeCompare(null, "abc")).toBe(false);
  });

  it("returns false when second argument is not a string", () => {
    // @ts-expect-error — intentional type violation for runtime safety test
    expect(timingSafeCompare("abc", undefined)).toBe(false);
  });

  it("returns false when both arguments are non-strings", () => {
    // @ts-expect-error — intentional type violation for runtime safety test
    expect(timingSafeCompare(123, 123)).toBe(false);
  });

  // ── Does not throw ─────────────────────────────────────────────────────────

  it("does not throw for any combination", () => {
    const values = ["", "a", "abc", "a".repeat(100)];
    for (const a of values) {
      for (const b of values) {
        expect(() => timingSafeCompare(a, b)).not.toThrow();
      }
    }
  });
});
