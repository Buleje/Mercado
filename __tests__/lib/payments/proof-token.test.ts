/**
 * __tests__/lib/payments/proof-token.test.ts
 *
 * Tests unitarios para verifyProofToken (y signProofToken internamente).
 *
 * La función vive en app/api/marketplace/checkout/payment-proof/route.ts y
 * se re-exporta como named export. Verificamos las 5 ramas del árbol de
 * decisión: happy path, signature corrupta, customerId incorrecto, formato
 * malformado y monto alterado (tamper).
 *
 * No hay hits a DB ni a Supabase — todo es HMAC en memoria.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createHmac } from "crypto";
import { verifyProofToken } from "@/app/api/marketplace/checkout/payment-proof/route";

// ── Constantes de fixtures ────────────────────────────────────────────────────

const SECRET = "test-auth-secret-at-least-32-chars-long!!"; // vitest.setup.ts

const BASE_INPUT = {
  customerId: "customer-abc123",
  storeSlug: "bodega-san-martin",
  method: "yape" as const,
  amountCents: 1050, // S/ 10.50
  storagePath: "order-proofs/bodega-san-martin/customer-abc123-1234-rand.webp",
};

/**
 * Reimplementa signProofToken siguiendo la misma lógica del route para
 * generar un token válido en tests sin necesidad de importar la función
 * privada. Si la implementación cambia y el token falla, este helper lo
 * detecta en el happy path.
 */
function buildValidToken(input: typeof BASE_INPUT): string {
  const pathHash = createHmac("sha256", SECRET + "-proof-path")
    .update(input.storagePath)
    .digest("hex")
    .slice(0, 12);
  const base = `${input.customerId}.${input.storeSlug}.${input.method}.${input.amountCents}.${pathHash}`;
  const sig = createHmac("sha256", SECRET + "-proof-token")
    .update(base)
    .digest("hex")
    .slice(0, 16);
  return `${base}.${sig}`;
}

// El setup global ya fija AUTH_SECRET en process.env antes de importar.
beforeAll(() => {
  // Garantía explícita: si el setup.ts cambia, el test lo detecta.
  expect(process.env.AUTH_SECRET).toBeTruthy();
});

// ── Suite principal ───────────────────────────────────────────────────────────

describe("verifyProofToken", () => {
  // ────────────────────────────────────────────────────────────────────────────
  // Caso 1 — Happy path: token íntegro firmado con la misma clave
  // ────────────────────────────────────────────────────────────────────────────
  it("(1) devuelve { ok: true } con un token válido generado por signProofToken", () => {
    // Arrange
    const token = buildValidToken(BASE_INPUT);
    const expected = {
      customerId: BASE_INPUT.customerId,
      storeSlug: BASE_INPUT.storeSlug,
      method: BASE_INPUT.method,
      amountCents: BASE_INPUT.amountCents,
    };

    // Act
    const result = verifyProofToken(token, expected);

    // Assert
    expect(result).toEqual({ ok: true });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Caso 2 — Signature corrupta (último segmento alterado en 1 char)
  // ────────────────────────────────────────────────────────────────────────────
  it("(2) devuelve { ok: false, reason: 'bad-sig' } cuando la firma está alterada", () => {
    // Arrange
    const validToken = buildValidToken(BASE_INPUT);
    const parts = validToken.split(".");
    // Corromper el último segmento cambiando el primer char
    const corruptSig =
      parts[5][0] === "a" ? parts[5].replace("a", "b") : parts[5].replace(parts[5][0], "a");
    const corruptToken = [...parts.slice(0, 5), corruptSig].join(".");

    const expected = {
      customerId: BASE_INPUT.customerId,
      storeSlug: BASE_INPUT.storeSlug,
      method: BASE_INPUT.method,
      amountCents: BASE_INPUT.amountCents,
    };

    // Act
    const result = verifyProofToken(corruptToken, expected);

    // Assert
    expect(result).toEqual({ ok: false, reason: "bad-sig" });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Caso 3 — customerId de otro customer (mismatch)
  // ────────────────────────────────────────────────────────────────────────────
  it("(3) devuelve { ok: false, reason: 'mismatch' } cuando el customerId no coincide", () => {
    // Arrange — token firmado para customer-abc123, pero verificamos como otro
    const token = buildValidToken(BASE_INPUT);
    const expected = {
      customerId: "otro-customer-xyz",
      storeSlug: BASE_INPUT.storeSlug,
      method: BASE_INPUT.method,
      amountCents: BASE_INPUT.amountCents,
    };

    // Act
    const result = verifyProofToken(token, expected);

    // Assert
    // La comparación de fields falla antes de llegar a verificar la firma.
    expect(result).toEqual({ ok: false, reason: "mismatch" });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Caso 4 — Formato malformado (5 partes en vez de 6)
  // ────────────────────────────────────────────────────────────────────────────
  it("(4) devuelve { ok: false, reason: 'bad-format' } con token de 5 partes", () => {
    // Arrange — quitamos el último segmento (la firma)
    const token = buildValidToken(BASE_INPUT);
    const truncated = token.split(".").slice(0, 5).join(".");

    const expected = {
      customerId: BASE_INPUT.customerId,
      storeSlug: BASE_INPUT.storeSlug,
      method: BASE_INPUT.method,
      amountCents: BASE_INPUT.amountCents,
    };

    // Act
    const result = verifyProofToken(truncated, expected);

    // Assert
    expect(result).toEqual({ ok: false, reason: "bad-format" });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Caso 5 — Monto alterado (tamper en amountCents)
  // ────────────────────────────────────────────────────────────────────────────
  it("(5) devuelve { ok: false, reason: 'mismatch' } cuando amountCents difiere del token", () => {
    // Arrange — token firmado con 1050 cents, pero expected dice 9999 cents
    const token = buildValidToken(BASE_INPUT);
    const expected = {
      customerId: BASE_INPUT.customerId,
      storeSlug: BASE_INPUT.storeSlug,
      method: BASE_INPUT.method,
      amountCents: 9999, // distinto al token (1050)
    };

    // Act
    const result = verifyProofToken(token, expected);

    // Assert
    // La comparación numérica falla en el guard de fields antes de la firma.
    expect(result).toEqual({ ok: false, reason: "mismatch" });
  });

  // ── Edge: token completamente vacío ──────────────────────────────────────
  it("(edge) token vacío → bad-format", () => {
    const result = verifyProofToken("", {
      customerId: "x",
      storeSlug: "s",
      method: "yape",
      amountCents: 100,
    });
    expect(result).toEqual({ ok: false, reason: "bad-format" });
  });
});
