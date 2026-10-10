// @vitest-environment node
/**
 * lib/ai/vision-extract.ts — el lector común de fotos y PDF (ronda 3 de
 * ADR-459 + auditoría de seguridad 2026-10-02). Sin llamar a la IA: `fetch`
 * simulado con lo que contestaría la API de Claude (forma de la skill
 * `claude-api`) u OpenAI.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { PDFDocument } from "pdf-lib";

const { logger } = vi.hoisted(() => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger }));

import { AVISO_IA_NO_DISPONIBLE, AVISO_SIN_CLAVE_IA } from "@/lib/ai/aviso-clave-ia";
import {
  FORMATOS_IMAGEN,
  FORMATOS_IMAGEN_Y_PDF,
  MODELO_CLAUDE_VISION,
  costoMaximoLecturaUsd,
  falloDelProveedor,
  gastoDeLectura,
  paginasDePdf,
  separarArchivo,
  visionExtractJSON,
  type MedioLectura,
} from "@/lib/ai/vision-extract";

const original = { ...process.env };
const CLAVE = "sk-ant-api03-CLAVE-SECRETA-DE-PRUEBA";
/* Las firmas reales en base64: JPEG = FF D8 FF, PNG = 89 50 4E 47…, PDF = «%PDF-». */
const JPEG = `data:image/jpeg;base64,/9j/${"A".repeat(400)}`;
const PNG = `data:image/png;base64,iVBORw0KGgo${"A".repeat(400)}`;
const PNG_ANUNCIADA_COMO_JPEG = `data:image/jpeg;base64,iVBORw0KGgo${"A".repeat(400)}`;
const PDF = `data:application/pdf;base64,JVBERi0${"A".repeat(400)}`;
const PDF_DISFRAZADO_DE_JPEG = `data:image/jpeg;base64,JVBERi0${"A".repeat(400)}`;

const Schema = z.object({ codigo: z.string() });
const JSON_SCHEMA = { type: "object", properties: { codigo: { type: "string" } }, required: ["codigo"], additionalProperties: false };

function leer(imageBase64 = JPEG, extra: { formatos?: readonly MedioLectura[]; verDetalleDeClave?: boolean } = {}) {
  return visionExtractJSON({
    imageBase64,
    formatos: extra.formatos ?? FORMATOS_IMAGEN_Y_PDF,
    prompt: "Lee el código",
    schema: Schema,
    jsonSchema: JSON_SCHEMA,
    maxTokens: 200,
    logTag: "[test]",
    /* Los mensajes de la clave se prueban con detalle; el genérico, aparte. */
    verDetalleDeClave: extra.verDetalleDeClave ?? true,
  });
}

/** Lo que devuelve la API de Claude: con razonamiento adaptativo puede empezar con un bloque `thinking`. */
function respuestaClaude(texto: string, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      content: [
        { type: "thinking", thinking: "", signature: "x" },
        { type: "text", text: texto },
      ],
      stop_reason: "end_turn",
      usage: { input_tokens: 3000, output_tokens: 100 },
      ...extra,
    }),
    { status: 200 },
  );
}

function errorClaude(status: number, tipo: string, mensaje: string) {
  return new Response(JSON.stringify({ type: "error", error: { type: tipo, message: mensaje }, request_id: "req_1" }), { status });
}

