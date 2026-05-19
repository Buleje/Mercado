/**
 * lib/integrations/reniec.test.ts — Unit tests for RENIEC DNI verification.
 *
 * Audit 2026-05-17 TD-058: cubre el path mock (default sin credenciales)
 * + el helper namesMatch (anti-suplantación). Las llamadas reales a
 * apisperu/decolecta no se testean acá — eso requiere fixtures HTTP
 * y va en tests/integration/ con vi.stubGlobal("fetch").
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock cache para no contaminar entre tests
vi.mock("@/lib/cache", () => ({
  cacheStore: {
    get: vi.fn(() => null),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { verifyDni, namesMatch } from "@/lib/integrations/reniec";

describe("verifyDni — formato", () => {
  beforeEach(() => {
    delete process.env.RENIEC_PROVIDER;
    delete process.env.RENIEC_API_TOKEN;
  });

  it("rechaza DNI con menos de 8 dígitos", async () => {
    const r = await verifyDni("1234567");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_format");
  });

  it("rechaza DNI con letras", async () => {
    const r = await verifyDni("1234567a");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_format");
  });

  it("acepta DNI de 8 dígitos en modo mock", async () => {
    const r = await verifyDni("12345678");
    expect(r.ok).toBe(true);
    expect(r.source).toBe("mock");
  });
});

describe("verifyDni — provider unsupported defaults to mock", () => {
  beforeEach(() => {
    process.env.RENIEC_PROVIDER = "unknown-provider";
  });

  it("cae a mock con provider desconocido", async () => {
    const r = await verifyDni("87654321");
    expect(r.ok).toBe(true);
    expect(r.source).toBe("mock");
  });
});

describe("namesMatch — anti-suplantación tolerante", () => {
  it("match exacto", () => {
    expect(namesMatch("Juan Pérez", "Juan Pérez")).toBe(true);
  });

  it("match con orden distinto (RENIEC: NOMBRES + APELLIDOS)", () => {
    expect(namesMatch("JUAN PEREZ GOMEZ", "Pérez Gómez Juan")).toBe(true);
  });

  it("match con acentos diferentes", () => {
    expect(namesMatch("Maria Lopez", "MARÍA LÓPEZ")).toBe(true);
  });

  it("match con apellido materno omitido (70% threshold)", () => {
    expect(namesMatch("JUAN PEREZ GOMEZ", "Juan Pérez")).toBe(true);
  });

  it("no match si nombre completamente distinto", () => {
    expect(namesMatch("Juan Pérez", "Carlos Rodríguez")).toBe(false);
  });

  it("no match si solo coincide un token genérico", () => {
    expect(namesMatch("JUAN ALBERTO PEREZ GOMEZ", "MARIA")).toBe(false);
  });

  it("vacío en cualquier lado → false", () => {
    expect(namesMatch("", "Juan")).toBe(false);
    expect(namesMatch("Juan", "")).toBe(false);
  });
});
