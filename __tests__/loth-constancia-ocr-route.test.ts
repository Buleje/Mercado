// @vitest-environment node
/**
 * /api/admin/forestal/plan/constancia-ocr (ronda 3 de ADR-459 + auditoría de
 * seguridad 2026-10-02): lee la constancia del registro de plantación. Sin
 * llamar a la IA: `fetch` simulado con la forma de respuesta de la API de Claude.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";

const { rateLimitMock, logger, sesion, gasto, plataforma } = vi.hoisted(() => ({
  rateLimitMock: vi.fn((..._args: unknown[]): Response | null => null),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  sesion: { valor: { tenantId: "t-qa-constancia", role: "admin" } as { tenantId: string; role: string } | null },
  gasto: { canSpend: vi.fn(async (..._a: unknown[]) => true), recordSpend: vi.fn(async (..._a: unknown[]) => undefined) },
  /* La sesión de superadmin: sólo vale el token «tok-valido». */
  plataforma: { getPlatformSession: vi.fn(async (token: string) => (token === "tok-valido" ? { username: "brandon" } : null)) },
}));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: async () => sesion.valor ?? NextResponse.json({ error: "unauthorized" }, { status: 401 }),
}));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: () => null,
  applyRateLimitWithTenant: (...a: unknown[]) => rateLimitMock(...a),
}));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/ai/cost-control", () => ({ aiCostGuard: gasto }));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/superadmin-session", () => ({
  PLATFORM_SESSION: { COOKIE_NAME: "buleje-platform-sess" },
  getPlatformSession: plataforma.getPlatformSession,
}));

const original = { ...process.env };
const JPEG = `data:image/jpeg;base64,/9j/${"A".repeat(400)}`;
const PDF_DISFRAZADO_DE_JPEG = `data:image/jpeg;base64,JVBERi0${"A".repeat(400)}`;
const URL_API = "http://localhost/api/admin/forestal/plan/constancia-ocr";

async function pdfDe(paginas: number): Promise<string> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) doc.addPage();
  return `data:application/pdf;base64,${Buffer.from(await doc.save()).toString("base64")}`;
}

const LEIDO = {
  codigoRegistro: "19-SEC/REG-PLT-2025-096",
  numeroConstancia: "096-2025",
  fechaInscripcion: "2025-03-14",
  titular: "Blas S.A.",
  autoridad: null,
  superficieHa: 12.5,
  departamento: "Pasco",
  provincia: "Oxapampa",
  distrito: null,
  sector: null,
  especies: [{ nombreComun: "Bolaina", nombreCientifico: "Guazuma crinita", arboles: 450, volumenM3: 120, anioInstalacion: 2018, superficieHa: 12.5 }],
  nota: "",
};

function respuesta(leido: unknown = LEIDO, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({ content: [{ type: "text", text: JSON.stringify(leido) }], stop_reason: "end_turn", usage: { input_tokens: 9000, output_tokens: 1500 }, ...extra }),
    { status: 200 },
  );
}

async function post(body: unknown, opts: { leido?: unknown; extra?: Record<string, unknown>; cookie?: string; respuestaFalsa?: Response } = {}) {
  const fetchMock = vi.fn(async (..._a: unknown[]) => opts.respuestaFalsa ?? respuesta(opts.leido, opts.extra));
  vi.stubGlobal("fetch", fetchMock);
  const { POST } = await import("@/app/api/admin/forestal/plan/constancia-ocr/route");
  const headers: Record<string, string> = opts.cookie ? { cookie: opts.cookie } : {};
  const res = await POST(new NextRequest(URL_API, { method: "POST", body: JSON.stringify(body), headers }));
  return { res, j: (await res.json()) as Record<string, unknown>, fetchMock };
}

beforeEach(() => {
  vi.resetModules();
  rateLimitMock.mockClear();
  gasto.canSpend.mockClear();
  gasto.recordSpend.mockClear();
  logger.warn.mockClear();
  sesion.valor = { tenantId: "t-qa-constancia", role: "admin" };
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  delete process.env.OPENAI_API_KEY;
});
afterEach(() => {
  process.env = { ...original };
  vi.unstubAllGlobals();
});