function cuerpoDe(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

beforeEach(() => {
  logger.warn.mockClear();
  logger.error.mockClear();
  delete process.env.OPENAI_API_KEY;
  process.env.ANTHROPIC_API_KEY = CLAVE;
});
afterEach(() => {
  process.env = { ...original };
  vi.unstubAllGlobals();
});

describe("visionExtractJSON con Claude", () => {
  it("200: lee el bloque de texto por su TIPO (aunque venga detrás de un thinking) y calcula el costo", async () => {
    const fetchMock = vi.fn(async (..._a: unknown[]) => respuestaClaude('{"codigo":"114-LUP"}'));
    vi.stubGlobal("fetch", fetchMock);
    const r = await leer();
    expect(r).toEqual({ ok: true, data: { codigo: "114-LUP" }, proveedor: "claude", costoUsd: 0.01 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.anthropic.com/v1/messages");
  });

  it("pide el modelo vigente, sin `thinking: disabled` (400 en Sonnet 5.5), con effort low y salida estructurada", async () => {
    const fetchMock = vi.fn(async (..._a: unknown[]) => respuestaClaude('{"codigo":"1"}'));
    vi.stubGlobal("fetch", fetchMock);
    await leer();
    const body = cuerpoDe(fetchMock);
    expect(MODELO_CLAUDE_VISION).toBe("claude-sonnet-5-5");
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("temperature");
    expect(body.output_config).toEqual({ effort: "low", format: { type: "json_schema", schema: JSON_SCHEMA } });
    /* La respuesta pedida + margen para lo que razone: sin él, el JSON sale cortado. */
    expect(body.max_tokens).toBeGreaterThan(200);
  });

  it("una PNG viaja como PNG; un PDF como `document`", async () => {
    const fetchMock = vi.fn(async (..._a: unknown[]) => respuestaClaude('{"codigo":"1"}'));
    vi.stubGlobal("fetch", fetchMock);
    await leer(PNG);
    const png = (cuerpoDe(fetchMock).messages as { content: { type: string; source: { media_type: string } }[] }[])[0].content[0];
    expect(png).toMatchObject({ type: "image", source: { media_type: "image/png" } });

    fetchMock.mockClear();
    await leer(PDF);
    const pdf = (cuerpoDe(fetchMock).messages as { content: { type: string; source: { media_type: string; data: string } }[] }[])[0].content[0];
    expect(pdf).toMatchObject({ type: "document", source: { media_type: "application/pdf" } });
    expect(pdf.source.data.startsWith("JVBERi0")).toBe(true);
  });

  it("401: «la clave no es válida», como 503 — nunca 401 (el panel lo leería como sesión vencida)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (..._a: unknown[]) => errorClaude(401, "authentication_error", "invalid x-api-key")));
    const r = await leer();
    expect(r).toMatchObject({ ok: false, status: 503, codigo: "clave_invalida" });
    expect(!r.ok && r.error).toMatch(/clave de IA no es válida/);
    /* No contestó con una lectura: no hubo cobro que anotar. */
    expect(gastoDeLectura(r, 0.05)).toBeNull();
  });

  it("429: espera y reintenta, en palabras", async () => {
    vi.stubGlobal("fetch", vi.fn(async (..._a: unknown[]) => errorClaude(429, "rate_limit_error", "Number of request tokens has exceeded your per-minute rate limit")));
    const r = await leer();
    expect(r).toMatchObject({ ok: false, status: 429, codigo: "limite_ia" });
    expect(!r.ok && r.error).toMatch(/espera un minuto/);
  });

  it("sin crédito: por 402 o por el «credit balance is too low» que llega como 400", async () => {
    vi.stubGlobal("fetch", vi.fn(async (..._a: unknown[]) => errorClaude(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API.")));
    expect(await leer()).toMatchObject({ ok: false, status: 503, codigo: "sin_credito", error: expect.stringMatching(/Se acabó el crédito/) });
    vi.stubGlobal("fetch", vi.fn(async (..._a: unknown[]) => errorClaude(402, "billing_error", "billing")));
    expect(await leer()).toMatchObject({ ok: false, codigo: "sin_credito" });
  });

  it("529/500: la IA está saturada (503), no un 502 mudo", async () => {
    vi.stubGlobal("fetch", vi.fn(async (..._a: unknown[]) => errorClaude(529, "overloaded_error", "Overloaded")));
    expect(await leer()).toMatchObject({ ok: false, status: 503, codigo: "ia_saturada" });
  });

  it("sin red: 503 «no se pudo conectar»", async () => {
    vi.stubGlobal("fetch", vi.fn(async (..._a: unknown[]) => { throw new TypeError("fetch failed"); }));
    expect(await leer()).toMatchObject({ ok: false, status: 503, codigo: "sin_conexion" });
  });

  it("la clave y la imagen nunca van al log", async () => {
    vi.stubGlobal("fetch", vi.fn(async (..._a: unknown[]) => errorClaude(401, "authentication_error", "invalid x-api-key")));
    await leer();
    vi.stubGlobal("fetch", vi.fn(async (..._a: unknown[]) => { throw new Error("boom"); }));
    await leer();
    const logueado = JSON.stringify([...logger.warn.mock.calls, ...logger.error.mock.calls]);
    expect(logueado).not.toContain(CLAVE);
    expect(logueado).not.toContain("AAAAAAAAAA");
  });
});

describe("auditoría 1 — lo cobrado se anota aunque la lectura falle", () => {
  /* 30 000 tokens de entrada + 5 000 de salida = US$0,06 + US$0,05. */
  const usoGrande = { input_tokens: 30_000, output_tokens: 5_000 };

  it("cortada por max_tokens: 422 que TRAE lo cobrado", async () => {
    vi.stubGlobal("fetch", vi.fn(async (..._a: unknown[]) => respuestaClaude('{"codi', { stop_reason: "max_tokens", usage: usoGrande })));
    const r = await leer();
    expect(r).toMatchObject({ ok: false, status: 422, codigo: "cortada", costoUsd: 0.11 });
    expect(gastoDeLectura(r, 0.05)).toBe(0.11);
  });

  it("negada (refusal) e ilegible también traen lo cobrado", async () => {
    vi.stubGlobal("fetch", vi.fn(async (..._a: unknown[]) => respuestaClaude("", { stop_reason: "refusal", usage: usoGrande })));
    expect(await leer()).toMatchObject({ ok: false, codigo: "rechazada", costoUsd: 0.11 });
    vi.stubGlobal("fetch", vi.fn(async (..._a: unknown[]) => respuestaClaude("esto no es JSON", { usage: usoGrande })));
    expect(await leer()).toMatchObject({ ok: false, status: 422, codigo: "ilegible", costoUsd: 0.11 });
  });

  it("contestó 200 sin `usage`: se anota lo reservado, nunca cero", async () => {
    vi.stubGlobal("fetch", vi.fn(async (..._a: unknown[]) => respuestaClaude('{"codi', { stop_reason: "max_tokens", usage: undefined })));
    const r = await leer();
    expect(r).toMatchObject({ ok: false, codigo: "cortada", costoUsd: 0 });
    expect(gastoDeLectura(r, 0.07)).toBe(0.07);
  });
});

describe("auditoría 2 — el formato lo deciden los bytes y la ruta", () => {
  it("un PDF disfrazado de JPEG: 400 SIN llamar a la IA (aunque la ruta lea PDF)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await leer(PDF_DISFRAZADO_DE_JPEG, { formatos: FORMATOS_IMAGEN })).toMatchObject({ ok: false, status: 400, codigo: "formato_no_soportado" });
    expect(await leer(PDF_DISFRAZADO_DE_JPEG, { formatos: FORMATOS_IMAGEN_Y_PDF })).toMatchObject({ ok: false, status: 400 });
    expect(await leer(PNG_ANUNCIADA_COMO_JPEG)).toMatchObject({ ok: false, status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("un PDF honesto en una ruta de sólo fotos: 400 sin llamar", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await leer(PDF, { formatos: FORMATOS_IMAGEN });
    expect(r).toMatchObject({ ok: false, status: 400, codigo: "formato_no_soportado" });
    expect(gastoDeLectura(r, 0.05)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("separarArchivo: sin firma conocida no pasa; `image/jpg` y octet-stream se toleran por los bytes", () => {
    expect(separarArchivo("QUJD", FORMATOS_IMAGEN).ok).toBe(false);
    expect(separarArchivo("data:image/heic;base64,QUJD", FORMATOS_IMAGEN).ok).toBe(false);
    expect(separarArchivo(`data:image/jpg;base64,/9j/${"A".repeat(40)}`, FORMATOS_IMAGEN)).toMatchObject({ ok: true, medio: "image/jpeg" });
    expect(separarArchivo(`data:application/octet-stream;base64,/9j/${"A".repeat(40)}`, FORMATOS_IMAGEN)).toMatchObject({ ok: true, medio: "image/jpeg" });
    expect(separarArchivo(PDF, FORMATOS_IMAGEN_Y_PDF)).toMatchObject({ ok: true, medio: "application/pdf" });
  });
});

describe("auditoría 3 — páginas y reserva", () => {
  it("paginasDePdf cuenta las hojas de un PDF real; uno dañado da null", async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 6; i++) doc.addPage();
    const b64 = Buffer.from(await doc.save()).toString("base64");
    expect(await paginasDePdf(b64)).toBe(6);
    expect(await paginasDePdf("JVBERi0xLjQKJeLjz9MKZGHDsWFkbw==")).toBeNull();
  });

  it("la reserva crece con las páginas y cubre la salida máxima", () => {
    const foto = costoMaximoLecturaUsd({ maxTokens: 3000 });
    const cinco = costoMaximoLecturaUsd({ maxTokens: 3000, paginasPdf: 5 });
    expect(foto).toBeGreaterThanOrEqual(0.06);
    expect(cinco).toBeGreaterThan(foto);
  });
});

describe("auditoría 4 — la clave de la PLATAFORMA y el log", () => {
  it("al admin de un negocio, cualquier fallo de la clave sale genérico (sin consola ni .env.local)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (..._a: unknown[]) => errorClaude(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API.")));
    const r = await leer(JPEG, { verDetalleDeClave: false });
    expect(r).toMatchObject({ ok: false, status: 503, codigo: "ia_no_disponible", error: AVISO_IA_NO_DISPONIBLE });
    expect(JSON.stringify(r)).not.toMatch(/console\.anthropic|env\.local|crédito/);
  });

  it("sin ninguna clave: genérico por defecto, con instrucciones sólo para quien administra", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await leer(JPEG, { verDetalleDeClave: false })).toEqual({ ok: false, status: 503, codigo: "ia_no_disponible", error: AVISO_IA_NO_DISPONIBLE });
    expect(await leer(JPEG, { verDetalleDeClave: true })).toEqual({ ok: false, status: 503, codigo: "sin_lector", error: AVISO_SIN_CLAVE_IA });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lo leído no va al log cuando no se puede interpretar: sólo el largo y el motivo", async () => {
    const leido = "Titular: JUAN PEREZ · DNI 40112233 · no es json";
    vi.stubGlobal("fetch", vi.fn(async (..._a: unknown[]) => respuestaClaude(leido)));
    await leer();
    const logueado = JSON.stringify(logger.warn.mock.calls);
    expect(logueado).not.toContain("40112233");
    expect(logueado).not.toContain("JUAN PEREZ");
    expect(logueado).toContain(`"largo":${leido.length}`);
    expect(logueado).toContain("json_invalido");
  });
});

describe("visionExtractJSON — proveedor", () => {
  it("con las dos claves lee Claude (la que pone el dueño), no OpenAI", async () => {
    process.env.OPENAI_API_KEY = "sk-openai";
    const fetchMock = vi.fn(async (..._a: unknown[]) => respuestaClaude('{"codigo":"1"}'));
    vi.stubGlobal("fetch", fetchMock);
    const r = await leer();
    expect(r.ok && r.proveedor).toBe("claude");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("anthropic.com");
  });

  it("sólo OpenAI: lee con gpt-4o-mini; un PDF no (415 que dice qué clave falta)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = "sk-openai";
    const fetchMock = vi.fn(async (..._a: unknown[]) =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"codigo":"85-TOR"}' } }], usage: { prompt_tokens: 1000, completion_tokens: 20 } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await leer()).toMatchObject({ ok: true, data: { codigo: "85-TOR" }, proveedor: "openai" });
    fetchMock.mockClear();
    expect(await leer(PDF)).toMatchObject({ ok: false, status: 415, codigo: "formato_no_soportado" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("piezas puras", () => {
  it("falloDelProveedor nunca devuelve 401 y sabe la consola de cada proveedor", () => {
    for (const s of [400, 401, 402, 403, 404, 413, 429, 500, 529]) {
      expect(falloDelProveedor("claude", s, "", "").status).not.toBe(401);
    }
    expect(falloDelProveedor("openai", 429, "insufficient_quota", "You exceeded your current quota").codigo).toBe("sin_credito");
    expect(falloDelProveedor("openai", 401, "", "").error).toContain("OPENAI_API_KEY");
  });
});
