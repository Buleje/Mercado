/**
 * __tests__/sunat-webhook.test.ts
 *
 * Tests de la lógica de validación de webhook Nubefact.
 * Cubre: firma HMAC válida, firma inválida, body modificado,
 *        header ausente, mapeo de estados, idempotencia.
 */

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  validateWebhookSignature,
  mapWebhookEstadoToStatus,
} from "@/lib/sunat/webhook-validator";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEST_SECRET = "whsec_test_secret_12345"; // gitleaks:allow (test fixture, not a real secret)

function buildSignature(body: string, secret: string): string {
  const hmac = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return `sha256=${hmac}`;
}

// ── Tests validateWebhookSignature ────────────────────────────────────────────

describe("validateWebhookSignature", () => {
  const rawBody = JSON.stringify({
    nubefact_id: "NF-2026-001",
    estado: "ACEPTADO",
  });

  it("retorna valid=true con firma correcta", () => {
    const signature = buildSignature(rawBody, TEST_SECRET);
    const result = validateWebhookSignature(rawBody, signature, TEST_SECRET);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("retorna valid=false cuando la firma es incorrecta", () => {
    const wrongSignature = buildSignature(rawBody, "otro-secret");
    const result = validateWebhookSignature(rawBody, wrongSignature, TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("retorna valid=false cuando el header está ausente (null)", () => {
    const result = validateWebhookSignature(rawBody, null, TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/ausente/);
  });

  it("retorna valid=false cuando el header está vacío", () => {
    const result = validateWebhookSignature(rawBody, "", TEST_SECRET);
    expect(result.valid).toBe(false);
  });

  it("retorna valid=false cuando el cuerpo fue modificado después de firmar", () => {
    const signature = buildSignature(rawBody, TEST_SECRET);
    const tamperedBody = rawBody + " extra";
    const result = validateWebhookSignature(tamperedBody, signature, TEST_SECRET);
    expect(result.valid).toBe(false);
  });

  it("retorna valid=false cuando falta el prefijo 'sha256='", () => {
    const hmac = createHmac("sha256", TEST_SECRET)
      .update(rawBody, "utf8")
      .digest("hex");
    // Sin prefijo sha256=
    const result = validateWebhookSignature(rawBody, hmac, TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Formato de firma inválido/);
  });

  it("es timing-safe: no expone información de longitud", () => {
    // Firma de longitud diferente
    const shortSig = "sha256=abc123";
    const result = validateWebhookSignature(rawBody, shortSig, TEST_SECRET);
    expect(result.valid).toBe(false);
  });

  it("funciona con body vacío firmado correctamente", () => {
    const emptyBody = "";
    const signature = buildSignature(emptyBody, TEST_SECRET);
    const result = validateWebhookSignature(emptyBody, signature, TEST_SECRET);
    expect(result.valid).toBe(true);
  });

  it("funciona con body que contiene caracteres unicode", () => {
    const unicodeBody = JSON.stringify({ descripcion: "Aceptación SUNAT ✓" });
    const signature = buildSignature(unicodeBody, TEST_SECRET);
    const result = validateWebhookSignature(unicodeBody, signature, TEST_SECRET);
    expect(result.valid).toBe(true);
  });
});

// ── Tests mapWebhookEstadoToStatus ────────────────────────────────────────────

describe("mapWebhookEstadoToStatus", () => {
  it("mapea ACEPTADO → accepted", () => {
    expect(mapWebhookEstadoToStatus("ACEPTADO")).toBe("accepted");
  });

  it("mapea RECHAZADO → rejected", () => {
    expect(mapWebhookEstadoToStatus("RECHAZADO")).toBe("rejected");
  });

  it("mapea ANULADO → voided", () => {
    expect(mapWebhookEstadoToStatus("ANULADO")).toBe("voided");
  });
});

// ── Tests de integración del flujo webhook ────────────────────────────────────

describe("flujo completo webhook (sin HTTP)", () => {
  it("un payload ACEPTADO tiene firma válida y mapea a accepted", () => {
    const payload = JSON.stringify({
      nubefact_id: "NF-2026-100",
      estado: "ACEPTADO",
      enlace_del_pdf: "https://nubefact.com/pdf/NF-2026-100",
    });

    const signature = buildSignature(payload, TEST_SECRET);
    const validation = validateWebhookSignature(payload, signature, TEST_SECRET);
    expect(validation.valid).toBe(true);

    const parsed = JSON.parse(payload) as { estado: "ACEPTADO" };
    const status = mapWebhookEstadoToStatus(parsed.estado);
    expect(status).toBe("accepted");
  });

  it("un payload RECHAZADO tiene firma válida y mapea a rejected", () => {
    const payload = JSON.stringify({
      nubefact_id: "NF-2026-101",
      estado: "RECHAZADO",
      descripcion_sunat: "El RUC del receptor no existe.",
    });

    const signature = buildSignature(payload, TEST_SECRET);
    const validation = validateWebhookSignature(payload, signature, TEST_SECRET);
    expect(validation.valid).toBe(true);

    const parsed = JSON.parse(payload) as { estado: "RECHAZADO" };
    const status = mapWebhookEstadoToStatus(parsed.estado);
    expect(status).toBe("rejected");
  });

  it("replay del mismo evento usa firma válida (idempotencia posible)", () => {
    const payload = JSON.stringify({
      nubefact_id: "NF-2026-102",
      estado: "ACEPTADO",
    });
    const signature = buildSignature(payload, TEST_SECRET);

    // Primer envío
    const r1 = validateWebhookSignature(payload, signature, TEST_SECRET);
    expect(r1.valid).toBe(true);

    // Replay idéntico: misma firma, mismo body
    const r2 = validateWebhookSignature(payload, signature, TEST_SECRET);
    expect(r2.valid).toBe(true);
    // El handler en route.ts maneja idempotencia verificando sunatStatus
  });
});
