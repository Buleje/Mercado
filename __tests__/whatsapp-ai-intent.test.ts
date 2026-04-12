/**
 * Unit tests for lib/whatsapp/ai-intent.ts
 * Covers: valid classification, malformed JSON fallback, trust threshold.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { mockGenerateText } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mockGenerateText,
}));

vi.mock("@/lib/ai/provider", () => ({
  chatModel: { id: "mock-chat-model" },
}));

import { classifyWhatsappIntent, shouldTrustAi } from "@/lib/whatsapp/ai-intent";

beforeEach(() => {
  mockGenerateText.mockReset();
});

describe("classifyWhatsappIntent", () => {
  it("parses a valid pedido classification with items", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: `{
        "intent": "pedido",
        "confidence": 0.9,
        "items": [
          { "name": "arroz", "quantity": 2, "unit": "kg" },
          { "name": "aceite", "quantity": 1 }
        ]
      }`,
    });
    const c = await classifyWhatsappIntent("quiero 2 kg de arroz y un aceite");
    expect(c.intent).toBe("pedido");
    expect(c.confidence).toBe(0.9);
    expect(c.items).toHaveLength(2);
    expect(c.items?.[0].name).toBe("arroz");
  });

  it("falls back to desconocido when response has no JSON", async () => {
    mockGenerateText.mockResolvedValueOnce({ text: "no puedo responder eso" });
    const c = await classifyWhatsappIntent("hola");
    expect(c.intent).toBe("desconocido");
    expect(c.confidence).toBe(0);
  });

  it("falls back to desconocido when schema validation fails", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: `{"intent": "invalid_intent", "confidence": 1.5}`,
    });
    const c = await classifyWhatsappIntent("donde esta mi pedido");
    expect(c.intent).toBe("desconocido");
  });

  it("falls back when the LLM throws", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("network error"));
    const c = await classifyWhatsappIntent("hola");
    expect(c.intent).toBe("desconocido");
  });

  it("rejects empty and oversized messages without calling the LLM", async () => {
    const empty = await classifyWhatsappIntent("   ");
    const huge = await classifyWhatsappIntent("x".repeat(501));
    expect(empty.intent).toBe("desconocido");
    expect(huge.intent).toBe("desconocido");
    expect(mockGenerateText).not.toHaveBeenCalled();
  });
});

describe("shouldTrustAi", () => {
  it("trusts confident non-unknown classifications", () => {
    expect(shouldTrustAi({ intent: "pedido", confidence: 0.8 })).toBe(true);
    expect(shouldTrustAi({ intent: "saludo", confidence: 0.6 })).toBe(true);
  });

  it("rejects low-confidence classifications", () => {
    expect(shouldTrustAi({ intent: "pedido", confidence: 0.5 })).toBe(false);
  });

  it("always rejects desconocido", () => {
    expect(shouldTrustAi({ intent: "desconocido", confidence: 1 })).toBe(false);
  });
});