describe("constancia-ocr POST", () => {
  it("devuelve la lectura normalizada y anota lo que costó de verdad (por tienda)", async () => {
    const { res, j } = await post({ archivo: JPEG });
    expect(res.status).toBe(200);
    expect(j.proveedor).toBe("claude");
    expect(j.lectura).toMatchObject({ codigoRegistro: "19-SEC/REG-PLT-2025-096", fechaInscripcion: "2025-03-14", superficieHa: 12.5 });
    expect((j.lectura as { especies: unknown[] }).especies).toEqual([LEIDO.especies[0]]);
    /* 9 000 × US$2/M + 1 500 × US$10/M = 0,033 → al centavo hacia arriba. */
    expect(gasto.recordSpend).toHaveBeenCalledWith("t-qa-constancia", 0.04);
  });

  it("acepta un PDF real de hasta 5 páginas y lo manda como `document`", async () => {
    const { res, fetchMock } = await post({ archivo: await pdfDe(2) });
    expect(res.status).toBe(200);
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as { messages: { content: { type: string }[] }[] };
    expect(body.messages[0].content[0].type).toBe("document");
  });

  it("auditoría 3: un PDF de 6 páginas se rechaza con 400 en palabras, sin reservar ni llamar", async () => {
    const { res, j, fetchMock } = await post({ archivo: await pdfDe(6) });
    expect(res.status).toBe(400);
    expect(j).toMatchObject({ codigo: "demasiadas_paginas", error: expect.stringMatching(/6 páginas/) });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(gasto.canSpend).not.toHaveBeenCalled();
  });

  it("auditoría 3: la reserva crece con las páginas del PDF", async () => {
    await post({ archivo: JPEG });
    const foto = gasto.canSpend.mock.calls[0]?.[1] as number;
    vi.resetModules();
    gasto.canSpend.mockClear();
    await post({ archivo: await pdfDe(5) });
    const cinco = gasto.canSpend.mock.calls[0]?.[1] as number;
    expect(cinco).toBeGreaterThan(foto);
  });

  it("auditoría 2: un PDF disfrazado de JPEG → 400 sin llamar a la IA ni gastar", async () => {
    const { res, j, fetchMock } = await post({ archivo: PDF_DISFRAZADO_DE_JPEG });
    expect(res.status).toBe(400);
    expect(j.codigo).toBe("formato_no_soportado");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(gasto.recordSpend).not.toHaveBeenCalled();
  });

  it("auditoría 1: la IA contestó (cobró) pero la lectura salió cortada → 422 Y se anota el gasto", async () => {
    const { res, fetchMock } = await post({ archivo: JPEG }, { extra: { stop_reason: "max_tokens", usage: { input_tokens: 30_000, output_tokens: 5_000 } } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(422);
    expect(gasto.recordSpend).toHaveBeenCalledWith("t-qa-constancia", 0.11);
  });

  it("auditoría 1: JSON ilegible también anota; un 429 de la IA (no cobró) no", async () => {
    await post({ archivo: JPEG }, { respuestaFalsa: new Response(JSON.stringify({ content: [{ type: "text", text: "no es json" }], stop_reason: "end_turn", usage: { input_tokens: 5000, output_tokens: 100 } }), { status: 200 }) });
    expect(gasto.recordSpend).toHaveBeenCalledWith("t-qa-constancia", 0.02);
    vi.resetModules();
    gasto.recordSpend.mockClear();
    const r = await post({ archivo: JPEG }, { respuestaFalsa: new Response(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "x" } }), { status: 429 }) });
    expect(r.res.status).toBe(429);
    expect(gasto.recordSpend).not.toHaveBeenCalled();
  });

  it("auditoría 4: sin clave, al admin del negocio un aviso genérico; con sesión de superadmin, cómo activarla", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const negocio = await post({ archivo: JPEG });
    expect(negocio.res.status).toBe(503);
    expect(negocio.j).toEqual({
      error: "La lectura con IA no está disponible ahora; avisa al administrador. Mientras tanto, carga los datos a mano.",
      codigo: "ia_no_disponible",
    });
    expect(negocio.fetchMock).not.toHaveBeenCalled();
    expect(gasto.canSpend).not.toHaveBeenCalled();

    vi.resetModules();
    const plataformaOk = await post({ archivo: JPEG }, { cookie: "buleje-platform-sess=tok-valido" });
    expect(plataformaOk.j).toEqual({
      error: "La lectura con IA se activa con tu clave de Claude (ANTHROPIC_API_KEY en el archivo .env.local) y reiniciando el servidor.",
      codigo: "sin_lector",
    });

    vi.resetModules();
    const tokenFalso = await post({ archivo: JPEG }, { cookie: "buleje-platform-sess=inventado" });
    expect(tokenFalso.j.codigo).toBe("ia_no_disponible");
  });

  it("auditoría 4: clave mala → al negocio, genérico (503, no 401 ni el detalle de la plataforma)", async () => {
    const { res, j } = await post({ archivo: JPEG }, { respuestaFalsa: new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }), { status: 401 }) });
    expect(res.status).toBe(503);
    expect(j.codigo).toBe("ia_no_disponible");
    expect(JSON.stringify(j)).not.toMatch(/env\.local|console\.anthropic|no es válida/);
    expect(gasto.recordSpend).not.toHaveBeenCalled();
  });

  it("una foto de otra cosa (todo null): 422 en palabras", async () => {
    const vacio = Object.fromEntries(Object.keys(LEIDO).map((k) => [k, k === "especies" ? [] : k === "nota" ? "" : null]));
    const { res, j } = await post({ archivo: JPEG }, { leido: vacio });
    expect(res.status).toBe(422);
    expect(String(j.error)).toMatch(/no se ve una constancia/);
  });

  it("texto suelto o un tipo que no es foto/PDF se rechaza antes de gastar", async () => {
    const r1 = await post({ archivo: "hola" });
    expect(r1.res.status).toBe(400);
    vi.resetModules();
    const r2 = await post({ archivo: `data:text/html;base64,${"A".repeat(400)}` });
    expect(r2.res.status).toBe(400);
    expect(r2.fetchMock).not.toHaveBeenCalled();
  });

  it("el límite es por la tienda de la SESIÓN (multi-tenant), no por algo que mande el cliente", async () => {
    await post({ archivo: JPEG, tenantId: "otra-tienda" });
    expect(rateLimitMock).toHaveBeenCalledWith(expect.anything(), "MODERATE", "t-qa-constancia", "loth-constancia-ocr", expect.any(Object));
    expect(gasto.canSpend).toHaveBeenCalledWith("t-qa-constancia", expect.any(Number));
  });

  it("sin sesión: 401 (nunca 404); el encargado no lee la constancia (403)", async () => {
    sesion.valor = null;
    expect((await post({ archivo: JPEG })).res.status).toBe(401);
    vi.resetModules();
    sesion.valor = { tenantId: "t-qa-constancia", role: "manager" };
    const r = await post({ archivo: JPEG });
    expect(r.res.status).toBe(403);
    expect(r.fetchMock).not.toHaveBeenCalled();
  });

  it("un archivo más grande que el tope se corta con 413 por el content-length", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { POST } = await import("@/app/api/admin/forestal/plan/constancia-ocr/route");
    const res = await POST(new NextRequest(URL_API, { method: "POST", headers: { "content-length": String(6_000_000) }, body: JSON.stringify({ archivo: JPEG }) }));
    expect(res.status).toBe(413);
  });
});

describe("constancia-ocr GET", () => {
  it("dice si hay lector y si lee PDF, sin gastar; el proveedor y el aviso con instrucciones sólo para superadmin", async () => {
    const { GET } = await import("@/app/api/admin/forestal/plan/constancia-ocr/route");
    expect(await (await GET(new NextRequest(URL_API))).json()).toEqual({ activo: true, proveedor: null, leePdf: true, aviso: null, codigo: null });
    delete process.env.ANTHROPIC_API_KEY;
    const negocio = (await (await GET(new NextRequest(URL_API))).json()) as { activo: boolean; aviso: string; codigo: string };
    expect(negocio).toMatchObject({ activo: false, codigo: "ia_no_disponible" });
    expect(negocio.aviso).not.toMatch(/ANTHROPIC_API_KEY/);
    const admin = (await (await GET(new NextRequest(URL_API, { headers: { cookie: "buleje-platform-sess=tok-valido" } }))).json()) as { aviso: string; codigo: string };
    expect(admin).toMatchObject({ codigo: "sin_lector", aviso: expect.stringMatching(/ANTHROPIC_API_KEY/) });
  });
});
