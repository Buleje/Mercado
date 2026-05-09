/**
 * Tests para tracking event-based de streamText (round 28+).
 *
 * Cubre:
 *  - Normalización de usage en ambos shapes (promptTokens vs inputTokens).
 *  - Cálculo de costo USD usando tabla PRICING_PER_1M.
 *  - Logging structured con tenantId + feature + duración.
 *  - recordSpend fire-and-forget (no propaga errores).
 *  - finishReason "abort" no rompe el handler (registro parcial OK).
 *  - userOnFinish wrapped en try/catch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};
vi.mock("@/lib/logger", () => ({ logger: loggerMock }));

const recordSpendMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/ai/cost-control", () => ({
  aiCostGuard: {
    recordSpend: (...args: unknown[]) => recordSpendMock(...args),
    canSpend: vi.fn().mockResolvedValue(true),
  },
}));

describe("makeStreamUsageHandler", () => {
  let makeStreamUsageHandler: typeof import("@/lib/ai/track-usage").makeStreamUsageHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/lib/ai/track-usage");
    makeStreamUsageHandler = mod.makeStreamUsageHandler;
  });

  it("logs tokens y costo cuando el stream termina con shape clásico", async () => {
    const onFinish = makeStreamUsageHandler({
      tenantId: "main",
      feature: "ai-chat",
      model: "claude-haiku-4-5",
    });

    await onFinish({
      finishReason: "stop",
      usage: { promptTokens: 200, completionTokens: 1000, totalTokens: 1200 },
    });

    expect(loggerMock.info).toHaveBeenCalledWith(
      "[ai-track] stream finished",
      expect.objectContaining({
        tenantId: "main",
        feature: "ai-chat",
        model: "claude-haiku-4-5",
        promptTokens: 200,
        completionTokens: 1000,
        totalTokens: 1200,
        finishReason: "stop",
      }),
    );

    // Costo: (200 * 1.0 + 1000 * 5.0) / 1M = 0.0052
    const callArg = loggerMock.info.mock.calls[0][1] as Record<string, unknown>;
    expect(callArg.costUsd).toBeCloseTo(0.0052, 6);
  });

  it("normaliza shape Anthropic (inputTokens/outputTokens)", async () => {
    const onFinish = makeStreamUsageHandler({
      tenantId: "tenant-2",
      feature: "ai-chat",
      model: "claude-haiku-4-5-20251001",
    });

    await onFinish({
      finishReason: "stop",
      // Solo expone shape "nuevo"
      usage: { inputTokens: 100, outputTokens: 500 },
    });

    const callArg = loggerMock.info.mock.calls[0][1] as Record<string, unknown>;
    expect(callArg.promptTokens).toBe(100);
    expect(callArg.completionTokens).toBe(500);
    expect(callArg.totalTokens).toBe(600);
  });

  it("registra spend solo si costUsd > 0", async () => {
    const onFinish = makeStreamUsageHandler({
      tenantId: "tenant-3",
      feature: "ai-chat",
      model: "claude-haiku-4-5",
    });

    await onFinish({
      finishReason: "stop",
      usage: { promptTokens: 0, completionTokens: 0 },
    });

    expect(recordSpendMock).not.toHaveBeenCalled();
  });

  it("no propaga error si recordSpend falla", async () => {
    recordSpendMock.mockRejectedValueOnce(new Error("redis down"));

    const onFinish = makeStreamUsageHandler({
      tenantId: "tenant-4",
      feature: "ai-chat",
      model: "claude-haiku-4-5",
    });

    await expect(
      onFinish({
        finishReason: "stop",
        usage: { promptTokens: 100, completionTokens: 100 },
      }),
    ).resolves.toBeUndefined();

    // Esperar microtask para que el .catch() ejecute
    await new Promise((r) => setImmediate(r));

    expect(loggerMock.warn).toHaveBeenCalledWith(
      "[ai-track] stream recordSpend failed",
      expect.objectContaining({ tenantId: "tenant-4" }),
    );
  });

  it("registra incluso cuando finishReason es 'abort' (cancelación cliente)", async () => {
    const onFinish = makeStreamUsageHandler({
      tenantId: "tenant-5",
      feature: "ai-chat",
      model: "claude-haiku-4-5",
    });

    await onFinish({
      finishReason: "abort",
      usage: { promptTokens: 50, completionTokens: 30 },
    });

    expect(loggerMock.info).toHaveBeenCalledWith(
      "[ai-track] stream finished",
      expect.objectContaining({
        finishReason: "abort",
        promptTokens: 50,
        completionTokens: 30,
      }),
    );
  });

  it("invoca userOnFinish y aísla errores del callback externo", async () => {
    const userCb = vi.fn().mockRejectedValueOnce(new Error("user threw"));

    const onFinish = makeStreamUsageHandler({
      tenantId: "tenant-6",
      feature: "ai-chat",
      model: "claude-haiku-4-5",
      onFinish: userCb,
    });

    await expect(
      onFinish({
        finishReason: "stop",
        usage: { promptTokens: 10, completionTokens: 10 },
      }),
    ).resolves.toBeUndefined();

    expect(userCb).toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "[ai-track] user onFinish threw",
      expect.objectContaining({ tenantId: "tenant-6", feature: "ai-chat" }),
    );
  });

  it("usa pricing default para modelo desconocido", async () => {
    const onFinish = makeStreamUsageHandler({
      tenantId: "tenant-7",
      feature: "ai-chat",
      model: "modelo-misterioso-99",
    });

    await onFinish({
      finishReason: "stop",
      usage: { promptTokens: 1000, completionTokens: 1000 },
    });

    // Default pricing: 3.0 input + 15.0 output / 1M = 0.018
    const callArg = loggerMock.info.mock.calls[0][1] as Record<string, unknown>;
    expect(callArg.costUsd).toBeCloseTo(0.018, 6);
  });

  it("maneja usage undefined sin crashear", async () => {
    const onFinish = makeStreamUsageHandler({
      tenantId: "tenant-8",
      feature: "ai-chat",
      model: "claude-haiku-4-5",
    });

    await expect(
      onFinish({ finishReason: "stop", usage: undefined }),
    ).resolves.toBeUndefined();

    const callArg = loggerMock.info.mock.calls[0][1] as Record<string, unknown>;
    expect(callArg.totalTokens).toBe(0);
    expect(callArg.costUsd).toBe(0);
  });
});
