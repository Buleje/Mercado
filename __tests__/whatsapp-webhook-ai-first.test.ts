/**
 * Test suite: WhatsApp Webhook AI-first Routing (ADR-058)
 *
 * Cubre la decisión arquitectónica de ADR-058: el webhook que Meta conoce
 * (`/api/whatsapp/webhook`) ahora delega al Concierge AI por defecto y
 * cae al motor keyword legacy solo si el AI crashea o el flag está OFF.
 *
 * Estrategia:
 *  - Testear `processWebhookPayload` directamente (exportado para tests),
 *    no el POST handler — el POST hace fire-and-forget, lo que dificulta
 *    la observabilidad en tests. Llamar a la función async directamente
 *    es determinista y rápido.
 *
 * Mocks:
 *  - Concierge AI (`handleIncomingMessage`) → vi.mock para controlar éxito/crash.
 *  - Engine legacy (`processMessage`) → vi.mock para verificar fallback.
 *  - Prisma → vi.mock para resolver tenant + leer config WhatsApp.
 *  - fetch global → vi.fn para llamadas a la Graph API de Meta.
 *  - logger → silenciado para tests limpios.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks (deben ir ANTES de los imports que los usan) ───────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenantWhatsAppConfig: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/whatsapp/concierge/concierge-router", () => ({
  handleIncomingMessage: vi.fn(),
}));

vi.mock("@/lib/whatsapp/conversation-engine", () => ({
  processMessage: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Imports (después de los mocks) ──────────────────────────────────────────

import { processWebhookPayload } from "@/app/api/whatsapp/webhook/route";
import { prisma } from "@/lib/prisma";
import { handleIncomingMessage } from "@/lib/whatsapp/concierge/concierge-router";
import { processMessage } from "@/lib/whatsapp/conversation-engine";

// ─── Tipos auxiliares ─────────────────────────────────────────────────────────

const mockPrisma = prisma as unknown as {
  tenantWhatsAppConfig: { findFirst: ReturnType<typeof vi.fn> };
};
const mockConcierge = handleIncomingMessage as unknown as ReturnType<typeof vi.fn>;
const mockLegacy = processMessage as unknown as ReturnType<typeof vi.fn>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TENANT = "tenant-test-058";
const PHONE_ID = "phone-id-058";
const FROM = "51999111222";

function buildPayload(text: string): string {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "biz-acc-1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "+51111111111",
                phone_number_id: PHONE_ID,
              },
              messages: [
                {
                  from: FROM,
                  id: "msg-1",
                  timestamp: "1700000000",
                  type: "text",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  });
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("WhatsApp webhook — AI-first routing (ADR-058)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Tenant config por defecto: existe y está activo
    mockPrisma.tenantWhatsAppConfig.findFirst.mockResolvedValue({
      tenantId: TENANT,
      phoneNumberId: PHONE_ID,
      whatsappToken: "tenant-token-058",
      businessName: "Bodega Test",
      yapeNumber: null,
      isActive: true,
    });

    // Mock por defecto: AI exitoso
    mockConcierge.mockResolvedValue({
      reply: "Respuesta del Concierge AI",
      state: "browsing",
      escalated: false,
    });

    // Mock por defecto: legacy también exitoso (para casos de fallback)
    mockLegacy.mockResolvedValue({
      reply: "Respuesta legacy keyword",
      newState: "idle",
    });

    // fetch global — la Graph API responde 200
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({}),
    } as Response);

    // Por defecto el flag está ON (default true)
    delete process.env.WHATSAPP_AI_FIRST;
  });

  afterEach(() => {
    delete process.env.WHATSAPP_AI_FIRST;
  });

  // ─── Caso 1: Default = AI primero ────────────────────────────────────────

  it("flag por defecto (no set) → llama al Concierge AI, NO al legacy", async () => {
    await processWebhookPayload(buildPayload("cuanto cuesta el arroz"));

    expect(mockConcierge).toHaveBeenCalledTimes(1);
    expect(mockConcierge).toHaveBeenCalledWith(TENANT, FROM, "cuanto cuesta el arroz");
    expect(mockLegacy).not.toHaveBeenCalled();
  });

  // ─── Caso 2: AI exitoso → su reply se envía ──────────────────────────────

  it("Concierge AI responde correctamente → su reply se envía vía Graph API", async () => {
    await processWebhookPayload(buildPayload("hola"));

    // Verificar que se llamó a la Graph API con el reply del Concierge
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalled();
    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[0]).toContain("graph.facebook.com");
    expect(callArgs[0]).toContain(PHONE_ID);
    const body = JSON.parse(callArgs[1].body);
    expect(body.text.body).toBe("Respuesta del Concierge AI");
  });

  // ─── Caso 3: Concierge crashea → fallback al legacy ──────────────────────

  it("Concierge AI lanza excepción → cae al engine legacy", async () => {
    mockConcierge.mockRejectedValue(new Error("Concierge boom"));

    await processWebhookPayload(buildPayload("quiero arroz"));

    // El Concierge fue intentado primero
    expect(mockConcierge).toHaveBeenCalledTimes(1);
    // Y el legacy fue invocado como fallback
    expect(mockLegacy).toHaveBeenCalledTimes(1);
    expect(mockLegacy).toHaveBeenCalledWith(
      TENANT,
      FROM,
      "quiero arroz",
      expect.objectContaining({
        businessName: "Bodega Test",
        yapeNumber: null,
      })
    );

    // El reply enviado debe ser el del legacy
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const lastCall = fetchMock.mock.calls.at(-1);
    const body = JSON.parse(lastCall![1].body);
    expect(body.text.body).toBe("Respuesta legacy keyword");
  });

  // ─── Caso 4: Flag OFF explícito → bypass total del AI ────────────────────

  it("WHATSAPP_AI_FIRST=false → bypass del AI, va directo al legacy", async () => {
    process.env.WHATSAPP_AI_FIRST = "false";

    await processWebhookPayload(buildPayload("hola"));

    // El Concierge NO debe haberse invocado nunca
    expect(mockConcierge).not.toHaveBeenCalled();
    // El legacy sí
    expect(mockLegacy).toHaveBeenCalledTimes(1);

    // El reply enviado debe ser el del legacy
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const lastCall = fetchMock.mock.calls.at(-1);
    const body = JSON.parse(lastCall![1].body);
    expect(body.text.body).toBe("Respuesta legacy keyword");
  });

  it('WHATSAPP_AI_FIRST="0" → equivalente a false, bypass al AI', async () => {
    process.env.WHATSAPP_AI_FIRST = "0";

    await processWebhookPayload(buildPayload("hola"));

    expect(mockConcierge).not.toHaveBeenCalled();
    expect(mockLegacy).toHaveBeenCalledTimes(1);
  });

  // ─── Caso 5: Ambos crashean → mensaje de error genérico ──────────────────

  it("Concierge AI crashea Y legacy crashea → envía mensaje de error genérico", async () => {
    mockConcierge.mockRejectedValue(new Error("ai down"));
    mockLegacy.mockRejectedValue(new Error("legacy down"));

    await processWebhookPayload(buildPayload("hola"));

    // Ambos engines fueron intentados
    expect(mockConcierge).toHaveBeenCalledTimes(1);
    expect(mockLegacy).toHaveBeenCalledTimes(1);

    // El usuario recibe un mensaje genérico — nunca se queda sin respuesta
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const lastCall = fetchMock.mock.calls.at(-1);
    const body = JSON.parse(lastCall![1].body);
    expect(body.text.body.toLowerCase()).toContain("error");
  });

  // ─── Caso 6: sendReply falla → solo se loguea, no crashea ────────────────

  it("Graph API responde 500 → no lanza excepción, se loguea warning", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Server Error",
      json: async () => ({}),
    } as Response);

    // No debe lanzar — el catch interno absorbe el error
    await expect(
      processWebhookPayload(buildPayload("hola"))
    ).resolves.toBeUndefined();

    // El Concierge corrió correctamente
    expect(mockConcierge).toHaveBeenCalledTimes(1);
  });

  // ─── Caso 7: Multi-tenant — tenantId del config se pasa a ambos engines ──

  it("tenantId resuelto del config se pasa correctamente al Concierge", async () => {
    const otherTenant = "tenant-otro";
    mockPrisma.tenantWhatsAppConfig.findFirst.mockResolvedValue({
      tenantId: otherTenant,
      phoneNumberId: PHONE_ID,
      whatsappToken: "otro-token",
      businessName: "Otra Bodega",
      yapeNumber: "987654321",
      isActive: true,
    });

    await processWebhookPayload(buildPayload("hola"));

    expect(mockConcierge).toHaveBeenCalledWith(otherTenant, FROM, "hola");
  });

  // ─── Caso 8: Sin tenant config → usa "main" como tenant fallback ─────────

  it("sin tenant config en DB → usa tenantId 'main' (legacy compat)", async () => {
    mockPrisma.tenantWhatsAppConfig.findFirst.mockResolvedValue(null);
    process.env.WHATSAPP_ACCESS_TOKEN = "global-fallback-token";

    await processWebhookPayload(buildPayload("hola"));

    expect(mockConcierge).toHaveBeenCalledWith("main", FROM, "hola");

    delete process.env.WHATSAPP_ACCESS_TOKEN;
  });

  // ─── Caso 9: JSON inválido → log warn pero no crashea ────────────────────

  it("JSON inválido en payload → no llama a ningún engine, no lanza", async () => {
    await expect(
      processWebhookPayload("{ esto no es json valido")
    ).resolves.toBeUndefined();

    expect(mockConcierge).not.toHaveBeenCalled();
    expect(mockLegacy).not.toHaveBeenCalled();
  });

  // ─── Caso 10: Mensaje vacío → ignorado, no llama engines ─────────────────

  it("mensaje con texto vacío → ignorado sin llamar a engines", async () => {
    const emptyPayload = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: PHONE_ID },
                messages: [
                  {
                    from: FROM,
                    id: "msg-empty",
                    timestamp: "1700000000",
                    type: "text",
                    text: { body: "   " },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    await processWebhookPayload(emptyPayload);

    expect(mockConcierge).not.toHaveBeenCalled();
    expect(mockLegacy).not.toHaveBeenCalled();
  });
});
