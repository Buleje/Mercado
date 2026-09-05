/**
 * Qué extensiones de audio se aceptan, y cuáles hay que traducir antes de subir.
 *
 * Nace de un bug real (2026-09-04): Telegram manda las notas de voz como `.oga`
 * y Groq valida por extensión ANTES de mirar el contenido, así que rechazaba con
 * «file must be one of the following types» un archivo que decodifica perfecto.
 *
 * La prueba original no lo atrapó porque el audio de prueba se generó como
 * `.ogg` — el formato que Telegram usa de verdad nunca pasó por el código.
 * Por eso el test se escribe sobre las extensiones, que es donde estaba el bug.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/** Lo que Groq acepta, copiado de su propio mensaje de error. */
const ACEPTA_GROQ = new Set(["flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "opus", "wav", "webm"]);

describe("formatos de audio que se aceptan", () => {
  it("`.oga` de Telegram está en la lista de entrada", async () => {
    const { FORMATOS_AUDIO } = await import("@/lib/ai/transcribir");
    expect(FORMATOS_AUDIO).toContain("oga");
  });

  it("todo lo que aceptamos es algo que Groq entiende, o algo que traducimos", async () => {
    const { FORMATOS_AUDIO } = await import("@/lib/ai/transcribir");
    const ALIAS_CONOCIDOS = new Set(["oga", "weba", "mpg", "mp2", "caf"]);
    for (const ext of FORMATOS_AUDIO) {
      expect(
        ACEPTA_GROQ.has(ext) || ALIAS_CONOCIDOS.has(ext),
        `"${ext}" no lo acepta Groq y no está en la tabla de alias: se va a rechazar con HTTP 400`,
      ).toBe(true);
    }
  });
});

describe("la extensión con la que el archivo viaja a Groq", () => {
  const fetchOriginal = globalThis.fetch;
  let subidoComo = "";

  beforeEach(() => {
    process.env.GROQ_API_KEY = "gsk_test";
    subidoComo = "";
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const form = init?.body as FormData;
      const f = form.get("file") as File;
      subidoComo = f.name;
      return new Response(JSON.stringify({ text: "hola", duration: 1 }), { status: 200 });
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    delete process.env.GROQ_API_KEY;
  });

  it("un `.oga` sube como `.ogg` — mismo archivo, nombre que Groq conoce", async () => {
    const { transcribirAudio } = await import("@/lib/ai/transcribir");
    const res = await transcribirAudio(new Uint8Array([1, 2, 3]), "file_123.oga");
    expect(res.ok).toBe(true);
    expect(subidoComo).toBe("file_123.ogg");
  });

  it("lo que Groq ya conoce viaja con su nombre original", async () => {
    const { transcribirAudio } = await import("@/lib/ai/transcribir");
    await transcribirAudio(new Uint8Array([1, 2, 3]), "nota.m4a");
    expect(subidoComo).toBe("nota.m4a");
  });

  it("una extensión que no sabemos leer se rechaza ACÁ, no en Groq", async () => {
    const { transcribirAudio } = await import("@/lib/ai/transcribir");
    const res = await transcribirAudio(new Uint8Array([1, 2, 3]), "cuenta.pdf");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain(".pdf");
    // Sin llamar a Groq: gastar una llamada para que te digan lo que ya sabías
    // es gastar cuota del negocio.
    expect(subidoComo).toBe("");
  });
});
