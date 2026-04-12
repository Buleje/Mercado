/**
 * __tests__/auth/totp.test.ts
 *
 * Tests unitarios para lib/auth/totp.ts.
 *
 * Estrategia:
 *  1. Vectores derivados del RFC 6238 Appendix B (SHA-1, seeds conocidos).
 *  2. Tests de propiedades: formato, longitud, aceptación de ventana.
 *  3. Tests de rechazo: tokens malformados, secret inválido, fuera de ventana.
 *
 * Nota sobre los vectores RFC 6238:
 *   El RFC publica el seed ASCII "12345678901234567890" codificado en base32
 *   como "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" y define códigos TOTP
 *   para timestamps Unix específicos con step=30s.
 *
 * Referencia: https://datatracker.ietf.org/doc/html/rfc6238#appendix-B
 */

import { describe, it, expect } from "vitest";
import {
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  buildOtpauthUri,
} from "@/lib/auth/totp";

// ── Constante del RFC 6238 Appendix B ─────────────────────────────────────────
//
// El seed ASCII "12345678901234567890" (20 bytes) codificado en Base32:
//   cada carácter ASCII es 1 byte → 20 bytes → base32 de 32 chars.
// Verificado manualmente byte a byte:
//   "1" = 0x31, "2" = 0x32, … "0" = 0x30
//   Base32: GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // gitleaks:allow (RFC 6238 test vector, not a real secret)

// Vectores RFC 6238 Appendix B (SHA-1, 6 dígitos, step=30):
//   T (Unix)     | T//30 (step) | Expected OTP
//   59           | 1            | 287082
//   1111111109   | 37037036     | 081804
//   1111111111   | 37037037     | 050471
//   1234567890   | 41152263     | 005924
//   2000000000   | 66666666     | 279037
//   20000000000  | 666666666    | 353130   ← timestamp > 2^31, prueba bigint
const RFC_VECTORS: Array<{ timeUnixSec: number; expected: string }> = [
  { timeUnixSec: 59, expected: "287082" },
  { timeUnixSec: 1111111109, expected: "081804" },
  { timeUnixSec: 1111111111, expected: "050471" },
  { timeUnixSec: 1234567890, expected: "005924" },
  { timeUnixSec: 2000000000, expected: "279037" },
  // timestamp > 2^32 — valida que BigInt se maneje correctamente
  { timeUnixSec: 20000000000, expected: "353130" },
];

// ── generateTotpSecret ────────────────────────────────────────────────────────

describe("generateTotpSecret", () => {
  it("genera un string no vacío", () => {
    const secret = generateTotpSecret();
    expect(typeof secret).toBe("string");
    expect(secret.length).toBeGreaterThan(0);
  });

  it("solo contiene caracteres Base32 válidos (A-Z 2-7)", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
  });

  it("genera secrets distintos en cada llamada (aleatoriedad)", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
  });

  it("tiene al menos 32 caracteres (≥20 bytes de entropía)", () => {
    const secret = generateTotpSecret();
    // 20 bytes → 32 chars en base32 (sin padding)
    expect(secret.length).toBeGreaterThanOrEqual(32);
  });
});

// ── generateTotpCode — vectores RFC 6238 ─────────────────────────────────────

describe("generateTotpCode — vectores RFC 6238 Appendix B", () => {
  for (const { timeUnixSec, expected } of RFC_VECTORS) {
    it(`T=${timeUnixSec}s → ${expected}`, () => {
      const code = generateTotpCode(RFC_SECRET, timeUnixSec);
      expect(code).toBe(expected);
    });
  }

  it("devuelve exactamente 6 dígitos", () => {
    const code = generateTotpCode(RFC_SECRET, 59);
    expect(code).toMatch(/^\d{6}$/);
  });

  it("código del step actual difiere del step anterior", () => {
    const now = Math.floor(Date.now() / 1000);
    const step = Math.floor(now / 30);
    const current = generateTotpCode(RFC_SECRET, step * 30);
    const previous = generateTotpCode(RFC_SECRET, (step - 2) * 30);
    // No son iguales en la práctica (puede fallar 1/1.000.000 veces por colisión)
    expect(current).not.toBe(previous);
  });
});

// ── verifyTotpCode ────────────────────────────────────────────────────────────

