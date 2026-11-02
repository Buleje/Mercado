/**
 * Buleje IA (ADR-528) — modelos con la clave del negocio: traducción de fotos
 * y herramientas a los 2 protocolos, mapeo de errores de cada proveedor y la
 * barrera anti-SSRF de la dirección «personalizada».
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { aMensajesAnthropic, aMensajesOpenAI, aToolsAnthropic } from "@/lib/ia-proveedores/traduccion";
import { estadoDeHttp, estadoDeExcepcion, esFallaDeCuenta } from "@/lib/ia-proveedores/errores";
import { CATALOGO_IA, esIpPrivada, modeloLeeFotos, validarBaseUrl } from "@/lib/ia-proveedores/catalogo";
import { chatConClave, conexionDe, listarModelos, type ConexionIa } from "@/lib/ia-proveedores/adaptador";
import { PROVEEDORES_IA } from "@/lib/ia-proveedores/tipos";
import { groqProvider } from "@/lib/llm-providers/groq";
import { ERROR_SIN_VISION, type ChatMessage } from "@/lib/llm-providers/types";

const FOTO = { type: "image" as const, mime: "image/jpeg", base64: "QUJD" };

const conversacion: ChatMessage[] = [
  { role: "system", content: "Eres el asistente." },
  { role: "user", content: [{ type: "text", text: "Anota el recibo" }, FOTO] },
  {
    role: "assistant",
    content: "",
    tool_calls: [{ id: "call_1", function: { name: "plata_registrar_gasto", arguments: '{"monto":200}' } }],
  },
  { role: "tool", tool_call_id: "call_1", content: '{"propuesta":true}' },
];

describe("catálogo", () => {
  it("trae los 12 proveedores del contrato, en el mismo orden", () => {
    expect(CATALOGO_IA.map((p) => p.id)).toEqual([...PROVEEDORES_IA]);
  });
  it("solo «personalizado» va sin dirección; todas las demás son https", () => {
    for (const p of CATALOGO_IA) {
      if (p.id === "personalizado") expect(p.baseUrl).toBeNull();
      else expect(p.baseUrl).toMatch(/^https:\/\/[^/]+/);
    }
  });
  it("sabe qué modelos leen fotos", () => {
    expect(modeloLeeFotos("anthropic", "claude-sonnet-5-5")).toBe(true);
    expect(modeloLeeFotos("groq", "openai/gpt-oss-120b")).toBe(false);
    expect(modeloLeeFotos("deepseek", "deepseek-chat")).toBe(false);
    expect(modeloLeeFotos("qwen", "qwen-vl-max")).toBe(true);
  });
});

describe("traducción de fotos y herramientas", () => {
  it("OpenAI-compatible: la foto va como image_url con data: y los tool_calls con type function", () => {
    const out = aMensajesOpenAI(conversacion);
    expect(out[1].content).toEqual([
      { type: "text", text: "Anota el recibo" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,QUJD" } },
    ]);
    expect(out[2].tool_calls).toEqual([
      { id: "call_1", type: "function", function: { name: "plata_registrar_gasto", arguments: '{"monto":200}' } },
    ]);
    expect(out[3]).toMatchObject({ role: "tool", tool_call_id: "call_1" });
  });

  it("Anthropic: system aparte, foto como bloque image base64, tool_use y tool_result con tool_use_id", () => {
    const { system, messages } = aMensajesAnthropic(conversacion);
    expect(system).toBe("Eres el asistente.");
    expect(messages[0]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "Anota el recibo" },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } },
      ],
    });
    expect(messages[1]).toEqual({
      role: "assistant",
      content: [{ type: "tool_use", id: "call_1", name: "plata_registrar_gasto", input: { monto: 200 } }],
    });
    expect(messages[2]).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "call_1", content: '{"propuesta":true}' }],
    });
  });

  it("Anthropic: dos tool_result seguidos se juntan en un solo user (Claude exige alternar)", () => {
    const { messages } = aMensajesAnthropic([
      { role: "user", content: "hola" },
      { role: "tool", tool_call_id: "a", content: "1" },
      { role: "tool", tool_call_id: "b", content: "2" },
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toHaveLength(3);
  });

  it("herramientas OpenAI → input_schema de Claude", () => {
    expect(
      aToolsAnthropic([{ type: "function", function: { name: "x", description: "d", parameters: { type: "object" } } }]),
    ).toEqual([{ name: "x", description: "d", input_schema: { type: "object" } }]);
  });

  it("Groq de la plataforma no lee fotos: falla claro, sin llamar", async () => {
    const prev = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = "gsk_test";
    const r = await groqProvider.chat({ messages: conversacion.slice(0, 2), temperature: 0 }, "openai/gpt-oss-120b");
    process.env.GROQ_API_KEY = prev;
    expect(r.ok).toBe(false);
    expect(r.error).toBe(ERROR_SIN_VISION);
  });
});

describe("errores de cada proveedor → un estado", () => {
  it.each([
    [401, '{"error":{"message":"Incorrect API key provided"}}', "clave_invalida"],
    [400, '{"error":{"message":"API key not valid. Please pass a valid API key."}}', "clave_invalida"],
    [402, '{"error":{"message":"Insufficient Balance"}}', "sin_credito"],
    [429, '{"error":{"code":"insufficient_quota","message":"You exceeded your current quota"}}', "sin_credito"],
    [400, '{"error":{"message":"Your credit balance is too low to access the Anthropic API"}}', "sin_credito"],
    [429, '{"error":{"message":"Rate limit reached for requests per minute"}}', "limite_ia"],
    [404, '{"error":{"code":"model_not_found"}}', "modelo_no_disponible"],
    [400, '{"error":{"message":"The model `llama-3.1-8b` has been decommissioned"}}', "modelo_no_disponible"],
    [403, '{"error":{"message":"Project does not have access"}}', "sin_permiso"],
    [500, "boom", "error"],
  ])("HTTP %i → %s", (status, cuerpo, estado) => {
    expect(estadoDeHttp(status, cuerpo)).toBe(estado);
  });

  it("red caída / tiempo = sin_conexion; SSRF bloqueado = sin_permiso", () => {
    expect(estadoDeExcepcion(new TypeError("fetch failed"))).toBe("sin_conexion");
    const e = new Error("x");
    e.name = "SsrfBlockedError";
    expect(estadoDeExcepcion(e)).toBe("sin_permiso");
  });

  it("solo las fallas de cuenta se anotan en la tarjeta", () => {
    expect(esFallaDeCuenta("clave_invalida")).toBe(true);
    expect(esFallaDeCuenta("sin_credito")).toBe(true);
    expect(esFallaDeCuenta("limite_ia")).toBe(false);
    expect(esFallaDeCuenta("sin_conexion")).toBe(false);
  });
});

describe("SSRF: dirección del personalizado", () => {
  it.each([
    "http://mi-servidor.com/v1",
    "ftp://x.com",
    "https://user:pass@x.com/v1",
    "https://x.com/v1?redir=1",
  ])("rechaza «%s» siempre", (u) => {
    expect(validarBaseUrl(u, { produccion: false }).ok).toBe(false);
  });

  it.each([
    "https://127.0.0.1/v1",
    "https://10.0.0.5/v1",
    "https://192.168.1.10:11434/v1",
    "https://172.20.0.1/v1",
    "https://169.254.169.254/latest",
    "https://100.72.93.20/v1",
    "https://[::1]/v1",
    "https://[fe80::1]/v1",
    "https://[fd00::1]/v1",
    "https://[::ffff:10.0.0.1]/v1",
    "https://localhost/v1",
    "http://localhost:11434/v1",
  ])("en producción rechaza «%s»", (u) => {
    expect(validarBaseUrl(u, { produccion: true }).ok).toBe(false);
  });

  it("en desarrollo deja http://localhost y 127.0.0.1 (Ollama, LM Studio)", () => {
    expect(validarBaseUrl("http://localhost:11434/v1", { produccion: false })).toEqual({ ok: true, url: "http://localhost:11434/v1" });
    expect(validarBaseUrl("http://127.0.0.1:1234/v1/", { produccion: false })).toEqual({ ok: true, url: "http://127.0.0.1:1234/v1" });
    expect(validarBaseUrl("http://192.168.1.10:11434/v1", { produccion: false }).ok).toBe(false);
  });

  it("https público pasa en producción", () => {
    expect(validarBaseUrl("https://api.together.xyz/v1", { produccion: true })).toEqual({ ok: true, url: "https://api.together.xyz/v1" });
    expect(esIpPrivada("8.8.8.8")).toBe(false);
  });

  it("conexionDe usa la barrera según el entorno", () => {
    vi.stubEnv("NODE_ENV", "production");
    const r = conexionDe("personalizado", "k", "https://192.168.0.2/v1");
    expect(r.ok).toBe(false);
    vi.unstubAllEnvs();
    expect(conexionDe("personalizado", "", null).ok).toBe(false);
    const ok = conexionDe("groq", "k");
    expect(ok.ok && ok.conexion.baseUrl).toBe("https://api.groq.com/openai/v1");
  });
});

describe("adaptador con fetch simulado", () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
  });

  const claude: ConexionIa = {
    proveedor: "anthropic", nombre: "Claude", protocolo: "anthropic",
    baseUrl: "https://api.anthropic.com/v1", clave: "sk-ant-secreta", urlDelDueno: false,
  };
  const gemini: ConexionIa = {
    proveedor: "gemini", nombre: "Gemini", protocolo: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", clave: "AIza-secreta", urlDelDueno: false,
  };

  it("Claude: manda la foto como bloque image, x-api-key y lee tool_use", async () => {
    const llamadas: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      llamadas.push({ url: String(url), init: init ?? {} });
      return new Response(
        JSON.stringify({
          content: [
            { type: "text", text: "Leí el recibo E242." },
            { type: "tool_use", id: "tu_1", name: "plata_registrar_gasto", input: { monto: 200 } },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    const r = await chatConClave(claude, { messages: conversacion.slice(0, 2), temperature: 0.2, tools: [{ type: "function", function: { name: "plata_registrar_gasto", description: "", parameters: {} } }] }, "claude-sonnet-5-5");
    expect(llamadas[0].url).toBe("https://api.anthropic.com/v1/messages");
    const h = llamadas[0].init.headers as Record<string, string>;
    expect(h["x-api-key"]).toBe("sk-ant-secreta");
    const body = JSON.parse(String(llamadas[0].init.body));
    expect(body.system).toBe("Eres el asistente.");
    expect(body.messages[0].content[1].type).toBe("image");
    expect(body.temperature).toBeUndefined();
    expect(r.ok).toBe(true);
    expect(r.content).toBe("Leí el recibo E242.");
    expect(r.toolCalls).toEqual([{ id: "tu_1", function: { name: "plata_registrar_gasto", arguments: '{"monto":200}' } }]);
    expect(r.usage.totalTokens).toBe(15);
  });

  it("Claude con stream: re-emite el texto como SSE estilo OpenAI (lo lee el chat legado)", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "hola" }] }), { status: 200 })) as typeof fetch;
    const r = await chatConClave(claude, { messages: [{ role: "user", content: "x" }], temperature: 0, stream: true }, "claude-haiku-5-5");
    const texto = await new Response(r.body).text();
    expect(texto).toContain('"delta":{"content":"hola"}');
    expect(texto).toContain("[DONE]");
  });

  it.each([
    [401, "{}", "clave_invalida"],
    [402, "{}", "sin_credito"],
    [429, "{}", "limite_ia"],
    [404, "{}", "modelo_no_disponible"],
  ])("chat HTTP %i → %s, sin filtrar la clave en el error", async (status, cuerpo, estado) => {
    globalThis.fetch = vi.fn(async () => new Response(cuerpo, { status })) as typeof fetch;
    const r = await chatConClave(gemini, { messages: [{ role: "user", content: "x" }], temperature: 0 }, "gemini-3.8-flash");
    expect(r.ok).toBe(false);
    expect(r.estado).toBe(estado);
    expect(r.error).not.toContain("AIza-secreta");
  });

  it("probar = GET /models; devuelve los modelos reales con pista de fotos", async () => {
    let url = "";
    globalThis.fetch = vi.fn(async (u: string | URL | Request) => {
      url = String(u);
      return new Response(JSON.stringify({ data: [{ id: "models/gemini-3.8-flash" }, { id: "gemini-embedding-001" }] }), { status: 200 });
    }) as typeof fetch;
    const r = await listarModelos(gemini);
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/models");
    expect(r.ok).toBe(true);
    expect(r.modelos.map((m) => m.id)).toEqual(["gemini-3.8-flash", "gemini-embedding-001"]);
    expect(r.modelos[0].vision).toBe(true);
  });

  it("probar con clave mala → clave_invalida y mensaje para la persona", async () => {
    globalThis.fetch = vi.fn(async () => new Response('{"error":"invalid x-api-key"}', { status: 401 })) as typeof fetch;
    const r = await listarModelos(claude);
    expect(r).toMatchObject({ ok: false, estado: "clave_invalida", modelos: [] });
    expect(r.mensaje).toMatch(/no es válida/);
  });

  it("red caída al probar → sin_conexion", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect((await listarModelos(gemini)).estado).toBe("sin_conexion");
  });
});
