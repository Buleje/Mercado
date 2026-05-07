/**
 * __tests__/whatsapp/yape-capture.route.test.ts
 *
 * Unit tests para app/api/whatsapp/yape-capture/route.ts
 *
 * Testea el handler POST: parsing de payloads Twilio/Meta, idempotency
 * de phone-pending, respuestas ante conversación no encontrada y validación
 * de payloads inválidos. Fire-and-forget de Vision no se verifica aquí
 * (es background, testeado en yape-vision.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockFindByPhonePending = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/lib/db/payment-approval.db", () => ({
  PaymentApprovalDb: {
    findByPhonePending: (...args: unknown[]) => mockFindByPhonePending(...args),
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

// extractYapePayment: fire-and-forget, mockeamos para que no tire error
vi.mock("@/lib/ai/yape-vision", () => ({
  extractYapePayment: vi.fn().mockResolvedValue({
    detectedAmount: 50.0,
    yapeOpCode: "123456",
    yapeLast4: "5678",
    yapeDate: null,
    confidence: "high",
    visionResponse: { ok: true },
  }),
}));

// lookupActiveConversation usa prisma directamente — mockeamos @/lib/prisma
const mockFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsAppConversation: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

// Twilio media download — fetch global
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { POST } from "@/app/api/whatsapp/yape-capture/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FAKE_IMAGE_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG full magic (8 bytes)

function makeCreatedApproval(id = "pap_new_001") {
  return {
    id,
    customerPhone: "51987654321",
    expectedAmount: 50.0,
    status: "pending",
    imageUrl: "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages/MM123/Media/ME123",
    conversationId: "conv-001",
    detectedAmount: null,
    visionResponse: null,
    yapeOpCode: null,
    yapeLast4: null,
    yapeDate: null,
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeTwilioRequest(overrides: Record<string, string> = {}) {
  const form = new URLSearchParams({
    From: "whatsapp:+51987654321",
    MediaUrl0: "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages/MM123/Media/ME123",
    NumMedia: "1",
    ...overrides,
  });
  return new NextRequest("http://localhost:3000/api/whatsapp/yape-capture", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

function makeMetaRequest(overrides: Record<string, unknown> = {}) {
  const body = {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "1234567890" },
              messages: [
                {
                  from: "51987654321",
                  type: "image",
                  image: { id: "media-id-abc", mime_type: "image/jpeg" },
                },
              ],
            },
          },
        ],
      },
    ],
    ...overrides,
  };
  return new NextRequest("http://localhost:3000/api/whatsapp/yape-capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Fake arraybuffer response para fetch de media
function makeFetchOkResponse() {
  return Promise.resolve(
    new Response(FAKE_IMAGE_BYTES, { status: 200 }),
  );
}

// ─── Env vars requeridos ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TWILIO_ACCOUNT_SID = "ACtest123";
  process.env.TWILIO_AUTH_TOKEN = "tokentest456";
  process.env.WHATSAPP_ACCESS_TOKEN = "meta-access-token-xyz";
});

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("POST /api/whatsapp/yape-capture", () => {
  // ── Twilio happy path ───────────────────────────────────────────────────────

  it("Twilio payload válido → crea PaymentApproval y retorna 200 con approvalId", async () => {
    // Arrange
    mockFindMany.mockResolvedValue([
      { id: "conv-001", cartItems: [{ price: 25, quantity: 2 }], expiresAt: new Date(Date.now() + 60_000) },
    ]);
    mockFindByPhonePending.mockResolvedValue(null);
    mockCreate.mockResolvedValue(makeCreatedApproval("pap_new_twilio"));
    mockFetch.mockImplementation(() => makeFetchOkResponse());

    // Act
    const res = await POST(makeTwilioRequest());
    const data = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.approvalId).toBe("pap_new_twilio");
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  // ── Meta happy path ─────────────────────────────────────────────────────────

  it("Meta payload válido → crea PaymentApproval y retorna 200", async () => {
    // Arrange — Meta necesita dos pasos de fetch (metadata + descarga)
    mockFindMany.mockResolvedValue([
      { id: "conv-meta-001", cartItems: [{ price: 10, quantity: 5 }], expiresAt: new Date(Date.now() + 60_000) },
    ]);
    mockFindByPhonePending.mockResolvedValue(null);
    mockCreate.mockResolvedValue(makeCreatedApproval("pap_meta_001"));

    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: "https://cdn.meta.example.com/img.jpg" }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(FAKE_IMAGE_BYTES, { status: 200 }));

    // Act
    const res = await POST(makeMetaRequest());
    const data = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.approvalId).toBe("pap_meta_001");
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  // ── No active conversation ──────────────────────────────────────────────────

  it("lookupActiveConversation devuelve null → 200 con mensaje friendly, NO crea approval", async () => {
    // Arrange
    mockFindMany.mockResolvedValue([]); // sin conversación activa

    // Act
    const res = await POST(makeTwilioRequest());
    const data = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(data.ok).toBe(false);
    expect(data.message).toContain("pedido activo");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("conversación activa con carrito vacío (total=0) → 200 friendly, NO crea approval", async () => {
    // Arrange — cartItems vacío → total = 0
    mockFindMany.mockResolvedValue([
      { id: "conv-empty", cartItems: [], expiresAt: new Date(Date.now() + 60_000) },
    ]);

    // Act
    const res = await POST(makeTwilioRequest());
    const data = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(data.ok).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // ── Idempotency ──────────────────────────────────────────────────────────────

  it("idempotency: si ya hay pending del mismo phone → NO crea otra, reutiliza la existente", async () => {
    // Arrange
    mockFindMany.mockResolvedValue([
      { id: "conv-001", cartItems: [{ price: 30, quantity: 1 }], expiresAt: new Date(Date.now() + 60_000) },
    ]);
    const existingApproval = makeCreatedApproval("pap_existing_001");
    mockFindByPhonePending.mockResolvedValue(existingApproval);
    mockFetch.mockImplementation(() => makeFetchOkResponse());

    // Act
    const res = await POST(makeTwilioRequest());
    const data = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.approvalId).toBe("pap_existing_001"); // reutiliza el existente
    expect(mockCreate).not.toHaveBeenCalled(); // NO crea duplicado
  });

  // ── Payload inválido ─────────────────────────────────────────────────────────

  it("Twilio payload sin MediaUrl0 → 400", async () => {
    // Arrange — From válido pero sin MediaUrl0
    const req = makeTwilioRequest({ MediaUrl0: "" }); // URL vacía falla el schema URL

    // Act
    const res = await POST(req);
    const data = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(data.ok).toBe(false);
  });

  it("Twilio payload sin From → 400", async () => {
    // Arrange
    const form = new URLSearchParams({
      MediaUrl0: "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages/MM123/Media/ME123",
      NumMedia: "1",
      // From ausente
    });
    const req = new NextRequest("http://localhost:3000/api/whatsapp/yape-capture", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    // Act
    const res = await POST(req);
    const data = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(data.ok).toBe(false);
  });

  it("Meta payload JSON con body completamente malformado → 400", async () => {
    // Arrange — payload que no tiene `entry`
    const req = new NextRequest("http://localhost:3000/api/whatsapp/yape-capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object: "whatsapp_business_account", unknownField: true }),
    });

    // Act
    const res = await POST(req);
    const data = await res.json();

    // Assert — MetaWebhookSchema usa .optional() en entry, pero message.type !== "image"
    // cuando no hay messages → retorna no-image-in-payload → 400
    expect(res.status).toBe(400);
    expect(data.ok).toBe(false);
  });

  it("body JSON inválido (no parseable) → 400", async () => {
    // Arrange
    const req = new NextRequest("http://localhost:3000/api/whatsapp/yape-capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ malformed json {{",
    });

    // Act
    const res = await POST(req);
    const data = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(data.ok).toBe(false);
  });

  // ── Meta mensaje no-imagen ──────────────────────────────────────────────────

  it("Meta payload con mensaje de texto (no imagen) → 400", async () => {
    // Arrange
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { from: "51987654321", type: "text", text: { body: "Hola" } },
                ],
              },
            },
          ],
        },
      ],
    };
    const req = new NextRequest("http://localhost:3000/api/whatsapp/yape-capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // Act
    const res = await POST(req);
    const data = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(data.ok).toBe(false);
  });

  // ── Error de descarga de media ──────────────────────────────────────────────

  it("descarga Twilio falla (fetch no-ok) → 200 con mensaje friendly (no lanza)", async () => {
    // Arrange
    mockFindMany.mockResolvedValue([
      { id: "conv-001", cartItems: [{ price: 20, quantity: 1 }], expiresAt: new Date(Date.now() + 60_000) },
    ]);
    mockFetch.mockResolvedValue(new Response(null, { status: 403 }));

    // Act
    const res = await POST(makeTwilioRequest());
    const data = await res.json();

    // Assert — nunca lanza, devuelve 200 con mensaje amigable
    expect(res.status).toBe(200);
    expect(data.ok).toBe(false);
    expect(data.message).toContain("imagen");
  });
});
