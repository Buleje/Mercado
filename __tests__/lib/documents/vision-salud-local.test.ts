// @vitest-environment node
/**
 * Un Ollama local apagado tardaba ~10 s en dar «connect timeout» antes de que
 * el análisis pasara al OCR. Ahora se pregunta rápido y se recuerda.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const imagen = { url: "https://x/y.png", mimeType: "image/png", descargar: async () => Buffer.from("png") };

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DOC_VISION_BASE_URL", "http://127.0.0.1:11434/v1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("visión con servidor local", () => {
  it("apagado: falla al toque y no lo vuelve a esperar en el minuto siguiente", async () => {
    const fetchFalso = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    vi.stubGlobal("fetch", fetchFalso);
    const { describirImagenConVision } = await import("@/lib/documents/vision-describe");

    expect(await describirImagenConVision(imagen, [])).toEqual({ ok: false, motivo: "falla" });
    expect(await describirImagenConVision(imagen, [])).toEqual({ ok: false, motivo: "falla" });
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(String((fetchFalso.mock.calls[0] as unknown[])[0])).toMatch(/\/models$/);
  });

  it("prendido: pregunta una vez y después va directo al modelo", async () => {
    const fetchFalso = vi.fn(async (url: string) =>
      url.endsWith("/models")
        ? new Response("{}", { status: 200 })
        : new Response(JSON.stringify({ choices: [{ message: { content: '{"summary":"Licencia","description":"Licencia de funcionamiento"}' } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchFalso);
    const { describirImagenConVision } = await import("@/lib/documents/vision-describe");

    await describirImagenConVision(imagen, []);
    await describirImagenConVision(imagen, []);
    const urls = fetchFalso.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u.endsWith("/models"))).toHaveLength(1);
    expect(urls.filter((u) => u.endsWith("/chat/completions"))).toHaveLength(2);
  });

  it("un proveedor en la nube no se pregunta", async () => {
    vi.stubEnv("DOC_VISION_BASE_URL", "https://api.openai.com/v1");
    const fetchFalso = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchFalso);
    const { describirImagenConVision } = await import("@/lib/documents/vision-describe");

    await describirImagenConVision(imagen, []);
    expect(fetchFalso.mock.calls.map((c) => String((c as unknown[])[0]))).toEqual(["https://api.openai.com/v1/chat/completions"]);
  });
});
