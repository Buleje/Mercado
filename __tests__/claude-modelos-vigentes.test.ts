/**
 * Paso a Haiku 5.5 / Sonnet 5.5 (2026-10-15).
 *
 * Los modelos nuevos devuelven 400 con `temperature` distinto del default y
 * razonan dentro de `max_tokens`. Se prueba por el camino real: `generateText`
 * del AI SDK → `anthropicProvider` (con su `fetch` propio) → el cuerpo que
 * saldría hacia api.anthropic.com, capturado con un `fetch` falso.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/ai/cost-control", () => ({
  aiCostGuard: { recordSpend: vi.fn().mockResolvedValue(undefined), canSpend: vi.fn().mockResolvedValue(true) },
}));

const cuerpos: Array<Record<string, unknown>> = [];

/** Respuesta de Messages API con un bloque `thinking` vacío por delante, como los modelos 5.5. */
function respuestaClaude(model: string): Response {
  return new Response(
    JSON.stringify({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model,
      content: [
        { type: "thinking", thinking: "", signature: "firma" },
        { type: "text", text: "hola" },
      ],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

beforeAll(() => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-0000000000000000000000000000";
});

beforeEach(() => {
  cuerpos.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      cuerpos.push(body);
      return respuestaClaude(String(body.model));
    }),
  );
});

describe("lib/claude-router — fuente única de IDs", () => {
  it("haiku y sonnet apuntan a la generación 5.5; opus no cambia", async () => {
    const { MODEL_IDS, GATEWAY_MODEL_IDS, routeModel } = await import("@/lib/claude-router");
    expect(MODEL_IDS).toEqual({ haiku: "claude-haiku-5-5", sonnet: "claude-sonnet-5-5", opus: "claude-opus-5-5" });
    expect(GATEWAY_MODEL_IDS.haiku).toBe("anthropic/claude-haiku-5.5");
    expect(routeModel("fix typo in README")).toMatchObject({ modelId: "claude-haiku-5-5", estimatedCostMultiplier: 0.025 });
  });

  it("rejectsSamplingParams: sí en la familia 5 y Opus 4.7/4.8, no en Haiku 4.5 ni la línea 4.6", async () => {
    const { rejectsSamplingParams } = await import("@/lib/claude-router");
    for (const id of ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-sonnet-5", "claude-opus-5-5", "anthropic/claude-haiku-5.5", "claude-opus-4-7"]) {
      expect(rejectsSamplingParams(id), id).toBe(true);
    }
    for (const id of ["claude-haiku-4-5", "claude-haiku-4-5-20251001", "claude-sonnet-4-6", "gpt-4o-mini", "openai/gpt-oss-20b"]) {
      expect(rejectsSamplingParams(id), id).toBe(false);
    }
  });
});

describe("lib/ai/provider — fetch de Claude vigente", () => {
  it("Haiku 5.5: quita temperature/topK, pide effort low y suma margen al tope; lee el texto aunque venga thinking primero", async () => {
    const { generateText } = await import("ai");
    const { chatModel, chatModelId } = await import("@/lib/ai/provider");
    expect(chatModelId).toBe("claude-haiku-5-5");

    const { text } = await generateText({ model: chatModel, prompt: "hola", maxOutputTokens: 200, temperature: 0.7, topK: 5 });

    expect(text).toBe("hola");
    const body = cuerpos[0];
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("top_k");
    expect(body.output_config).toEqual({ effort: "low" });
    expect(body.max_tokens).toBe(200 + 1_024);
  });

  it("un effort explícito se respeta y no se toca el tope", async () => {
    const { generateText } = await import("ai");
    const { smartModel, smartModelId } = await import("@/lib/ai/provider");
    expect(smartModelId).toBe("claude-sonnet-5-5");

    await generateText({
      model: smartModel,
      prompt: "hola",
      maxOutputTokens: 500,
      providerOptions: { anthropic: { effort: "high" } },
    });

    expect(cuerpos[0].output_config).toEqual({ effort: "high" });
    expect(cuerpos[0].max_tokens).toBe(500);
  });

  it("Haiku 4.5 (legacy) sigue recibiendo temperature y sin effort", async () => {
    const { generateText } = await import("ai");
    const { anthropicProvider } = await import("@/lib/ai/provider");

    await generateText({ model: anthropicProvider("claude-haiku-4-5"), prompt: "hola", maxOutputTokens: 200, temperature: 0.7 });

    expect(cuerpos[0].temperature).toBe(0.7);
    expect(cuerpos[0]).not.toHaveProperty("output_config");
    expect(cuerpos[0].max_tokens).toBe(200);
  });
});

describe("lib/llm-providers/anthropic — fetch directo", () => {
  it("Sonnet 5.5 sale sin temperature; Haiku 4.5 la conserva", async () => {
    const { anthropicProvider } = await import("@/lib/llm-providers/anthropic");
    expect(anthropicProvider.models).toEqual({ cheap: "claude-haiku-5-5", balanced: "claude-sonnet-5-5", premium: "claude-opus-5-5" });

    const opts = { messages: [{ role: "user" as const, content: "hola" }], temperature: 0.4 };
    const r = await anthropicProvider.chat(opts, anthropicProvider.models.balanced);
    await anthropicProvider.chat(opts, "claude-haiku-4-5");

    expect(r.ok).toBe(true);
    expect(r.content).toBe("hola");
    expect(cuerpos[0]).not.toHaveProperty("temperature");
    expect(cuerpos[1].temperature).toBe(0.4);
  });
});

describe("lib/ai/track-usage — tarifa de Haiku 5.5", () => {
  it("cobra $0,10/$0,50 y pasa a $0,50/$2,50 con prompts de más de 100K", async () => {
    const { calculateCostUsd } = await import("@/lib/ai/track-usage");
    expect(calculateCostUsd("claude-haiku-5-5", { promptTokens: 1_000, completionTokens: 1_000 })).toBeCloseTo(0.0006, 10);
    expect(calculateCostUsd("claude-haiku-5-5", { promptTokens: 200_000, completionTokens: 1_000 })).toBeCloseTo(0.1025, 10);
    expect(calculateCostUsd("claude-sonnet-5-5", { promptTokens: 1_000, completionTokens: 1_000 })).toBeCloseTo(0.012, 10);
    // Lo legacy no cambia: el historial ya grabado lo cita.
    expect(calculateCostUsd("claude-haiku-4-5", { promptTokens: 1_000, completionTokens: 1_000 })).toBeCloseTo(0.006, 10);
  });
});
