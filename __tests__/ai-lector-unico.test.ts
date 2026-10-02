/**
 * «Un solo lector para guías y facturas» (2026-10-02): `gtf-ocr` y
 * `/api/ocr/invoice` leen con el lector común (`visionExtractJSON`) y
 * `ctp/ask` pregunta con `preguntarIA`. Sin llamar a la IA: `fetch` simulado
 * con lo que contestaría la API de Claude (forma de la skill `claude-api`:
 * bloque `thinking` delante, `usage`, `stop_reason`) u OpenAI.
 *
 * Lo que se cuida:
 *  1. MISMO resultado de datos que antes (el mapeo de cada ruta no cambia).
 *  2. Claude primero, `claude-sonnet-5-5`, sin `thinking: disabled` (400 en 5.5).
 *  3. Errores en palabras con `codigo`: nunca un 401 al navegador ni un 502 mudo.
 *  4. Al tope mensual va lo que costó de verdad, también si la lectura falló.
 *  5. RBAC, rate limit y tope por la tienda de la SESIÓN, como antes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  sesion: { tenantId: "t-qa-lector", role: "admin" } as { tenantId: string; role: string } | null,
  roles: [] as unknown[],
  rl: vi.fn((..._a: unknown[]): Response | null => null),
  detalle: { ver: false },
  gasto: {
    canSpend: vi.fn(async (..._a: unknown[]) => true),
    recordSpend: vi.fn(async (..._a: unknown[]) => undefined),
  },
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  db: { saldos: vi.fn(), stats: vi.fn(), traza: vi.fn(), ficha: vi.fn() },
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: async (_req: unknown, roles: unknown) => {
    h.roles.push(roles);
    return h.sesion ?? NextResponse.json({ error: "No autorizado" }, { status: 401 });
  },
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: (...a: unknown[]) => h.rl(...a) }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/ai/cost-control", () => ({ aiCostGuard: h.gasto }));
vi.mock("@/lib/ai/detalle-clave-ia", () => ({ veDetalleDeClaveIA: async () => h.detalle.ver }));
vi.mock("@/lib/logger", () => ({ logger: h.logger }));
vi.mock("@/lib/db/forest-ctp.db", () => ({ ForestCtpDB: { saldos: (...a: unknown[]) => h.db.saldos(...a) } }));
vi.mock("@/lib/db/wood-entries.db", () => ({ WoodEntriesDB: { stats: (...a: unknown[]) => h.db.stats(...a) } }));
vi.mock("@/lib/db/forest-ctp-despacho.db", () => ({
  ForestCtpDespachoDB: { trazabilidadDelPeriodo: (...a: unknown[]) => h.db.traza(...a) },
}));
vi.mock("@/lib/db/forest-ctp-ficha.db", () => ({ ForestCtpFichaDB: { get: (...a: unknown[]) => h.db.ficha(...a) } }));

import { AVISO_ASISTENTE_NO_DISPONIBLE, AVISO_IA_NO_DISPONIBLE, AVISO_SIN_CLAVE_IA } from "@/lib/ai/aviso-clave-ia";

const original = { ...process.env };
/* Firmas reales: JPEG = FF D8 FF («/9j/»), PNG = 89 50 4E 47 («iVBORw0KGgo»). */
const JPEG = `data:image/jpeg;base64,/9j/${"A".repeat(400)}`;
const PNG = `data:image/png;base64,iVBORw0KGgo${"A".repeat(400)}`;

