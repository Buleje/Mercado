/**
 * /api/admin/forestal/loth/placa-ocr (28-09): lee el código de la placa del
 * tocón. Sin llamar a la IA: `fetch` simulado con lo que «leyó» el modelo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { rateLimitMock, logger, gasto } = vi.hoisted(() => ({
  rateLimitMock: vi.fn((..._args: unknown[]): Response | null => null),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  gasto: { canSpend: vi.fn(async (..._a: unknown[]) => true), recordSpend: vi.fn(async (..._a: unknown[]) => undefined) },
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: async () => ({ tenantId: "t-qa-placa", role: "admin" }) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimitWithTenant: (...a: unknown[]) => rateLimitMock(...a) }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/ai/cost-control", () => ({ aiCostGuard: gasto }));
vi.mock("@/lib/logger", () => ({ logger }));

const original = { ...process.env };
/* Con la firma real de un JPEG (FF D8 FF = «/9j/»): el lector mira los bytes, no lo declarado. */
const IMAGEN = `data:image/jpeg;base64,/9j/${"A".repeat(400)}`;

async function leer(leido: unknown, body: unknown = { image: IMAGEN }) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(leido) } }] }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const { POST } = await import("@/app/api/admin/forestal/loth/placa-ocr/route");
  const res = await POST(
    new NextRequest("http://localhost/api/admin/forestal/loth/placa-ocr", { method: "POST", body: JSON.stringify(body) }),
  );
  return { res, j: (await res.json()) as Record<string, unknown>, fetchMock };
}

beforeEach(() => {
  vi.resetModules();
  rateLimitMock.mockClear();
  logger.warn.mockClear();
  logger.error.mockClear();
  gasto.recordSpend.mockClear();
  process.env.OPENAI_API_KEY = "sk-test";
  delete process.env.ANTHROPIC_API_KEY;
});
afterEach(() => {
  process.env = { ...original };
  vi.unstubAllGlobals();
});

describe("placa-ocr", () => {
  it("devuelve el código leído, limpio, con su confianza", async () => {
    const { res, j, fetchMock } = await leer({ codigo: "N° 0114", confianza: 0.93, nota: "" });
    expect(res.status).toBe(200);
    expect(j).toEqual({ codigo: "0114", confianza: 0.93, nota: "" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("el límite es por tienda (tenant verificado), no por el texto del prefijo", async () => {
    await leer({ codigo: "85-TOR", confianza: 0.9, nota: "" });
    expect(rateLimitMock).toHaveBeenCalledWith(expect.anything(), "MODERATE", "t-qa-placa", "loth-placa-ocr", expect.any(Object));
  });

  it("una confianza en porcentaje se pasa a 0-1; sin código, confianza 0", async () => {
    expect((await leer({ codigo: "85-TOR", confianza: 88, nota: "" })).j.confianza).toBe(0.88);
    vi.resetModules();
    const { j } = await leer({ codigo: "ilegible", confianza: 0.9, nota: "placa tapada con barro" });
    expect(j).toEqual({ codigo: "", confianza: 0, nota: "placa tapada con barro" });
  });

  it("un null del modelo no tumba la lectura", async () => {
    const { res, j } = await leer({ codigo: null, confianza: null, nota: null });
    expect(res.status).toBe(200);
    expect(j.codigo).toBe("");
  });

  it("sin clave de IA: 503 con un mensaje para la persona, sin llamar a nadie", async () => {
    delete process.env.OPENAI_API_KEY;
    const { res, j, fetchMock } = await leer({ codigo: "114", confianza: 1, nota: "" });
    expect(res.status).toBe(503);
    /* El aviso único; al admin de un negocio, sin el detalle de la clave de la
       plataforma (auditoría 2026-10-02). Con superadmin: test de constancia-ocr. */
    expect(j).toEqual({
      error: "La lectura con IA no está disponible ahora; avisa al administrador. Mientras tanto, carga los datos a mano.",
      codigo: "ia_no_disponible",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sólo JPEG en data URL; una PNG o texto suelto se rechaza antes de gastar", async () => {
    const png = await leer({ codigo: "114", confianza: 1, nota: "" }, { image: `data:image/png;base64,${"A".repeat(400)}` });
    expect(png.res.status).toBe(400);
    expect(png.fetchMock).not.toHaveBeenCalled();
    vi.resetModules();
    const suelto = await leer({ codigo: "114", confianza: 1, nota: "" }, { image: "hola" });
    expect(suelto.res.status).toBe(400);
  });

  it("una foto más grande que el tope se corta con 413 por el content-length", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { POST } = await import("@/app/api/admin/forestal/loth/placa-ocr/route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/forestal/loth/placa-ocr", {
        method: "POST",
        headers: { "content-length": String(5_000_000) },
        body: JSON.stringify({ image: IMAGEN }),
      }),
    );
    expect(res.status).toBe(413);
  });

  it("la imagen nunca va al log, ni cuando falla el proveedor", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/admin/forestal/loth/placa-ocr/route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/forestal/loth/placa-ocr", { method: "POST", body: JSON.stringify({ image: IMAGEN }) }),
    );
    /* Un 500 del proveedor es «la IA está saturada» (503), en palabras; antes era un 502 mudo. */
    expect(res.status).toBe(503);
    expect(((await res.json()) as { codigo?: string }).codigo).toBe("ia_saturada");
    const logueado = JSON.stringify([...logger.warn.mock.calls, ...logger.error.mock.calls]);
    expect(logueado).not.toContain("AAAAAAAAAA");
  });

  it("auditoría 2: un PDF anunciado como JPEG pasa el Zod (mira lo declarado) pero el lector lo frena: 400 sin llamar", async () => {
    const { res, j, fetchMock } = await leer({ codigo: "114", confianza: 1, nota: "" }, { image: `data:image/jpeg;base64,JVBERi0${"A".repeat(400)}` });
    expect(res.status).toBe(400);
    expect(j.codigo).toBe("formato_no_soportado");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(gasto.recordSpend).not.toHaveBeenCalled();
  });

  it("auditoría 1: la IA cobró pero la respuesta no se entiende → 422 Y se anota el gasto", async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "x".repeat(50) }], stop_reason: "max_tokens", usage: { input_tokens: 3000, output_tokens: 2248 } }), { status: 200 })),
    );
    const { POST } = await import("@/app/api/admin/forestal/loth/placa-ocr/route");
    const res = await POST(new NextRequest("http://localhost/api/admin/forestal/loth/placa-ocr", { method: "POST", body: JSON.stringify({ image: IMAGEN }) }));
    expect(res.status).toBe(422);
    /* 3 000 × US$2/M + 2 248 × US$10/M = 0,0285 → 0,03. */
    expect(gasto.recordSpend).toHaveBeenCalledWith("t-qa-placa", 0.03);
  });

  it("clave de Claude sin crédito: al admin del negocio, el aviso genérico; no se anota gasto", async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } }), { status: 400 })),
    );
    const { POST } = await import("@/app/api/admin/forestal/loth/placa-ocr/route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/forestal/loth/placa-ocr", { method: "POST", body: JSON.stringify({ image: IMAGEN }) }),
    );
    expect(res.status).toBe(503);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j).toMatchObject({ codigo: "ia_no_disponible", error: expect.stringMatching(/avisa al administrador/) });
    expect(JSON.stringify(j)).not.toMatch(/crédito|console\.anthropic/);
    expect(gasto.recordSpend).not.toHaveBeenCalled();
  });
});
