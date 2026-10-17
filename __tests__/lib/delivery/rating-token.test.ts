import { describe, it, expect } from "vitest";
import {
  generateRatingToken,
  verifyRatingToken,
} from "@/lib/delivery/rating-token";

/**
 * El token de propina/calificación se volvió load-bearing (2026-06-18): el
 * endpoint /api/delivery/tip lo exige por default. Este round-trip garantiza
 * que un token emitido por generateRatingToken siempre valide, y que las vías
 * de ataque (orderId distinto, expirado, firma alterada) se rechacen.
 *
 * generate y verify leen el MISMO SECRET de process.env al importar, así que el
 * round-trip es determinista sin importar qué secret tenga el entorno de test.
 */
describe("rating-token (round-trip HMAC)", () => {
  const ORDER = "order-abc-123";

  it("un token recién emitido valida para su mismo orderId", () => {
    const token = generateRatingToken(ORDER);
    expect(verifyRatingToken(token, ORDER)).toEqual({ valid: true });
  });

  it("respeta orderIds con guiones (split desde el final)", () => {
    const weird = "tenant-main-order-2026-06-18-xyz";
    const token = generateRatingToken(weird);
    expect(verifyRatingToken(token, weird).valid).toBe(true);
  });

  it("rechaza si el orderId no coincide (no se puede reusar en otra orden)", () => {
    const token = generateRatingToken(ORDER);
    const res = verifyRatingToken(token, "otra-orden");
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.reason).toBe("order_mismatch");
  });

  it("rechaza un token expirado", () => {
    const token = generateRatingToken(ORDER, -1000); // ya venció
    const res = verifyRatingToken(token, ORDER);
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.reason).toBe("expired");
  });

  it("rechaza un token con la firma alterada", () => {
    const token = generateRatingToken(ORDER);
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    expect(verifyRatingToken(tampered, ORDER).valid).toBe(false);
  });

  it("rechaza basura sin estructura de token", () => {
    expect(verifyRatingToken("basura", ORDER).valid).toBe(false);
    expect(verifyRatingToken("", ORDER).valid).toBe(false);
  });
});
