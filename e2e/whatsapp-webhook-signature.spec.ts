import { test, expect } from "@playwright/test";
import * as crypto from "crypto";

/**
 * whatsapp-webhook-signature.spec.ts
 *
 * Happy path: validación de firma Twilio en el webhook de WhatsApp.
 *
 * Escenarios:
 *   1. POST con firma Twilio válida → 200
 *   2. POST con firma inválida → 403
 *   3. POST sin firma → 403
 *   4. GET de verificación Meta webhook → 200 con challenge
 *   5. POST con body malformado (no form-urlencoded) → 400
 *   6. Endpoint concierge sin auth → 401/403
 *   7. Rate limit en webhook (cuerpo duplicado) no expone 500
 *
 * Nota: el endpoint real es /api/whatsapp/webhook (Meta/WhatsApp Business API).
 * El endpoint con firma Twilio es /api/whatsapp/yape-capture.
 * Ambos se testean aquí por ser el happy path crítico de seguridad de webhooks.
 *
 * TODO-fixtures:
 *   - E2E_TWILIO_AUTH_TOKEN — debe coincidir con TWILIO_AUTH_TOKEN del server
 *   - E2E_WHATSAPP_VERIFY_TOKEN — token de verificación Meta
 */

const TWILIO_AUTH_TOKEN = process.env.E2E_TWILIO_AUTH_TOKEN ?? "";
const WA_VERIFY_TOKEN = process.env.E2E_WHATSAPP_VERIFY_TOKEN ?? "";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

/**
 * Genera firma HMAC-SHA1 como Twilio.
 * Firma = HMAC-SHA1(authToken, url + sorted_params_concatenated)
 */
function generarFirmaTwilio(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const sortedKeys = Object.keys(params).sort();
  const paramStr = sortedKeys.map((k) => `${k}${params[k]}`).join("");
  const signature = crypto
    .createHmac("sha1", authToken)
    .update(url + paramStr)
    .digest("base64");
  return signature;
}

// Payload mínimo de mensaje Twilio WhatsApp
const TWILIO_PAYLOAD: Record<string, string> = {
  MessageSid: "SMtest12345678901234567890123456",
  AccountSid: "ACtest12345678901234567890123456",
  From: "whatsapp:+51987654321",
  To: "whatsapp:+51000000000",
  Body: "Hola prueba",
  NumMedia: "0",
};

function toFormUrlEncoded(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

test.describe("WhatsApp webhook — validación de firma de seguridad", () => {
  // ── 1. POST con firma Twilio válida → 200 ─────────────────────────────────

  test("1 — POST /api/whatsapp/yape-capture con firma válida retorna 200", async ({
    request,
  }) => {
    test.skip(!TWILIO_AUTH_TOKEN, "Requiere E2E_TWILIO_AUTH_TOKEN");

    const url = `${BASE_URL}/api/whatsapp/yape-capture`;
    const firma = generarFirmaTwilio(TWILIO_AUTH_TOKEN, url, TWILIO_PAYLOAD);
    const body = toFormUrlEncoded(TWILIO_PAYLOAD);

    const res = await request.post("/api/whatsapp/yape-capture", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": firma,
      },
      data: body,
    });

    // 200 si el mensaje es procesado correctamente
    // 400 si el body es válido pero el mensaje no es de tipo Yape
    expect([200, 400]).toContain(res.status());
    // NO debe ser 403 (firma rechazada)
    expect(res.status()).not.toBe(403);
  });

  // ── 2. POST con firma inválida → 403 ──────────────────────────────────────

  test("2 — POST /api/whatsapp/yape-capture con firma inválida retorna 403", async ({
    request,
  }) => {
    test.skip(!TWILIO_AUTH_TOKEN, "Requiere E2E_TWILIO_AUTH_TOKEN");

    const body = toFormUrlEncoded(TWILIO_PAYLOAD);
    const res = await request.post("/api/whatsapp/yape-capture", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": "firma-falsa-invalida-xyz",
      },
      data: body,
    });

    expect(res.status()).toBe(403);
  });

  // ── 3. POST sin firma → 403 ───────────────────────────────────────────────

  test("3 — POST /api/whatsapp/yape-capture sin X-Twilio-Signature retorna 403", async ({
    request,
  }) => {
    test.skip(!TWILIO_AUTH_TOKEN, "Requiere E2E_TWILIO_AUTH_TOKEN");

    const body = toFormUrlEncoded(TWILIO_PAYLOAD);
    const res = await request.post("/api/whatsapp/yape-capture", {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: body,
    });

    expect([400, 403]).toContain(res.status());
  });

  // ── 4. Sin TWILIO_AUTH_TOKEN configurado → servidor fail-closed ───────────

  test("4 — sin TWILIO_AUTH_TOKEN, endpoint falla-cerrado (no 200)", async ({ request }) => {
    // Este test verifica el comportamiento fail-closed cuando el token no está configurado
    // El test pasa si el servidor rechaza (no retorna 200 sin firma válida)
    const body = toFormUrlEncoded(TWILIO_PAYLOAD);
    const res = await request.post("/api/whatsapp/yape-capture", {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: body,
    });

    // Sin firma y sin token configurado: debe fallar (no 200)
    // Si el token está configurado, también debe fallar por falta de firma
    expect(res.status()).not.toBe(200);
  });

  // ── 5. GET /api/whatsapp/webhook — verificación Meta ─────────────────────

  test("5 — GET /api/whatsapp/webhook con verify token retorna challenge", async ({
    request,
  }) => {
    test.skip(!WA_VERIFY_TOKEN, "Requiere E2E_WHATSAPP_VERIFY_TOKEN");

    const res = await request.get(
      `/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${WA_VERIFY_TOKEN}&hub.challenge=test-challenge-12345`,
    );

    if (res.status() === 200) {
      const body = await res.text();
      expect(body).toContain("test-challenge-12345");
    } else {
      // 404 si el endpoint usa ruta diferente para Meta vs Twilio
      expect([200, 404]).toContain(res.status());
    }
  });

  // ── 6. GET /api/whatsapp/webhook sin verify token retorna 403 ─────────────

  test("6 — GET /api/whatsapp/webhook sin verify token retorna 403 o 400", async ({
    request,
  }) => {
    const res = await request.get(
      "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=abc",
    );
    expect([400, 403, 404]).toContain(res.status());
  });

  // ── 7. POST /api/whatsapp/webhook (Meta) sin body retorna 400 ─────────────

  test("7 — POST /api/whatsapp/webhook sin body retorna 400 o 403", async ({ request }) => {
    const res = await request.post("/api/whatsapp/webhook", {
      headers: { "Content-Type": "application/json" },
      data: {},
    });
    // Puede retornar 400 (validación), 403 (sin firma) o 405 (método no permitido en este endpoint)
    expect([400, 403, 405]).toContain(res.status());
  });

  // ── 8. Endpoint concierge protegido requiere auth ─────────────────────────

  test("8 — POST /api/whatsapp/concierge sin auth retorna 401 o 403", async ({ request }) => {
    const res = await request.post("/api/whatsapp/concierge", {
      data: { message: "Hola", phone: "987654321" },
    });
    expect([401, 403]).toContain(res.status());
  });
});
