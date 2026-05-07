/**
 * __tests__/whatsapp/yape-vision.test.ts
 *
 * Unit tests para lib/ai/yape-vision.ts
 * Mockea `ai` (generateText) y `lib/ai/cost-control` para aislar la lógica
 * de extracción/parsing sin llamadas reales al modelo.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@/lib/ai/provider", () => ({
  anthropicProvider: vi.fn(() => "mocked-model"),
}));

vi.mock("@/lib/ai/cost-control", () => ({
  aiCostGuard: {
    canSpend: vi.fn(() => true),
    recordSpend: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { generateText } from "ai";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { extractYapePayment } from "@/lib/ai/yape-vision";

const mockGenerateText = vi.mocked(generateText);
const mockCanSpend = vi.mocked(aiCostGuard.canSpend);
const mockRecordSpend = vi.mocked(aiCostGuard.recordSpend);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGenerateTextResponse(text: string) {
  return { text } as Awaited<ReturnType<typeof generateText>>;
}

const VALID_IMAGE_URL = "https://cdn.example.com/yape-screenshot.jpg";

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("extractYapePayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanSpend.mockResolvedValue(true);
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("happy path: Vision devuelve JSON válido → resultado con confidence 'high'", async () => {
    // Arrange
    const yapeJson = JSON.stringify({
      isYape: true,
      monto: 45.5,
      codigoOperacion: "123456789",
      last4: "5678",
      fecha: "2026-05-02T10:30:00.000Z",
      confianza: "high",
    });
    mockGenerateText.mockResolvedValue(makeGenerateTextResponse(yapeJson));

    // Act
    const result = await extractYapePayment(VALID_IMAGE_URL);

    // Assert
    expect(result.detectedAmount).toBe(45.5);
    expect(result.yapeOpCode).toBe("123456789");
    expect(result.yapeLast4).toBe("5678");
    expect(result.yapeDate).toBeInstanceOf(Date);
    expect(result.confidence).toBe("high");
    expect(result.visionResponse.ok).toBe(true);
    expect(mockRecordSpend).toHaveBeenCalledOnce();
  });

  it("happy path: confidence 'high' se degrada a 'medium' si falta yapeOpCode", async () => {
    // Arrange — codigoOperacion null pero confianza declarada 'high'
    const yapeJson = JSON.stringify({
      monto: 20.0,
      codigoOperacion: null,
      last4: "1234",
      fecha: "2026-05-02",
      confianza: "high",
    });
    mockGenerateText.mockResolvedValue(makeGenerateTextResponse(yapeJson));

    // Act
    const result = await extractYapePayment(VALID_IMAGE_URL);

    // Assert — downgradea a medium porque opCode es null
    expect(result.confidence).toBe("medium");
    expect(result.detectedAmount).toBe(20.0);
    expect(result.yapeOpCode).toBeNull();
  });

  it("happy path: todos los campos null → confidence 'low' (both amount y opCode nulos)", async () => {
    // Arrange
    const yapeJson = JSON.stringify({
      monto: null,
      codigoOperacion: null,
      last4: null,
      fecha: null,
      confianza: "medium",
    });
    mockGenerateText.mockResolvedValue(makeGenerateTextResponse(yapeJson));

    // Act
    const result = await extractYapePayment(VALID_IMAGE_URL);

    // Assert — ambos null → low override
    expect(result.confidence).toBe("low");
    expect(result.detectedAmount).toBeNull();
    expect(result.yapeOpCode).toBeNull();
  });

  // ── No-Yape ─────────────────────────────────────────────────────────────────

  it("imagen no-Yape: model devuelve {isYape: false} → confidence 'low' sin monto", async () => {
    // Arrange
    const yapeJson = JSON.stringify({
      isYape: false,
      razon: "Es una captura de Plin, no de Yape",
    });
    mockGenerateText.mockResolvedValue(makeGenerateTextResponse(yapeJson));

    // Act
    const result = await extractYapePayment(VALID_IMAGE_URL);

    // Assert
    expect(result.confidence).toBe("low");
    expect(result.detectedAmount).toBeNull();
    expect(result.yapeOpCode).toBeNull();
    expect(result.visionResponse.isYape).toBe(false);
    expect(result.visionResponse.reason).toContain("Plin");
  });

  // ── JSON malformado ─────────────────────────────────────────────────────────

  it("JSON malformado en respuesta → fallback a confidence 'low'", async () => {
    // Arrange — texto que no tiene JSON válido
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResponse("Lo siento, no puedo analizar esa imagen."),
    );

    // Act
    const result = await extractYapePayment(VALID_IMAGE_URL);

    // Assert
    expect(result.confidence).toBe("low");
    expect(result.detectedAmount).toBeNull();
    expect(result.visionResponse.reason).toBe("no-json-in-response");
  });

  it("respuesta con markdown fences alrededor del JSON → parsea correctamente", async () => {
    // Arrange — modelo envuelve con ```json ... ``` (común en Claude)
    const raw =
      "```json\n" +
      JSON.stringify({ monto: 10.0, codigoOperacion: "654321", confianza: "medium" }) +
      "\n```";
    mockGenerateText.mockResolvedValue(makeGenerateTextResponse(raw));

    // Act
    const result = await extractYapePayment(VALID_IMAGE_URL);

    // Assert
    expect(result.detectedAmount).toBe(10.0);
    expect(result.confidence).toBe("medium");
  });

  // ── Schema mismatch ─────────────────────────────────────────────────────────

  it("schema mismatch — campo confianza con valor inválido → fallback confidence 'low'", async () => {
    // Arrange — confianza tiene un valor fuera del enum
    const obj = {
      monto: 30.0,
      codigoOperacion: "999888",
      confianza: "ultra-high", // valor inválido para el enum
    };
    mockGenerateText.mockResolvedValue(
      makeGenerateTextResponse(JSON.stringify(obj)),
    );

    // Act
    const result = await extractYapePayment(VALID_IMAGE_URL);

    // Assert
    // Zod .passthrough() acepta campos extra pero el enum falla
    // NOTA: YapeJsonSchema usa z.enum().optional(), así que un valor
    // inválido sí falla safeParse → schema-mismatch
    expect(result.confidence).toBe("low");
    expect(result.visionResponse.reason).toBe("schema-mismatch");
  });

  // ── Cost guard ──────────────────────────────────────────────────────────────

  it("cost guard: si canSpend() retorna false → no llama al modelo y retorna low", async () => {
    // Arrange
    mockCanSpend.mockResolvedValue(false);

    // Act
    const result = await extractYapePayment(VALID_IMAGE_URL);

    // Assert
    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(result.confidence).toBe("low");
    expect(result.visionResponse.reason).toBe("ai-budget-exhausted");
    expect(mockRecordSpend).not.toHaveBeenCalled();
  });

  it("cost guard: si canSpend() retorna true → llama al modelo y registra gasto", async () => {
    // Arrange
    mockCanSpend.mockResolvedValue(true);
    const yapeJson = JSON.stringify({ monto: 5.0, codigoOperacion: "100200", confianza: "medium" });
    mockGenerateText.mockResolvedValue(makeGenerateTextResponse(yapeJson));

    // Act
    await extractYapePayment(VALID_IMAGE_URL);

    // Assert
    expect(mockGenerateText).toHaveBeenCalledOnce();
    expect(mockRecordSpend).toHaveBeenCalledWith("__yape_vision__", 0.005);
  });

  // ── Error de red del modelo ─────────────────────────────────────────────────

  it("si generateText lanza → devuelve confidence 'low' sin propagar el error", async () => {
    // Arrange
    mockGenerateText.mockRejectedValue(new Error("Network timeout"));

    // Act
    const result = await extractYapePayment(VALID_IMAGE_URL);

    // Assert
    expect(result.confidence).toBe("low");
    expect(result.visionResponse.reason).toBe("model-call-failed");
    // No recordSpend cuando falla antes de completar
    expect(mockRecordSpend).not.toHaveBeenCalled();
  });

  // ── Inputs alternativos ─────────────────────────────────────────────────────

  it("acepta Uint8Array como input (Twilio/Meta bytes) sin lanzar", async () => {
    // Arrange
    const bytes = new Uint8Array([137, 80, 78, 71]); // PNG magic bytes
    const yapeJson = JSON.stringify({ monto: 8.0, codigoOperacion: "445566", confianza: "medium" });
    mockGenerateText.mockResolvedValue(makeGenerateTextResponse(yapeJson));

    // Act & Assert — no debe lanzar
    const result = await extractYapePayment(bytes);
    expect(result.detectedAmount).toBe(8.0);
  });

  it("acepta URL object como input", async () => {
    // Arrange
    const url = new URL("https://s3.example.com/yape.jpg");
    const yapeJson = JSON.stringify({ monto: 12.0, codigoOperacion: "667788", confianza: "high" });
    mockGenerateText.mockResolvedValue(makeGenerateTextResponse(yapeJson));

    // Act
    const result = await extractYapePayment(url);

    // Assert
    expect(result.detectedAmount).toBe(12.0);
  });
});

// ─── Helpers privados: toNumber, toLast4, toOpCode, toDate ────────────────────
// Los testeamos indirectamente inyectando diferentes formatos en el JSON

describe("helpers de parseo (via extractYapePayment)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanSpend.mockResolvedValue(true);
  });

  it("toNumber: monto como string con símbolo 'S/ 12.50' → 12.5", async () => {
    const yapeJson = JSON.stringify({ monto: "S/ 12.50", codigoOperacion: "123456", confianza: "medium" });
    mockGenerateText.mockResolvedValue(makeGenerateTextResponse(yapeJson));
    const result = await extractYapePayment(VALID_IMAGE_URL);
    expect(result.detectedAmount).toBe(12.5);
  });

  it("toNumber: monto como string con coma decimal '45,00' → 45.0", async () => {
    const yapeJson = JSON.stringify({ monto: "45,00", codigoOperacion: "123456", confianza: "medium" });
    mockGenerateText.mockResolvedValue(makeGenerateTextResponse(yapeJson));
    const result = await extractYapePayment(VALID_IMAGE_URL);
    expect(result.detectedAmount).toBe(45.0);
  });

  it("toNumber: monto null → detectedAmount null", async () => {
    const yapeJson = JSON.stringify({ monto: null, codigoOperacion: "123456", confianza: "medium" });
    mockGenerateText.mockResolvedValue(makeGenerateTextResponse(yapeJson));
    const result = await extractYapePayment(VALID_IMAGE_URL);
    expect(result.detectedAmount).toBeNull();
  });

  it("toLast4: last4 como número 51987651234 → '1234' (últimos 4 dígitos)", async () => {
    const yapeJson = JSON.stringify({ monto: 10.0, codigoOperacion: "123456", last4: 51987651234, confianza: "medium" });
    mockGenerateText.mockResolvedValue(makeGenerateTextResponse(yapeJson));
    const result = await extractYapePayment(VALID_IMAGE_URL);
    expect(result.yapeLast4).toBe("1234");
  });

  it("toLast4: last4 '***5678' (formato enmascarado) → '5678'", async () => {
    const yapeJson = JSON.stringify({ monto: 10.0, codigoOperacion: "123456", last4: "***5678", confianza: "medium" });
    mockGenerateText.mockResolvedValue(makeGenerateTextResponse(yapeJson));
    const result = await extractYapePayment(VALID_IMAGE_URL);
    expect(result.yapeLast4).toBe("5678");
  });

  it("toLast4: last4 con menos de 4 dígitos → null", async () => {
    const yapeJson = JSON.stringify({ monto: 10.0, codigoOperacion: "123456", last4: "12", confianza: "medium" });
    mockGenerateText.mockResolvedValue(makeGenerateTextResponse(yapeJson));
    const result = await extractYapePayment(VALID_IMAGE_URL);
    expect(result.yapeLast4).toBeNull();
  });

  it("toOpCode: código con 6+ dígitos → se preserva", async () => {
    const yapeJson = JSON.stringify({ monto: 10.0, codigoOperacion: "987654321", confianza: "medium" });
    mockGenerateText.mockResolvedValue(makeGenerateTextResponse(yapeJson));
    const result = await extractYapePayment(VALID_IMAGE_URL);
    expect(result.yapeOpCode).toBe("987654321");
  });

  it("toOpCode: código con menos de 6 dígitos → null", async () => {
    const yapeJson = JSON.stringify({ monto: 10.0, codigoOperacion: "123", confianza: "medium" });
    mockGenerateText.mockResolvedValue(makeGenerateTextResponse(yapeJson));
    const result = await extractYapePayment(VALID_IMAGE_URL);
    expect(result.yapeOpCode).toBeNull();
  });

  it("toDate: fecha ISO válida → Date object", async () => {
    const yapeJson = JSON.stringify({ monto: 10.0, codigoOperacion: "123456", fecha: "2026-05-02T15:00:00.000Z", confianza: "medium" });
    mockGenerateText.mockResolvedValue(makeGenerateTextResponse(yapeJson));
    const result = await extractYapePayment(VALID_IMAGE_URL);
    expect(result.yapeDate).toBeInstanceOf(Date);
    expect(result.yapeDate?.getFullYear()).toBe(2026);
  });

  it("toDate: fecha inválida → null", async () => {
    const yapeJson = JSON.stringify({ monto: 10.0, codigoOperacion: "123456", fecha: "not-a-date", confianza: "medium" });
    mockGenerateText.mockResolvedValue(makeGenerateTextResponse(yapeJson));
    const result = await extractYapePayment(VALID_IMAGE_URL);
    expect(result.yapeDate).toBeNull();
  });

  it("toDate: fecha null → null", async () => {
    const yapeJson = JSON.stringify({ monto: 10.0, codigoOperacion: "123456", fecha: null, confianza: "medium" });
    mockGenerateText.mockResolvedValue(makeGenerateTextResponse(yapeJson));
    const result = await extractYapePayment(VALID_IMAGE_URL);
    expect(result.yapeDate).toBeNull();
  });
});
