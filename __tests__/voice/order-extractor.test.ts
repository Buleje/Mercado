/**
 * Unit tests for lib/voice/order-extractor.ts
 * Covers: pedido con 2 items, intent unknown, error de LLM, match de catálogo.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Mock de fetch global ───────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGroqResponse(content: string) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
    }),
    text: async () => content,
  };
}

function makeGroqErrorResponse(status = 500) {
  return {
    ok: false,
    status,
    text: async () => "Internal Server Error",
    json: async () => ({}),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

import { extractOrderFromText } from "@/lib/voice/order-extractor";

beforeEach(() => {
  mockFetch.mockReset();
  process.env.GROQ_API_KEY = "test-groq-key";
});

describe("extractOrderFromText", () => {
  it("extrae 2 items de un pedido de arroz y aceite", async () => {
    const llmJson = JSON.stringify({
      intent: "order",
      items: [
        { nameGuess: "arroz", quantity: 2, unit: "kilos" },
        { nameGuess: "aceite", quantity: 3, unit: "botellas" },
      ],
      notes: "",
    });
    mockFetch.mockResolvedValueOnce(makeGroqResponse(llmJson));

    const catalog = [
      { id: "p1", name: "Arroz Extra" },
      { id: "p2", name: "Aceite Primor" },
    ];

    const result = await extractOrderFromText(
      "quiero 2 kilos de arroz y 3 botellas de aceite",
      "tenant-1",
      catalog,
    );

    expect(result.intent).toBe("order");
    expect(result.items).toHaveLength(2);
    expect(result.unresolved).toHaveLength(0);

    // Verifica que el match aproximado funcionó
    const arrozItem = result.items.find((i) => i.nameGuess === "arroz");
    expect(arrozItem?.matchedName).toBe("Arroz Extra");
    expect(arrozItem?.quantity).toBe(2);
    expect(arrozItem?.unit).toBe("kilos");

    const aceiteItem = result.items.find((i) => i.nameGuess === "aceite");
    expect(aceiteItem?.matchedName).toBe("Aceite Primor");
    expect(aceiteItem?.quantity).toBe(3);
  });

  it("devuelve intent unknown cuando el LLM no reconoce la intención", async () => {
    const llmJson = JSON.stringify({
      intent: "unknown",
      items: [],
    });
    mockFetch.mockResolvedValueOnce(makeGroqResponse(llmJson));

    const result = await extractOrderFromText(
      "buen día cómo están",
      "tenant-1",
    );

    expect(result.intent).toBe("unknown");
    expect(result.items).toHaveLength(0);
    expect(result.unresolved).toHaveLength(0);
  });

  it("maneja error de Groq y devuelve intent unknown con items vacíos", async () => {
    mockFetch.mockResolvedValueOnce(makeGroqErrorResponse(500));

    const result = await extractOrderFromText(
      "quiero pan",
      "tenant-1",
    );

    expect(result.intent).toBe("unknown");
    expect(result.items).toHaveLength(0);
    expect(result.rawText).toBe("quiero pan");
  });

  it("pone items sin match en unresolved cuando no hay catálogo", async () => {
    const llmJson = JSON.stringify({
      intent: "order",
      items: [{ nameGuess: "yogurt griego", quantity: 4 }],
    });
    mockFetch.mockResolvedValueOnce(makeGroqResponse(llmJson));

    // Sin catálogo → todos los items van a unresolved
    const result = await extractOrderFromText(
      "quiero 4 yogures griegos",
      "tenant-1",
      [], // catálogo vacío
    );

    expect(result.intent).toBe("order");
    expect(result.items).toHaveLength(0);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0].nameGuess).toBe("yogurt griego");
  });

  it("preserva el rawText original en el draft", async () => {
    const llmJson = JSON.stringify({ intent: "query", items: [] });
    mockFetch.mockResolvedValueOnce(makeGroqResponse(llmJson));

    const text = "cuánto cuesta el azúcar";
    const result = await extractOrderFromText(text, "tenant-2");

    expect(result.rawText).toBe(text);
    expect(result.tenantId).toBe("tenant-2");
  });

  it("lanza error si GROQ_API_KEY no está configurado", async () => {
    delete process.env.GROQ_API_KEY;

    await expect(
      extractOrderFromText("quiero arroz", "tenant-1"),
    ).rejects.toThrow("GROQ_API_KEY no configurado");
  });
});