describe("verifyTotpCode", () => {
  it("acepta el código correcto del step actual", () => {
    const now = Math.floor(Date.now() / 1000);
    const code = generateTotpCode(RFC_SECRET, now);
    expect(verifyTotpCode(RFC_SECRET, code)).toBe(true);
  });

  it("acepta código del step anterior (ventana window=1)", () => {
    const now = Math.floor(Date.now() / 1000);
    const prevStep = Math.floor(now / 30) - 1;
    const prevCode = generateTotpCode(RFC_SECRET, prevStep * 30);
    expect(verifyTotpCode(RFC_SECRET, prevCode, 1)).toBe(true);
  });

  it("acepta código del step siguiente (ventana window=1)", () => {
    const now = Math.floor(Date.now() / 1000);
    const nextStep = Math.floor(now / 30) + 1;
    const nextCode = generateTotpCode(RFC_SECRET, nextStep * 30);
    expect(verifyTotpCode(RFC_SECRET, nextCode, 1)).toBe(true);
  });

  it("rechaza código de 2 steps atrás cuando window=1", () => {
    const now = Math.floor(Date.now() / 1000);
    const oldStep = Math.floor(now / 30) - 2;
    const oldCode = generateTotpCode(RFC_SECRET, oldStep * 30);
    expect(verifyTotpCode(RFC_SECRET, oldCode, 1)).toBe(false);
  });

  it("rechaza código de 2 steps adelante cuando window=1", () => {
    const now = Math.floor(Date.now() / 1000);
    const futureStep = Math.floor(now / 30) + 2;
    const futureCode = generateTotpCode(RFC_SECRET, futureStep * 30);
    expect(verifyTotpCode(RFC_SECRET, futureCode, 1)).toBe(false);
  });

  it("rechaza token con caracteres no numéricos", () => {
    expect(verifyTotpCode(RFC_SECRET, "12345a")).toBe(false);
    expect(verifyTotpCode(RFC_SECRET, "abc123")).toBe(false);
    expect(verifyTotpCode(RFC_SECRET, "      ")).toBe(false);
  });

  it("rechaza token con menos de 6 dígitos", () => {
    expect(verifyTotpCode(RFC_SECRET, "12345")).toBe(false);
  });

  it("rechaza token con más de 6 dígitos", () => {
    expect(verifyTotpCode(RFC_SECRET, "1234567")).toBe(false);
  });

  it("rechaza token vacío", () => {
    expect(verifyTotpCode(RFC_SECRET, "")).toBe(false);
  });

  it("rechaza token todo ceros si no es el correcto", () => {
    // "000000" solo sería válido en ~1/1.000.000 steps por colisión
    const now = Math.floor(Date.now() / 1000);
    const realCode = generateTotpCode(RFC_SECRET, now);
    if (realCode !== "000000") {
      expect(verifyTotpCode(RFC_SECRET, "000000")).toBe(false);
    }
  });

  it("lanza error si el secret tiene caracteres base32 inválidos", () => {
    expect(() => verifyTotpCode("SECRET!INVALID", "123456")).toThrow();
  });

  it("window=0 solo acepta el step exacto actual", () => {
    const now = Math.floor(Date.now() / 1000);
    const currentCode = generateTotpCode(RFC_SECRET, now);
    expect(verifyTotpCode(RFC_SECRET, currentCode, 0)).toBe(true);

    // Código del step anterior no debe aceptarse con window=0
    const prevStep = Math.floor(now / 30) - 1;
    const prevCode = generateTotpCode(RFC_SECRET, prevStep * 30);
    // Solo falla si el código del step anterior difiere del actual
    if (prevCode !== currentCode) {
      expect(verifyTotpCode(RFC_SECRET, prevCode, 0)).toBe(false);
    }
  });
});

// ── buildOtpauthUri ───────────────────────────────────────────────────────────

describe("buildOtpauthUri", () => {
  it("genera un URI con esquema otpauth://totp/", () => {
    const uri = buildOtpauthUri(RFC_SECRET, "admin@bodega.com", "Buleje");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
  });

  it("incluye el secret en los query params", () => {
    const uri = buildOtpauthUri(RFC_SECRET, "admin@bodega.com", "Buleje");
    expect(uri).toContain(`secret=${RFC_SECRET}`);
  });

  it("incluye issuer en los query params", () => {
    const uri = buildOtpauthUri(RFC_SECRET, "admin@bodega.com", "Buleje");
    expect(uri).toContain("issuer=Buleje");
  });

  it("incluye period=30 (RFC 6238 estándar)", () => {
    const uri = buildOtpauthUri(RFC_SECRET, "admin@bodega.com", "Buleje");
    expect(uri).toContain("period=30");
  });

  it("incluye digits=6", () => {
    const uri = buildOtpauthUri(RFC_SECRET, "admin@bodega.com", "Buleje");
    expect(uri).toContain("digits=6");
  });

  it("incluye algorithm=SHA1", () => {
    const uri = buildOtpauthUri(RFC_SECRET, "admin@bodega.com", "Buleje");
    expect(uri).toContain("algorithm=SHA1");
  });

  it("encodes account con caracteres especiales", () => {
    const uri = buildOtpauthUri(RFC_SECRET, "admin+test@bodega.com", "Buleje");
    expect(uri).toMatch(/otpauth:\/\/totp\/.+/);
    // El label debe estar URL-encoded
    expect(uri).not.toContain(" ");
  });
});
