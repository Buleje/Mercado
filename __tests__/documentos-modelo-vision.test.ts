import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const original = { ...process.env };
beforeEach(() => { vi.resetModules(); });
afterEach(() => { process.env = { ...original }; });

async function config(base: string) {
  process.env.DOC_VISION_BASE_URL = base;
  const { configVisionPropia } = await import("@/lib/documents/modelo-vision");
  return configVisionPropia();
}

describe("configVisionPropia — la URL del proveedor de visión", () => {
  it("cambia localhost por 127.0.0.1 (en WSL, fetch prueba IPv6 y falla)", async () => {
    expect((await config("http://localhost:11434/v1"))?.baseUrl).toBe("http://127.0.0.1:11434/v1");
  });

  it("perdona la barra final y el /chat/completions pegado de la doc", async () => {
    expect((await config("https://api.openai.com/v1/"))?.baseUrl).toBe("https://api.openai.com/v1");
    expect((await config("https://api.openai.com/v1/chat/completions"))?.baseUrl).toBe("https://api.openai.com/v1");
  });

  it("no toca un dominio que apenas contiene 'localhost'", async () => {
    expect((await config("https://localhost.midominio.pe/v1"))?.baseUrl).toBe("https://localhost.midominio.pe/v1");
  });

  it("sin variable, no hay endpoint propio (se usa la infra del proyecto)", async () => {
    delete process.env.DOC_VISION_BASE_URL;
    const { configVisionPropia } = await import("@/lib/documents/modelo-vision");
    expect(configVisionPropia()).toBeNull();
  });
});