/** Lo que devuelve Claude: con razonamiento adaptativo puede empezar con un bloque `thinking`. */
function claude(texto: string, extra: Record<string, unknown> = {}) {
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
const errorClaude = (status: number, tipo: string, mensaje: string) =>
  new Response(JSON.stringify({ type: "error", error: { type: tipo, message: mensaje } }), { status });
const openai = (texto: string) =>
  new Response(
    JSON.stringify({ choices: [{ message: { content: texto } }], usage: { prompt_tokens: 3000, completion_tokens: 100 } }),
    { status: 200 },
  );

function conFetch(respuesta: () => Response) {
  const fetchMock = vi.fn(async (..._a: unknown[]) => respuesta());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const cuerpoDe = (fetchMock: ReturnType<typeof vi.fn>) =>
  JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as Record<string, unknown>;
const urlDe = (fetchMock: ReturnType<typeof vi.fn>) => String(fetchMock.mock.calls[0]?.[0]);

async function post(ruta: "gtf" | "factura" | "ask", body: unknown) {
  const mod =
    ruta === "gtf"
      ? await import("@/app/api/admin/forestal/gtf-ocr/route")
      : ruta === "factura"
        ? await import("@/app/api/ocr/invoice/route")
        : await import("@/app/api/admin/forestal/ctp/ask/route");
  const url = { gtf: "/api/admin/forestal/gtf-ocr", factura: "/api/ocr/invoice", ask: "/api/admin/forestal/ctp/ask" }[ruta];
  const res = await mod.POST(new NextRequest(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body) }));
  return { res, j: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  vi.resetModules();
  h.sesion = { tenantId: "t-qa-lector", role: "admin" };
  h.roles.length = 0;
  h.rl.mockClear();
  h.detalle.ver = false;
  h.gasto.canSpend.mockReset().mockResolvedValue(true);
  h.gasto.recordSpend.mockClear();
  h.logger.warn.mockClear();
  h.db.saldos.mockReset().mockResolvedValue({
    porEspecie: [{ especie: "Shihuahuaco", cites: false, ingresoM3: 120.5, consumidoM3: 80, saldoM3: 40.5 }],
    productos: [{ producto: "Madera aserrada", producido: 30, despachado: 10, stock: 20 }],
  });
  h.db.stats.mockReset().mockResolvedValue({ totalCount: 12, totalVolumeM3: 120.5, citesCount: 0, lateCount: 1, byStatus: { pendiente: 2 } });
  h.db.traza.mockReset().mockResolvedValue({ incompletos: 1, total: 4, lineas: [7] });
  h.db.ficha.mockReset().mockResolvedValue({ nombreCtp: "Aserradero QA", codigoCtp: "CTP-1", ruc: "20123456789", titulos: [], citesPermisos: [] });
  process.env.ANTHROPIC_API_KEY = "sk-ant-api03-CLAVE-DE-PRUEBA";
  delete process.env.OPENAI_API_KEY;
});
afterEach(() => {
  process.env = { ...original };
  vi.unstubAllGlobals();
});

/* ── gtf-ocr ─────────────────────────────────────────────────────────────── */

/** Lo que «leyó» el modelo, con las trampas de siempre: volumen en texto y el rótulo pegado al registro. */
const GTF_LEIDA = {
  gtfNumber: "019-001-0000004",
  gtfSeries: "",
  especie: "TORNILLO",
  especieCientifica: "Cedrelinga cateniformis",
  volumenM3: "12.5",
  proveedor: "CN SAN LUIS",
  ruc: "20156701263",
  fecha: "2026-09-17",
  origen: "Comunidad Nativa San Luis",
  numeroRegistro: "N° REGISTRO : 110-19-0469791",
};
/** Lo que la ruta contestaba ANTES con esa lectura (GtfSchema + registroLeido). */
const GTF_ESPERADA = {
  gtfNumber: "019-001-0000004",
  gtfSeries: "",
  especie: "TORNILLO",
  especieCientifica: "Cedrelinga cateniformis",
  volumenM3: 12.5,
  proveedor: "CN SAN LUIS",
  ruc: "20156701263",
  fecha: "2026-09-17",
  origen: "Comunidad Nativa San Luis",
  numeroRegistro: "110-19-0469791",
};
/** El JSON Schema que la ruta le mandaba a Claude antes: se compara entero. */
const SCHEMA_GTF_DE_ANTES = {
  type: "object",
  properties: {
    gtfNumber: { type: "string" },
    gtfSeries: { type: "string" },
    especie: { type: "string" },
    especieCientifica: { type: "string" },
    volumenM3: { type: "number" },
    proveedor: { type: "string" },
    ruc: { type: "string" },
    fecha: { type: "string" },
    origen: { type: "string" },
    numeroRegistro: { type: "string" },
  },
  required: ["gtfNumber", "gtfSeries", "especie", "especieCientifica", "volumenM3", "proveedor", "ruc", "fecha", "origen", "numeroRegistro"],
  additionalProperties: false,
};

