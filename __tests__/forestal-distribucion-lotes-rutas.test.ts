/**
 * ADR-464 por las rutas:
 *  · el bloque guardado RECUERDA sus trozas: POST → KV → GET devuelve
 *    `trozaIds` y `corridaIds` (el schema de `/distribuciones` es una whitelist:
 *    sin declararlos, Zod los borraba en silencio);
 *  · «Crear lotes sugeridos» en `/lotes-aserrio/propuestas`: sin sesión 401,
 *    bloque sin trozas 400, el `tenantId` sale de la sesión (nunca del body).
 * La DB de propuestas va simulada: lo que escribe se prueba en
 * `forestal-lote-propuesta-por-bloques-db.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  kv: new Map<string, unknown>(),
  previsualizar: vi.fn(),
  crear: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: vi.fn(async () => true) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: () => {}, auditCtpEsperando: async () => {} }));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    get: async (k: string) => H.kv.get(k) ?? null,
    set: async (k: string, v: unknown) => void H.kv.set(k, JSON.parse(JSON.stringify(v))),
  },
}));
vi.mock("@/lib/db/forest-lote-propuesta.db", () => ({
  ForestLotePropuestaDB: { previsualizarPorBloques: H.previsualizar, crearPorBloques: H.crear, leer: vi.fn(), crear: vi.fn() },
}));

import * as distribuciones from "@/app/api/admin/forestal/distribuciones/route";
import * as propuestas from "@/app/api/admin/forestal/lotes-aserrio/propuestas/route";

function sesion(tenantId: string | null) {
  H.requireAdmin.mockImplementation(async () =>
    tenantId ? { tenantId, username: "qaadmin", role: "admin" } : NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  );
}
const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`https://host${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
/* `withApiHandler` envuelve con (req, ctx); las rutas de propuestas son funciones sueltas. */
const ctx = { params: Promise.resolve({}) };

beforeEach(() => {
  H.kv.clear();
  H.previsualizar.mockReset();
  H.crear.mockReset();
  sesion("t-qa");
});

describe("/distribuciones — el bloque recuerda sus trozas", () => {
  it("guardar y volver a abrir conserva trozaIds y corridaIds", async () => {
    const bloque = {
      id: "b1",
      etiqueta: "019-001-0000004",
      especie: "Tornillo",
      m3: 2.5,
      permiso: "19-SEC/REG-PLT-2021-017",
      origen: "manual",
      tipo: "rolliza",
      trozaIds: ["cmtroza0000a", "cmtroza0000b"],
      corridaIds: ["cmcorrida001"],
    };
    const post = await distribuciones.POST(req("/api/admin/forestal/distribuciones", "POST", { nombre: "Guías Tornillo", bloques: [bloque] }), ctx);
    expect(post.status).toBe(201);
    const get = await distribuciones.GET(req("/api/admin/forestal/distribuciones"), ctx);
    const { distribuciones: lista } = (await get.json()) as { distribuciones: { bloques: Record<string, unknown>[] }[] };
    expect(lista[0].bloques[0]).toMatchObject({ trozaIds: ["cmtroza0000a", "cmtroza0000b"], corridaIds: ["cmcorrida001"] });
  });

  it("un bloque viejo, sin trozas, se sigue guardando igual (nullish)", async () => {
    const post = await distribuciones.POST(
      req("/api/admin/forestal/distribuciones", "POST", { nombre: "Vieja", bloques: [{ id: "b1", etiqueta: "x", especie: "", m3: 1, origen: "manual" }] }),
      ctx,
    );
    expect(post.status).toBe(201);
  });

  it("más de 500 trozas en un bloque se rechaza con 400 (el KV es un JSON)", async () => {
    const trozaIds = Array.from({ length: 501 }, (_, i) => `t${i}`);
    const post = await distribuciones.POST(
      req("/api/admin/forestal/distribuciones", "POST", { nombre: "Grande", bloques: [{ id: "b1", etiqueta: "x", especie: "", m3: 1, origen: "manual", trozaIds }] }),
      ctx,
    );
    expect(post.status).toBe(400);
  });
});

describe("/lotes-aserrio/propuestas — «Crear lotes sugeridos»", () => {
  const URL = "/api/admin/forestal/lotes-aserrio/propuestas";

  it("sin sesión → 401 y no toca la base", async () => {
    sesion(null);
    const r = await propuestas.POST(req(URL, "POST", { modo: "crear", bloques: [{ bloqueId: "b1", trozaIds: ["a"] }] }));
    expect(r.status).toBe(401);
    expect(H.crear).not.toHaveBeenCalled();
  });

  it("un bloque sin trozas (cargado a mano) → 400 con «tráelo del Libro»", async () => {
    const r = await propuestas.POST(req(URL, "POST", { modo: "crear", bloques: [{ bloqueId: "b1", trozaIds: [] }] }));
    expect(r.status).toBe(400);
    expect(((await r.json()) as { message: string }).message).toContain("tráelo del Libro");
  });

  it("previsualizar → 200 con lo que diría cada bloque, con el tenant de la SESIÓN", async () => {
    H.previsualizar.mockResolvedValue([{ bloqueId: "b1", listo: false, motivo: "El ingreso no tiene permiso: corrígelo en Ingresos." }]);
    const r = await propuestas.POST(
      req(URL, "POST", { modo: "previsualizar", tenantId: "t-blas", bloques: [{ bloqueId: "b1", trozaIds: ["a"] }] }),
    );
    expect(r.status).toBe(200);
    expect(H.previsualizar).toHaveBeenCalledWith("t-qa", [{ bloqueId: "b1", trozaIds: ["a"] }]);
  });

  it("crear → 201 si armó alguno; 200 si ninguno (los motivos vuelven por bloque)", async () => {
    H.crear.mockResolvedValueOnce({ creados: [{ bloqueId: "b1", loteId: "L1", code: "LA-2026-011" }], noCreados: [] });
    const ok = await propuestas.POST(req(URL, "POST", { modo: "crear", bloques: [{ bloqueId: "b1", etiqueta: "Guía 4", trozaIds: ["a"] }] }));
    expect(ok.status).toBe(201);
    expect(H.crear).toHaveBeenCalledWith("t-qa", [{ bloqueId: "b1", etiqueta: "Guía 4", trozaIds: ["a"] }], "qaadmin");

    H.crear.mockResolvedValueOnce({ creados: [], noCreados: [{ bloqueId: "b1", motivo: "x" }] });
    const ninguno = await propuestas.POST(req(URL, "POST", { modo: "crear", bloques: [{ bloqueId: "b1", trozaIds: ["a"] }] }));
    expect(ninguno.status).toBe(200);
  });
});
