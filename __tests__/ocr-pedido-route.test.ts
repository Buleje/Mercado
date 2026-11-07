/**
 * «Venta desde una foto» (18-10): `POST /api/ocr/pedido` lee la foto del
 * pedido con el lector único (`visionExtractJSON`) y empareja cada línea con
 * el catálogo del negocio de la SESIÓN. El precio que vuelve es el del
 * catálogo; el del papel sólo como referencia. Mismo tope de gasto que
 * `/api/ocr/invoice`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { candidatosPorTexto, type ProductoDelCatalogo } from "@/lib/ventas/emparejar-pedido";

const h = vi.hoisted(() => ({
  sesion: { tenantId: "t-qa-pedido", username: "qaadmin", role: "admin" } as Record<string, string> | null,
  roles: [] as unknown[],
  rl: vi.fn((..._a: unknown[]): Response | null => null),
  gasto: {
    canSpend: vi.fn(async (..._a: unknown[]) => true),
    recordSpend: vi.fn(async (..._a: unknown[]) => undefined),
  },
  porTexto: vi.fn(),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: async (_req: unknown, roles: unknown) => {
    h.roles.push(roles);
    return h.sesion ?? NextResponse.json({ error: "No autorizado" }, { status: 401 });
  },
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: (...a: unknown[]) => h.rl(...a) }));
vi.mock("@/lib/ai/cost-control", () => ({ aiCostGuard: h.gasto }));
vi.mock("@/lib/ai/detalle-clave-ia", () => ({ veDetalleDeClaveIA: async () => false }));
vi.mock("@/lib/logger", () => ({ logger: h.logger }));
vi.mock("@/lib/db", () => ({ CotizacionesDB: { productosPorTexto: (...a: unknown[]) => h.porTexto(...a) } }));

const CATALOGO: ProductoDelCatalogo[] = [
  { id: 1252403, nombre: "Leche Gloria Entera 1L UHT", precio: 7.2, unidad: "caja" },
  { id: 1252404, nombre: "Leche Evaporada Gloria 400ml", precio: 4.9, unidad: "lata" },
  { id: 1252382, nombre: "Arroz Costeño Extra 5kg", precio: 24.9, unidad: "bolsa", taxType: "exonerado" },
  { id: 1252384, nombre: "Aceite Primor Premium 1L", precio: 11.9, unidad: "botella" },
];

const original = { ...process.env };
const JPEG = `data:image/jpeg;base64,/9j/${"A".repeat(400)}`;

function claude(texto: string) {
  return new Response(
    JSON.stringify({
      content: [
        { type: "thinking", thinking: "", signature: "x" },
        { type: "text", text: texto },
      ],
      stop_reason: "end_turn",
      usage: { input_tokens: 3000, output_tokens: 100 },
    }),
    { status: 200 },
  );
}
function conFetch(respuesta: () => Response) {
  const fetchMock = vi.fn(async (..._a: unknown[]) => respuesta());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function post(body: unknown) {
  const { POST } = await import("@/app/api/ocr/pedido/route");
  const res = await POST(new NextRequest("http://localhost/api/ocr/pedido", { method: "POST", body: JSON.stringify(body) }));
  return { res, j: (await res.json()) as Record<string, unknown> };
}

const LEIDO = JSON.stringify({
  cliente: { nombre: "Doña Rosa", documento: "4512-3456" },
  items: [
    { texto: "2 cj leche gloria", cantidad: 2 },
    { texto: "arroz costeño 5kg", cantidad: 1, precio: 20 },
    { texto: "3 panetones donofrio", cantidad: 3 },
    { texto: "  ", cantidad: 1 },
  ],
});

beforeEach(() => {
  vi.resetModules();
  h.sesion = { tenantId: "t-qa-pedido", username: "qaadmin", role: "admin" };
  h.roles.length = 0;
  h.rl.mockClear();
  h.gasto.canSpend.mockReset().mockResolvedValue(true);
  h.gasto.recordSpend.mockClear();
  h.porTexto.mockReset().mockImplementation(async (_t: string, textos: string[], limite: number) => candidatosPorTexto(textos, CATALOGO, limite));
  process.env.ANTHROPIC_API_KEY = "sk-ant-api03-CLAVE-DE-PRUEBA";
  delete process.env.OPENAI_API_KEY;
});
afterEach(() => {
  process.env = { ...original };
  vi.unstubAllGlobals();
});

describe("POST /api/ocr/pedido", () => {
  it("lee, empareja con el catálogo de la sesión y devuelve el precio del catálogo", async () => {
    const f = conFetch(() => claude(LEIDO));
    const { res, j } = await post({ image: JPEG });
    expect(res.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
    expect(h.porTexto).toHaveBeenCalledWith("t-qa-pedido", ["2 cj leche gloria", "arroz costeño 5kg", "3 panetones donofrio"], 4);
    const items = j.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ textoLeido: "2 cj leche gloria", cantidad: 2, productoId: 1252403, precioCatalogo: 7.2 });
    expect(items[1]).toMatchObject({ productoId: 1252382, precioCatalogo: 24.9, precioLeido: 20, taxType: "exonerado" });
    expect(items[2]).toMatchObject({ productoId: null, confianza: "sin_match", cantidad: 3 });
    for (const it of items) expect((it.alternativas as unknown[]).length).toBeLessThanOrEqual(3);
    // «4512-3456» = 8 dígitos (DNI) → se propone; el nombre tal cual.
    expect(j.cliente).toEqual({ nombre: "Doña Rosa", documento: "45123456" });
    expect(h.gasto.recordSpend).toHaveBeenCalledWith("t-qa-pedido", expect.any(Number));
  });

  it("un documento que no es DNI ni RUC no se propone", async () => {
    conFetch(() => claude(JSON.stringify({ cliente: { documento: "123" }, items: [{ texto: "aceite primor", cantidad: 1 }] })));
    const { j } = await post({ image: JPEG });
    expect(j.cliente).toBeUndefined();
  });

  it("roles de crear cotización; límite por negocio + usuario DESPUÉS del login", async () => {
    conFetch(() => claude(LEIDO));
    await post({ image: JPEG });
    expect(h.roles[0]).toEqual(["admin", "owner", "manager"]);
    expect(h.rl).toHaveBeenCalledWith(expect.anything(), "MODERATE", "ocr-pedido:t-qa-pedido:qaadmin");
  });

  it("sin sesión → 401, sin leer ni gastar", async () => {
    h.sesion = null;
    const f = conFetch(() => claude(LEIDO));
    const { res } = await post({ image: JPEG });
    expect(res.status).toBe(401);
    expect(f).not.toHaveBeenCalled();
    expect(h.rl).not.toHaveBeenCalled();
  });

  it("sin clave de IA → 503 (sin el detalle de la clave para quien no lo ve), sin llamar a nadie", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const f = conFetch(() => claude(LEIDO));
    const { res, j } = await post({ image: JPEG });
    expect(res.status).toBe(503);
    expect(j.codigo).toBe("ia_no_disponible");
    expect(f).not.toHaveBeenCalled();
  });

  it("presupuesto de IA agotado → 429 sin leer", async () => {
    h.gasto.canSpend.mockResolvedValue(false);
    const f = conFetch(() => claude(LEIDO));
    const { res, j } = await post({ image: JPEG });
    expect(res.status).toBe(429);
    expect(j.codigo).toBe("limite_ia");
    expect(f).not.toHaveBeenCalled();
  });

  it("sin imagen → 400", async () => {
    const { res } = await post({ image: "corta" });
    expect(res.status).toBe(400);
  });

  it("el catálogo no responde → 503 con aviso claro (la lectura ya se cobró)", async () => {
    conFetch(() => claude(LEIDO));
    h.porTexto.mockRejectedValue(new Error("pool"));
    const { res } = await post({ image: JPEG });
    expect(res.status).toBe(503);
    expect(h.gasto.recordSpend).toHaveBeenCalled();
  });
});
