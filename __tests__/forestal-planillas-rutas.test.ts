// @vitest-environment node
/**
 * Rutas de las planillas de campo: prompts del negocio (aislados por el tenant
 * de la SESIÓN), la lectura genérica (con la IA simulada) y el `planillaId` de
 * la ruta OCR de trozas.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  requireAdmin: vi.fn(),
  vision: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: vi.fn(async () => true) }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: H.audit }));
vi.mock("@/lib/ai/cost-control", () => ({ aiCostGuard: { canSpend: vi.fn(async () => true), recordSpend: vi.fn(async () => undefined) } }));
vi.mock("@/lib/ai/detalle-clave-ia", () => ({ veDetalleDeClaveIA: vi.fn(async () => false) }));
vi.mock("@/lib/ai/vision-extract", () => ({
  FORMATOS_IMAGEN: ["image/jpeg", "image/png"],
  costoMaximoLecturaUsd: () => 0.05,
  gastoDeLectura: () => 0.01,
  visionExtractJSON: H.vision,
}));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    getFresco: vi.fn(async (k: string) => H.kv.get(k) ?? null),
    actualizar: vi.fn(async (k: string, cambio: (a: unknown, tx: unknown) => { valor?: unknown; resultado: unknown }) => {
      const r = await cambio(H.kv.get(k) ?? null, {});
      if (r.valor !== undefined) H.kv.set(k, r.valor);
      return r.resultado;
    }),
  },
}));

import { DELETE, GET, PUT } from "@/app/api/admin/forestal/planillas/prompts/route";
import { POST as LEER } from "@/app/api/admin/forestal/planillas/leer/route";
import { POST as OCR_TROZAS } from "@/app/api/admin/forestal/cubicacion-ocr/trozas/route";
import { MARCA_SALIDA, PROMPT_GENERICO_TROZAS, planillaPorId } from "@/lib/forestal/planillas/catalogo";

const A = "tenant-a";
const B = "tenant-b";
const URL_P = "https://host/api/admin/forestal/planillas/prompts";
const IMG = `data:image/png;base64,${"iVBORw0KGgo".padEnd(200, "A")}`;
const PROPIO = "En esta brigada la altura se anota en pies y el DAP en pulgadas: conviértelos antes de responder.";

const sesion = (tenantId: string) => H.requireAdmin.mockResolvedValue({ tenantId, username: `dueno-${tenantId}`, role: "admin" });
const put = (body: unknown) => PUT(new NextRequest(URL_P, { method: "PUT", body: JSON.stringify(body) }));
const json = async (r: Response) => r.json() as Promise<Record<string, unknown>>;

beforeEach(() => {
  H.kv.clear();
  H.requireAdmin.mockReset();
  H.vision.mockReset();
  H.audit.mockReset();
});

describe("prompts del negocio", () => {
  it("sin sesión: 401 en los tres métodos (y no toca nada)", async () => {
    H.requireAdmin.mockResolvedValue(NextResponse.json({ error: "No autorizado" }, { status: 401 }));
    expect((await GET(new NextRequest(URL_P))).status).toBe(401);
    expect((await put({ planillaId: "censo-arboles", texto: PROPIO })).status).toBe(401);
    expect((await DELETE(new NextRequest(`${URL_P}?planillaId=censo-arboles`, { method: "DELETE" }))).status).toBe(401);
    expect(H.kv.size).toBe(0);
  });

  it("guarda sólo la parte editable, en la clave del tenant de la SESIÓN; otro tenant no lo ve", async () => {
    sesion(A);
    const r = await put({ planillaId: "censo-arboles", texto: `${PROPIO}\n\n${MARCA_SALIDA}\n- lo que sea`, tenantId: B });
    expect(r.status).toBe(200);
    const { guardado } = await json(r);
    expect(guardado).toMatchObject({ planillaId: "censo-arboles", texto: PROPIO, basadoEnVersion: 1, actualizadoPor: `dueno-${A}` });
    expect([...H.kv.keys()]).toEqual([`planillas-prompt:${A}`]);
    expect(H.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: A, action: "ctp_planilla_prompt_guardar", entityId: "censo-arboles" }));

    expect(await json(await GET(new NextRequest(URL_P)))).toEqual({ guardados: { "censo-arboles": guardado } });
    sesion(B);
    expect(await json(await GET(new NextRequest(URL_P)))).toEqual({ guardados: {} });
    // B no puede borrar el de A: su DELETE mira SU clave.
    expect(await json(await DELETE(new NextRequest(`${URL_P}?planillaId=censo-arboles`, { method: "DELETE" })))).toEqual({ borrado: false });
    sesion(A);
    expect(Object.keys((await json(await GET(new NextRequest(URL_P)))).guardados as object)).toEqual(["censo-arboles"]);
  });

  it("DELETE vuelve al de fábrica; mandar el texto de fábrica también", async () => {
    sesion(A);
    await put({ planillaId: "conteo-patio", texto: PROPIO });
    expect(await json(await DELETE(new NextRequest(`${URL_P}?planillaId=conteo-patio`, { method: "DELETE" })))).toEqual({ borrado: true });
    await put({ planillaId: "conteo-patio", texto: PROPIO });
    const fabrica = planillaPorId("conteo-patio")!.prompt;
    expect(await json(await put({ planillaId: "conteo-patio", texto: fabrica }))).toEqual({ guardado: null, fabrica: true });
    expect(await json(await GET(new NextRequest(URL_P)))).toEqual({ guardados: {} });
  });

  it("rechaza planilla desconocida y texto corto (400)", async () => {
    sesion(A);
    expect((await put({ planillaId: "no-existe", texto: PROPIO })).status).toBe(400);
    expect((await put({ planillaId: "censo-arboles", texto: "corto" })).status).toBe(400);
    expect((await DELETE(new NextRequest(`${URL_P}?planillaId=x`, { method: "DELETE" }))).status).toBe(400);
  });
});

describe("POST /planillas/leer", () => {
  const leer = (body: unknown) => LEER(new NextRequest("https://host/api/admin/forestal/planillas/leer", { method: "POST", body: JSON.stringify(body) }));

  it("lee con el prompt del negocio si lo hay y devuelve LecturaPlanilla", async () => {
    sesion(A);
    await put({ planillaId: "conteo-patio", texto: PROPIO });
    H.vision.mockResolvedValue({
      ok: true,
      data: {
        cabecera: { fecha: "2026-10-17", responsable: "Juan", cancha: "C2", horaInicio: "", horaFin: "", hoja: "1" },
        filas: [{ codigo: "T-0231", especie: "Tornillo", cancha: "", observacion: "", dudosas: ["codigo"] }],
        advertencia: "2 renglones ilegibles (8 y 9)",
      },
    });
    const r = await leer({ planillaId: "conteo-patio", imagen: IMG });
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({
      planillaId: "conteo-patio",
      cabecera: { fecha: "2026-10-17", responsable: "Juan", cancha: "C2", horaInicio: null, horaFin: null, hoja: "1" },
      filas: [{ valores: { codigo: "T-0231", especie: "Tornillo", cancha: null, observacion: null }, dudosas: ["codigo"] }],
      advertencia: "2 renglones ilegibles (8 y 9)",
      prompt: { origen: "negocio", version: 1 },
    });
    const llamada = H.vision.mock.calls[0]![0] as { prompt: string; jsonSchema: unknown };
    expect(llamada.prompt.startsWith(PROPIO)).toBe(true);
    expect(llamada.prompt).toContain(MARCA_SALIDA);
  });

  it("las de cubicar se leen desde su cubicador (400, sin gastar IA)", async () => {
    sesion(A);
    const r = await leer({ planillaId: "aserrada-pt", imagen: IMG });
    expect(r.status).toBe(400);
    expect(H.vision).not.toHaveBeenCalled();
  });

  it("sin sesión: 401", async () => {
    H.requireAdmin.mockResolvedValue(NextResponse.json({ error: "No autorizado" }, { status: 401 }));
    expect((await leer({ planillaId: "censo-arboles", imagen: IMG })).status).toBe(401);
  });
});

describe("cubicacion-ocr/trozas con planillaId", () => {
  const ocr = (body: unknown) => OCR_TROZAS(new NextRequest("https://host/api/admin/forestal/cubicacion-ocr/trozas", { method: "POST", body: JSON.stringify(body) }));
  const respuesta = { trozas: [{ d1: 20, d2: 22, largo: 10, especie: "", incierto: false }], advertencia: "" };

  it("sin planillaId usa el genérico; con «rolliza-oxapampa» el de pulgadas y pies — la respuesta no cambia de forma", async () => {
    sesion(A);
    H.vision.mockResolvedValue({ ok: true, data: respuesta });
    expect(await json(await ocr({ image: IMG }))).toEqual(respuesta);
    expect((H.vision.mock.calls[0]![0] as { prompt: string }).prompt).toBe(PROMPT_GENERICO_TROZAS);
    expect(await json(await ocr({ image: IMG, planillaId: "rolliza-oxapampa" }))).toEqual(respuesta);
    expect((H.vision.mock.calls[1]![0] as { prompt: string }).prompt).toBe(planillaPorId("rolliza-oxapampa")!.prompt);
  });

  it("un planillaId que no es de trozas: 400", async () => {
    sesion(A);
    expect((await ocr({ image: IMG, planillaId: "aserrada-pt" })).status).toBe(400);
    expect(H.vision).not.toHaveBeenCalled();
  });
});