describe("gtf-ocr por el lector común", () => {
  it("Claude 200: el MISMO resultado de datos que antes y lo que costó al tope", async () => {
    const fetchMock = conFetch(() => claude(JSON.stringify(GTF_LEIDA)));
    const { res, j } = await post("gtf", { image: JPEG });
    expect(res.status).toBe(200);
    expect(j).toEqual(GTF_ESPERADA);
    expect(urlDe(fetchMock)).toBe("https://api.anthropic.com/v1/messages");
    /* 3000 × US$2/M + 100 × US$10/M = US$0,007 → al centavo hacia arriba. */
    expect(h.gasto.recordSpend).toHaveBeenCalledWith("t-qa-lector", 0.01);
  });

  it("OpenAI de respaldo da el mismo resultado", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test";
    const fetchMock = conFetch(() => openai(JSON.stringify(GTF_LEIDA)));
    const { j } = await post("gtf", { image: JPEG });
    expect(j).toEqual(GTF_ESPERADA);
    expect(urlDe(fetchMock)).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("pide Sonnet 5.5 sin `thinking`, con effort low, su prompt de siempre y el schema de antes", async () => {
    const fetchMock = conFetch(() => claude(JSON.stringify(GTF_LEIDA)));
    await post("gtf", { image: PNG });
    const b = cuerpoDe(fetchMock) as {
      model: string;
      max_tokens: number;
      thinking?: unknown;
      temperature?: unknown;
      output_config: { effort: string; format: { type: string; schema: unknown } };
      messages: { content: { type: string; source?: { media_type: string }; text?: string }[] }[];
    };
    expect(b.model).toBe("claude-sonnet-5-5");
    expect(b.thinking).toBeUndefined();
    expect(b.temperature).toBeUndefined();
    expect(b.output_config.effort).toBe("low");
    expect(b.output_config.format).toEqual({ type: "json_schema", schema: SCHEMA_GTF_DE_ANTES });
    expect(b.max_tokens).toBe(800 + 2048);
    /* Una PNG viaja como PNG (antes se adivinaba por el prefijo). */
    expect(b.messages[0]?.content[0]?.source?.media_type).toBe("image/png");
    expect(b.messages[0]?.content[1]?.text).toMatch(/^Extrae los datos de esta Guía de Transporte Forestal \(GTF\) peruana de SERFOR\./);
    expect(b.messages[0]?.content[1]?.text).toContain("«N° REGISTRO»");
  });

  it("401 de Claude: 503 en palabras al admin del negocio (nunca 401 ni «API error: 401»), sin gasto", async () => {
    conFetch(() => errorClaude(401, "authentication_error", "invalid x-api-key"));
    const { res, j } = await post("gtf", { image: JPEG });
    expect(res.status).toBe(503);
    expect(j).toEqual({ error: AVISO_IA_NO_DISPONIBLE, codigo: "ia_no_disponible" });
    expect(h.gasto.recordSpend).not.toHaveBeenCalled();
  });

  it("401 a quien administra la clave: dice cuál es el problema", async () => {
    h.detalle.ver = true;
    conFetch(() => errorClaude(401, "authentication_error", "invalid x-api-key"));
    const { res, j } = await post("gtf", { image: JPEG });
    expect(res.status).toBe(503);
    expect(j.codigo).toBe("clave_invalida");
    expect(String(j.error)).toContain("ANTHROPIC_API_KEY");
  });

  it("429 de Claude: 429 «espera un minuto»", async () => {
    conFetch(() => errorClaude(429, "rate_limit_error", "Number of request tokens has exceeded your per-minute rate limit"));
    const { res, j } = await post("gtf", { image: JPEG });
    expect(res.status).toBe(429);
    expect(j.codigo).toBe("limite_ia");
    expect(String(j.error)).toMatch(/espera un minuto/);
  });

  it("cortada por max_tokens: 422 que dice qué pasó, y lo cobrado igual va al tope", async () => {
    conFetch(() => claude('{"gtfNumber":"019-', { stop_reason: "max_tokens", usage: { input_tokens: 4000, output_tokens: 2848 } }));
    const { res, j } = await post("gtf", { image: JPEG });
    expect(res.status).toBe(422);
    expect(j.codigo).toBe("cortada");
    /* 4000 × 2 + 2848 × 10 = US$0,03648 → 0,04. */
    expect(h.gasto.recordSpend).toHaveBeenCalledWith("t-qa-lector", 0.04);
  });

  it("respuesta que no se entiende: 422 con qué hacer, y se anota lo cobrado", async () => {
    conFetch(() => claude("no es json"));
    const { res, j } = await post("gtf", { image: JPEG });
    expect(res.status).toBe(422);
    expect(j).toEqual({ error: expect.stringMatching(/^No se pudo leer la guía en la foto\./), codigo: "ilegible" });
    expect(h.gasto.recordSpend).toHaveBeenCalledWith("t-qa-lector", 0.01);
  });

  it("sin ninguna clave: 503 con el aviso único, sin llamar a nadie ni reservar", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = conFetch(() => claude("{}"));
    const { res, j } = await post("gtf", { image: JPEG });
    expect(res.status).toBe(503);
    expect(j).toEqual({ error: AVISO_IA_NO_DISPONIBLE, codigo: "ia_no_disponible" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.gasto.canSpend).not.toHaveBeenCalled();
    h.detalle.ver = true;
    vi.resetModules();
    const { j: conDetalle } = await post("gtf", { image: JPEG });
    expect(conDetalle).toEqual({ error: AVISO_SIN_CLAVE_IA, codigo: "sin_lector" });
  });

  it("sin presupuesto: 429 en palabras, sin llamar a la IA", async () => {
    h.gasto.canSpend.mockResolvedValue(false);
    const fetchMock = conFetch(() => claude("{}"));
    const { res, j } = await post("gtf", { image: JPEG });
    expect(res.status).toBe(429);
    expect(j.codigo).toBe("limite_ia");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("un PDF disfrazado de foto: 400 sin llamar a la IA", async () => {
    const fetchMock = conFetch(() => claude("{}"));
    const { res, j } = await post("gtf", { image: `data:image/jpeg;base64,JVBERi0${"A".repeat(400)}` });
    expect(res.status).toBe(400);
    expect(j.codigo).toBe("formato_no_soportado");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("RBAC, límite y tope como antes: roles de siempre, STRICT, bucket = tienda de la sesión", async () => {
    conFetch(() => claude(JSON.stringify(GTF_LEIDA)));
    await post("gtf", { image: JPEG });
    expect(h.roles[0]).toEqual(["admin", "almacenero", "owner"]);
    expect(h.rl).toHaveBeenCalledWith(expect.anything(), "STRICT", "gtf-ocr");
    expect(h.gasto.canSpend.mock.calls[0]?.[0]).toBe("t-qa-lector");
  });

  it("sin sesión: 401 sin llamar a la IA ni tocar el tope", async () => {
    h.sesion = null;
    const fetchMock = conFetch(() => claude("{}"));
    const { res } = await post("gtf", { image: JPEG });
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.gasto.canSpend).not.toHaveBeenCalled();
  });
});

/* ── /api/ocr/invoice ────────────────────────────────────────────────────── */

const FACTURA_LEIDA = {
  proveedor: { nombre: "Distribuidora Ucayali SAC", ruc: "20600000001" },
  fecha: "2026-09-30",
  items: [
    { nombre: "Arroz Costeño 5 kg", cantidad: 10, precioUnitario: 21.5 },
    { nombre: "Aceite Primor 1 L", cantidad: 12, precioUnitario: 9.9 },
  ],
  total: 333.8,
};
const SCHEMA_FACTURA_DE_ANTES = {
  type: "object",
  properties: {
    proveedor: {
      type: "object",
      properties: { nombre: { type: "string" }, ruc: { type: "string" } },
      required: ["nombre"],
      additionalProperties: false,
    },
    fecha: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { nombre: { type: "string" }, cantidad: { type: "number" }, precioUnitario: { type: "number" } },
        required: ["nombre", "cantidad", "precioUnitario"],
        additionalProperties: false,
      },
    },
    total: { type: "number" },
  },
  required: ["proveedor", "items", "total"],
  additionalProperties: false,
};

describe("ocr/invoice por el lector común", () => {
  it("Claude 200: el mismo resultado de datos (InvoiceSchema) y lo que costó al tope", async () => {
    const fetchMock = conFetch(() => claude(JSON.stringify(FACTURA_LEIDA)));
    const { res, j } = await post("factura", { image: JPEG });
    expect(res.status).toBe(200);
    expect(j).toEqual(FACTURA_LEIDA);
    expect(urlDe(fetchMock)).toBe("https://api.anthropic.com/v1/messages");
    expect(h.gasto.recordSpend).toHaveBeenCalledWith("t-qa-lector", 0.01);
  });

  it("lo que el comprobante no trae se omite y el schema pone sus valores de siempre", async () => {
    conFetch(() => claude(JSON.stringify({ proveedor: { nombre: "Bodega Rosita" }, items: [], total: 0 })));
    const { j } = await post("factura", { image: JPEG });
    expect(j).toEqual({ proveedor: { nombre: "Bodega Rosita" }, items: [], total: 0 });
  });

  it("OpenAI de respaldo da el mismo resultado", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test";
    conFetch(() => openai(JSON.stringify(FACTURA_LEIDA)));
    const { j } = await post("factura", { image: JPEG });
    expect(j).toEqual(FACTURA_LEIDA);
  });

  it("pide Sonnet 5.5 sin `thinking`, el schema de antes, y una PNG ya no viaja como JPEG", async () => {
    const fetchMock = conFetch(() => claude(JSON.stringify(FACTURA_LEIDA)));
    await post("factura", { image: PNG });
    const b = cuerpoDe(fetchMock) as {
      model: string;
      thinking?: unknown;
      max_tokens: number;
      output_config: { format: { schema: unknown } };
      messages: { content: { source?: { media_type: string }; text?: string }[] }[];
    };
    expect(b.model).toBe("claude-sonnet-5-5");
    expect(b.thinking).toBeUndefined();
    expect(b.max_tokens).toBe(1500 + 2048);
    expect(b.output_config.format.schema).toEqual(SCHEMA_FACTURA_DE_ANTES);
    expect(b.messages[0]?.content[0]?.source?.media_type).toBe("image/png");
    expect(b.messages[0]?.content[1]?.text).toMatch(/omítelo en vez de inventarlo/);
  });

  it("401: 503 en palabras, no un 502 «API error: 401»", async () => {
    conFetch(() => errorClaude(401, "authentication_error", "invalid x-api-key"));
    const { res, j } = await post("factura", { image: JPEG });
    expect(res.status).toBe(503);
    expect(j).toEqual({ error: AVISO_IA_NO_DISPONIBLE, codigo: "ia_no_disponible" });
  });

  it("sin crédito (llega como 400): a quien administra, «recárgalo»", async () => {
    h.detalle.ver = true;
    conFetch(() => errorClaude(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API."));
    const { res, j } = await post("factura", { image: JPEG });
    expect(res.status).toBe(503);
    expect(j.codigo).toBe("sin_credito");
  });

  it("429 y cortada: en palabras; la cortada anota lo cobrado", async () => {
    conFetch(() => errorClaude(429, "rate_limit_error", "rate limited"));
    expect((await post("factura", { image: JPEG })).j.codigo).toBe("limite_ia");
    vi.resetModules();
    conFetch(() => claude('{"items":[', { stop_reason: "max_tokens" }));
    const { res, j } = await post("factura", { image: JPEG });
    expect(res.status).toBe(422);
    expect(j.codigo).toBe("cortada");
    expect(h.gasto.recordSpend).toHaveBeenCalledTimes(1);
  });

  it("sin clave: 503 con el aviso único, sin llamar", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = conFetch(() => claude("{}"));
    const { res, j } = await post("factura", { image: JPEG });
    expect(res.status).toBe(503);
    expect(j.codigo).toBe("ia_no_disponible");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("RBAC y límite como antes: admin y almacenero, STRICT «ocr-invoice»; sin sesión 401 sin gastar", async () => {
    conFetch(() => claude(JSON.stringify(FACTURA_LEIDA)));
    await post("factura", { image: JPEG });
    expect(h.roles[0]).toEqual(["admin", "almacenero"]);
    expect(h.rl).toHaveBeenCalledWith(expect.anything(), "STRICT", "ocr-invoice");
    h.sesion = null;
    vi.resetModules();
    const fetchMock = conFetch(() => claude("{}"));
    h.gasto.canSpend.mockClear();
    expect((await post("factura", { image: JPEG })).res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.gasto.canSpend).not.toHaveBeenCalled();
  });
});

/* ── ctp/ask ─────────────────────────────────────────────────────────────── */

describe("ctp/ask por preguntarIA", () => {
  it("Claude 200: la respuesta del bloque de texto (aunque venga detrás de un thinking) y el costo real", async () => {
    const fetchMock = conFetch(() => claude("Te quedan 40,5 m³ de shihuahuaco.", { usage: { input_tokens: 900, output_tokens: 40 } }));
    const { res, j } = await post("ask", { question: "¿Cuánto shihuahuaco me queda?" });
    expect(res.status).toBe(200);
    expect(j).toEqual({ answer: "Te quedan 40,5 m³ de shihuahuaco." });
    expect(urlDe(fetchMock)).toBe("https://api.anthropic.com/v1/messages");
    /* 900 × 2 + 40 × 10 = US$0,0022 → 1 centavo (antes US$0,003 fijos, que `recordSpend` redondeaba a 0). */
    expect(h.gasto.recordSpend).toHaveBeenCalledWith("t-qa-lector", 0.01);
  });

  it("pide Sonnet 5.5 sin `thinking` ni `temperature`, effort low, con el libro de la tienda de la sesión", async () => {
    const fetchMock = conFetch(() => claude("ok"));
    await post("ask", { question: "¿Tengo algún documento vencido?" });
    const b = cuerpoDe(fetchMock) as {
      model: string;
      thinking?: unknown;
      temperature?: unknown;
      max_tokens: number;
      output_config: { effort: string; format?: unknown };
      system: string;
      messages: { role: string; content: string }[];
    };
    expect(b.model).toBe("claude-sonnet-5-5");
    expect(b.thinking).toBeUndefined();
    expect(b.temperature).toBeUndefined();
    expect(b.output_config).toEqual({ effort: "low" });
    expect(b.max_tokens).toBeGreaterThan(500);
    expect(b.system).toMatch(/NUNCA inventes cifras/);
    expect(b.messages[0]?.content).toContain("Shihuahuaco: ingresado 120.5 m³");
    expect(b.messages[0]?.content).toMatch(/Pregunta: ¿Tengo algún documento vencido\?$/);
    expect(h.db.saldos).toHaveBeenCalledWith("t-qa-lector");
    expect(h.db.ficha).toHaveBeenCalledWith("t-qa-lector");
  });

  it("OpenAI de respaldo: gpt-4o-mini con su temperatura de siempre", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test";
    const fetchMock = conFetch(() => openai("Te quedan 40,5 m³."));
    const { j } = await post("ask", { question: "¿Cuánto queda?" });
    expect(j).toEqual({ answer: "Te quedan 40,5 m³." });
    const b = cuerpoDe(fetchMock) as { model: string; temperature: number };
    expect(b.model).toBe("gpt-4o-mini");
    expect(b.temperature).toBe(0.2);
  });

  it("401: 503 con el aviso del asistente (antes 502 «falta API key o el modelo no respondió»)", async () => {
    conFetch(() => errorClaude(401, "authentication_error", "invalid x-api-key"));
    const { res, j } = await post("ask", { question: "¿Cuánto queda?" });
    expect(res.status).toBe(503);
    expect(j).toEqual({ error: AVISO_ASISTENTE_NO_DISPONIBLE, codigo: "ia_no_disponible" });
    expect(h.gasto.recordSpend).not.toHaveBeenCalled();
    h.detalle.ver = true;
    vi.resetModules();
    conFetch(() => errorClaude(401, "authentication_error", "invalid x-api-key"));
    expect((await post("ask", { question: "¿Cuánto queda?" })).j.codigo).toBe("clave_invalida");
  });

  it("429 y saturada (529): en palabras", async () => {
    conFetch(() => errorClaude(429, "rate_limit_error", "rate limited"));
    const a = await post("ask", { question: "¿Cuánto queda?" });
    expect([a.res.status, a.j.codigo]).toEqual([429, "limite_ia"]);
    vi.resetModules();
    conFetch(() => errorClaude(529, "overloaded_error", "Overloaded"));
    const b = await post("ask", { question: "¿Cuánto queda?" });
    expect([b.res.status, b.j.codigo]).toEqual([503, "ia_saturada"]);
  });

  it("cortada: lo que alcanzó a decir, marcado con «…», y se cobra; sin texto, 422", async () => {
    conFetch(() => claude("Te quedan 40,5 m³ de", { stop_reason: "max_tokens" }));
    const { res, j } = await post("ask", { question: "¿Cuánto queda?" });
    expect(res.status).toBe(200);
    expect(j.answer).toBe("Te quedan 40,5 m³ de …");
    expect(h.gasto.recordSpend).toHaveBeenCalledTimes(1);
    vi.resetModules();
    h.gasto.recordSpend.mockClear();
    conFetch(() => claude("", { stop_reason: "max_tokens" }));
    const vacia = await post("ask", { question: "¿Cuánto queda?" });
    expect([vacia.res.status, vacia.j.codigo]).toEqual([422, "cortada"]);
    expect(h.gasto.recordSpend).toHaveBeenCalledTimes(1);
  });

  it("negada (refusal): 422 en palabras, y se anota lo cobrado", async () => {
    conFetch(() => claude("", { stop_reason: "refusal" }));
    const { res, j } = await post("ask", { question: "¿Cuánto queda?" });
    expect([res.status, j.codigo]).toEqual([422, "rechazada"]);
    expect(h.gasto.recordSpend).toHaveBeenCalledWith("t-qa-lector", 0.01);
  });

  it("sin clave: POST 503 sin llamar ni armar el libro; GET dice que no está (y a quien administra, dónde va)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = conFetch(() => claude("x"));
    const { res, j } = await post("ask", { question: "¿Cuánto queda?" });
    expect(res.status).toBe(503);
    expect(j).toEqual({ error: AVISO_ASISTENTE_NO_DISPONIBLE, codigo: "ia_no_disponible" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.db.saldos).not.toHaveBeenCalled();
    const { GET } = await import("@/app/api/admin/forestal/ctp/ask/route");
    const g = await GET(new NextRequest("http://localhost/api/admin/forestal/ctp/ask"));
    expect(await g.json()).toEqual({ available: false, aviso: AVISO_ASISTENTE_NO_DISPONIBLE, codigo: "ia_no_disponible" });
    h.detalle.ver = true;
    const g2 = await GET(new NextRequest("http://localhost/api/admin/forestal/ctp/ask"));
    expect(((await g2.json()) as { codigo: string }).codigo).toBe("sin_lector");
  });

  it("con clave el GET dice available sin aviso", async () => {
    const { GET } = await import("@/app/api/admin/forestal/ctp/ask/route");
    const g = await GET(new NextRequest("http://localhost/api/admin/forestal/ctp/ask"));
    expect(await g.json()).toEqual({ available: true, aviso: null, codigo: null });
  });

  it("sin presupuesto: 429 sin llamar; la reserva sale del largo real del libro", async () => {
    h.gasto.canSpend.mockResolvedValue(false);
    const fetchMock = conFetch(() => claude("x"));
    const { res, j } = await post("ask", { question: "¿Cuánto queda?" });
    expect([res.status, j.codigo]).toEqual([429, "limite_ia"]);
    expect(fetchMock).not.toHaveBeenCalled();
    const reserva = h.gasto.canSpend.mock.calls[0]?.[1] as number;
    expect(reserva).toBeGreaterThanOrEqual(0.02);
    expect(reserva).toBeLessThan(0.1);
  });

  it("RBAC y límite como antes; sin sesión 401 sin llamar", async () => {
    conFetch(() => claude("ok"));
    await post("ask", { question: "¿Cuánto queda?" });
    expect(h.roles[0]).toEqual(["admin", "almacenero", "owner"]);
    expect(h.rl).toHaveBeenCalledWith(expect.anything(), "STRICT", "ctp-ask");
    h.sesion = null;
    vi.resetModules();
    const fetchMock = conFetch(() => claude("ok"));
    expect((await post("ask", { question: "¿Cuánto queda?" })).res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/* ── la pantalla de la GTF: el aviso de la clave no es un error ──────────── */

describe("leerGuiaDeFoto (alta de guía guardada)", () => {
  const foto = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "guia.jpg", { type: "image/jpeg" });
  const responde = (status: number, body: unknown) => conFetch(() => new Response(JSON.stringify(body), { status }));

  it("sin clave: la frase del servidor y la marca del aviso único", async () => {
    responde(503, { error: AVISO_SIN_CLAVE_IA, codigo: "sin_lector" });
    const { leerGuiaDeFoto } = await import("@/hooks/use-guia-desde-foto");
    expect(await leerGuiaDeFoto(foto())).toEqual({ ok: false, mensaje: AVISO_SIN_CLAVE_IA, sinClave: { instrucciones: true } });
  });

  it("un fallo con `codigo` se muestra en sus palabras (antes 413/400/502 decían «no respondió»)", async () => {
    responde(400, { error: "Ese archivo no se puede leer aquí: usa una foto JPG o PNG.", codigo: "formato_no_soportado" });
    const { leerGuiaDeFoto } = await import("@/hooks/use-guia-desde-foto");
    expect(await leerGuiaDeFoto(foto())).toEqual({ ok: false, mensaje: "Ese archivo no se puede leer aquí: usa una foto JPG o PNG." });
  });

  it("sin `codigo` (respuesta vieja), los mensajes de siempre", async () => {
    responde(422, { error: "No se pudo interpretar la GTF" });
    const { leerGuiaDeFoto } = await import("@/hooks/use-guia-desde-foto");
    expect(await leerGuiaDeFoto(foto())).toEqual({ ok: false, mensaje: "No se pudo leer la guía en la foto." });
    responde(502, { error: "API error: 401" });
    expect(await leerGuiaDeFoto(foto())).toEqual({
      ok: false,
      mensaje: "El lector de guías no respondió. Prueba de nuevo o escribe el número.",
    });
  });
});
