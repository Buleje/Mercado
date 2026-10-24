// @vitest-environment node
/**
 * ADR-516 — Las rutas del código único de los papeles.
 *
 * `PATCH /api/admin/documents/codigo-fisico` («ya lo puse en el físico» / deshacer):
 * - sin sesión del panel no pasa (la respuesta de `requireAdmin` sale tal cual);
 * - el negocio sale del JWT, nunca del cuerpo; sólo marca lo que el rol ve;
 * - cuerpo inválido = 400 sin tocar nada; queda en el historial con quién.
 *
 * `GET /api/admin/documents?q=`: «DOC-000123» / «doc 123» se buscan tal cual
 * (la interpretación se comía el «doc»); un número pelado se sigue interpretando
 * («2026» es el año del papel); `conteo=1&codigoPendiente=1` da la cifra.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const H = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  idsVisibles: vi.fn(),
  marcarCodigoFisico: vi.fn(),
  logMany: vi.fn(),
  list: vi.fn(),
  conteoCodigoPendiente: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/documents/ai-categorize", () => ({ aiCategorize: async () => ({}) }));
vi.mock("@/lib/documents/analyze-document", () => ({ analyzeDocumentContent: async () => {}, isAnalyzableMime: () => false }));
vi.mock("@/lib/documents/cola-analisis", () => ({ enColaDeAnalisis: async () => {} }));
vi.mock("@/lib/documents/precalcular-miniatura", () => ({ precalcularMiniatura: async () => {} }));
vi.mock("@/lib/db/documents.db", () => ({
  CarpetaAjenaError: class extends Error {},
  DocumentsDB: {
    idsVisibles: H.idsVisibles,
    marcarCodigoFisico: H.marcarCodigoFisico,
    logMany: H.logMany,
    list: H.list,
    conteoCodigoPendiente: H.conteoCodigoPendiente,
    carpetasParaBuscar: async () => [],
    listExpiring: async () => [],
  },
}));

const { PATCH } = await import("@/app/api/admin/documents/codigo-fisico/route");
const { GET } = await import("@/app/api/admin/documents/route");

const AUTH = { tenantId: "t-a", username: "karla", role: "cajero" };
const patch = (body: unknown) =>
  PATCH(new NextRequest("http://x/api/admin/documents/codigo-fisico", { method: "PATCH", body: JSON.stringify(body) }));
const get = (qs: string) => GET(new NextRequest(`http://x/api/admin/documents?${qs}`));

beforeEach(() => {
  vi.clearAllMocks();
  H.requireAdmin.mockResolvedValue(AUTH);
  H.idsVisibles.mockImplementation(async (_t: string, ids: string[]) => ids.filter((i) => i !== "restringido"));
  H.marcarCodigoFisico.mockImplementation(async (_t: string, ids: string[]) => ids.map((id, i) => ({ id, codigo: i + 1 })));
  H.logMany.mockResolvedValue(undefined);
  H.list.mockResolvedValue([]);
  H.conteoCodigoPendiente.mockResolvedValue({ pendientes: 3, atrasados: 1 });
});

describe("PATCH codigo-fisico", () => {
  it("sin sesión del panel no marca nada", async () => {
    H.requireAdmin.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const r = await patch({ ids: ["d1"], puesto: true });
    expect(r.status).toBe(401);
    expect(H.marcarCodigoFisico).not.toHaveBeenCalled();
  });

  it("cuerpo inválido = 400 sin tocar la base", async () => {
    for (const body of [{ ids: [], puesto: true }, { ids: ["d1"] }, { ids: ["d1"], puesto: "si" }, null]) {
      const r = await patch(body);
      expect(r.status, JSON.stringify(body)).toBe(400);
    }
    expect(H.marcarCodigoFisico).not.toHaveBeenCalled();
  });

  it("marca en el negocio del JWT, sólo lo que el rol ve, y anota quién", async () => {
    const r = await patch({ ids: ["d1", "d1", "restringido", "d2"], puesto: true, tenantId: "t-b" });
    expect(r.status).toBe(200);
    expect(H.idsVisibles).toHaveBeenCalledWith("t-a", ["d1", "restringido", "d2"], "cajero");
    expect(H.marcarCodigoFisico).toHaveBeenCalledWith("t-a", ["d1", "d2"], true, "karla");
    const j = await r.json();
    expect(j).toMatchObject({ ok: true, actualizados: 2, ids: ["d1", "d2"], codigoFisicoPor: "karla" });
    expect(typeof j.codigoFisicoAt).toBe("string");
    expect(H.logMany).toHaveBeenCalledWith("t-a", ["d1", "d2"], expect.objectContaining({ actorId: "karla", action: "codigo_fisico" }));
  });

  it("deshacer deja fecha y quién vacíos", async () => {
    const j = await (await patch({ ids: ["d1"], puesto: false })).json();
    expect(H.marcarCodigoFisico).toHaveBeenCalledWith("t-a", ["d1"], false, "karla");
    expect(j).toMatchObject({ codigoFisicoAt: null, codigoFisicoPor: null });
  });

  it("si nada cambió no ensucia el historial", async () => {
    H.marcarCodigoFisico.mockResolvedValue([]);
    const j = await (await patch({ ids: ["d1"], puesto: true })).json();
    expect(j.actualizados).toBe(0);
    expect(H.logMany).not.toHaveBeenCalled();
  });
});

describe("GET lista: buscar por código", () => {
  const filtrosDeLista = () => H.list.mock.calls[0][1] as Record<string, unknown>;

  it.each(["DOC-000123", "doc 123", "#123"])("«%s» se busca tal cual", async (q) => {
    await get(`q=${encodeURIComponent(q)}`);
    expect(H.list.mock.calls[0][0]).toBe("t-a");
    expect(filtrosDeLista()).toMatchObject({ q });
    expect(filtrosDeLista().grupos).toBeUndefined();
  });

  it("un número pelado sigue interpretándose: «2026» es el año", async () => {
    await get("q=2026");
    // El año va en un grupo (texto «2026» o fecha del papel en 2026), no como búsqueda suelta.
    expect(filtrosDeLista().q).toBeUndefined();
    expect(filtrosDeLista().grupos).toEqual([expect.objectContaining({ textos: ["2026"], vence: expect.any(Object) })]);
  });

  it("«123» llega como texto y la lista lo cruza con el código", async () => {
    await get("q=123");
    expect(filtrosDeLista()).toMatchObject({ q: "123" });
  });

  it("la vista «código por poner» pide sólo esos", async () => {
    await get("codigoPendiente=1");
    expect(filtrosDeLista()).toMatchObject({ codigoPendiente: true });
  });

  it("la cifra de la cabecera sale del negocio del JWT y del rol", async () => {
    const r = await get("conteo=1&codigoPendiente=1");
    expect(await r.json()).toEqual({ codigoPendiente: { pendientes: 3, atrasados: 1 } });
    expect(H.conteoCodigoPendiente).toHaveBeenCalledWith("t-a", "cajero");
    expect(H.list).not.toHaveBeenCalled();
  });
});
