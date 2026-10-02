/**
 * ADR-457 · las rutas de piezas por el camino real de sus guardas.
 *
 * · Superadmin: `requirePlatformAPI` REAL (sólo se simula la verificación del
 *   token), CSRF, Zod del cuerpo y el Zod `.strict()` de la pieza.
 * · Panel (`/api/admin/me/specializations`): `requireAdmin` REAL; el negocio
 *   sale del JWT aunque el header o la query digan otro; las filas rotas no
 *   llegan al navegador; una tabla caída no le esconde los módulos.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  plataforma: null as null | { username: string },
  listarPrendidas: vi.fn(),
  guardar: vi.fn(),
  matriz: vi.fn(),
  getBasicById: vi.fn(),
  listEnabled: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/superadmin-session", async (real) => ({
  ...(await real<typeof import("@/lib/superadmin-session")>()),
  getPlatformSession: async (token: string) => (token === "plataforma-ok" ? H.plataforma : null),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: (...a: unknown[]) => H.logActivity(...a) }));
vi.mock("@/lib/db/tenant-pieza.db", () => ({
  TenantPiezaDB: {
    listarPrendidas: (...a: unknown[]) => H.listarPrendidas(...a),
    guardar: (...a: unknown[]) => H.guardar(...a),
    matriz: (...a: unknown[]) => H.matriz(...a),
  },
}));
vi.mock("@/lib/db/tenants.db", () => ({ TenantsDB: { getBasicById: (...a: unknown[]) => H.getBasicById(...a) } }));
vi.mock("@/lib/specializations", () => ({
  listEnabledSpecializations: (...a: unknown[]) => H.listEnabled(...a),
  SPECIALIZATIONS: { "spec:forestal:ctp-libro": { moduleId: "ctp-libro-operaciones" } },
}));
// Al registro real se le suma una pieza de PANEL para probar la pestaña «A medida».
vi.mock("@/extensiones/registro.servidor", async (real) => {
  const { z } = await import("zod");
  const reales = (await real<typeof import("@/extensiones/registro.servidor")>()).PIEZAS_SERVIDOR;
  return {
    PIEZAS_SERVIDOR: [
      ...reales,
      {
        manifiesto: {
          id: "pestana-de-prueba",
          nombre: "Pestaña de prueba",
          descripcion: "x",
          version: "2.0.0",
          enchufes: ["panel.pestana"],
          opciones: z.object({ mes: z.string().default("2026-09") }).strict(),
        },
      },
    ],
  };
});

import { assertCsrf } from "@/lib/auth/csrf";
import { GET as GET_PIEZAS } from "@/app/api/superadmin/piezas/route";
import { PUT as PUT_ASIGNACION } from "@/app/api/superadmin/piezas/asignacion/route";
import { GET as GET_ME } from "@/app/api/admin/me/specializations/route";

const fila = (o: Partial<Record<string, unknown>> = {}) => ({
  id: "f1",
  tenantId: "t1",
  piezaId: "gtf-hoja-de-control",
  enchufe: "forestal.guia-impresa",
  prendida: true,
  opciones: {},
  version: "1.0.0",
  orden: 0,
  actualizadoPor: "superadmin:root",
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  ...o,
});

const superadmin = (metodo: "GET" | "PUT", ruta: string, body?: unknown, sesion = true) =>
  new NextRequest(`http://localhost${ruta}`, {
    method: metodo,
    headers: {
      // `buleje-platform-sess` = PLATFORM_SESSION.COOKIE_NAME (lib/superadmin-session.ts).
      ...(sesion ? { cookie: "buleje-platform-sess=plataforma-ok" } : {}),
      "content-type": "application/json",
    },
    ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });

const panel = (ruta: string, conSesion = true, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${ruta}`, {
    headers: { ...(conSesion ? { cookie: "buleje-admin-sess=token-falso" } : {}), ...headers },
  });

const cuerpoOk = {
  tenantId: "main",
  piezaId: "gtf-hoja-de-control",
  enchufe: "forestal.guia-impresa",
  prendida: true,
  opciones: { nota: "Avisar antes de salir" },
};

beforeEach(async () => {
  vi.clearAllMocks();
  H.plataforma = { username: "root" };
  H.payload = { username: "qaadmin", role: "admin", tenantId: "t1" };
  H.listEnabled.mockResolvedValue(["spec:forestal:ctp-libro"]);
  H.listarPrendidas.mockResolvedValue([]);
  H.getBasicById.mockImplementation(async (id: string) => (id === "no-existe" ? null : { id, slug: `slug-${id}`, name: id }));
  H.guardar.mockImplementation(async (tenantId: string, input: Record<string, unknown>, actor: string) =>
    fila({ ...input, tenantId, actualizadoPor: actor }),
  );
  H.matriz.mockResolvedValue([]);
  H.logActivity.mockResolvedValue(undefined);
});

it("la cookie del test es la de la sesión de plataforma", async () => {
  const { PLATFORM_SESSION } = await import("@/lib/superadmin-session");
  expect(PLATFORM_SESSION.COOKIE_NAME).toBe("buleje-platform-sess");
});

describe("GET /api/superadmin/piezas", () => {
  it("sin sesión de plataforma → 401", async () => {
    const r = await GET_PIEZAS(superadmin("GET", "/api/superadmin/piezas", undefined, false));
    expect(r.status).toBe(401);
    expect(H.matriz).not.toHaveBeenCalled();
  });

  it("una sesión de ADMIN de negocio no sirve → 401", async () => {
    const r = await GET_PIEZAS(panel("/api/superadmin/piezas"));
    expect(r.status).toBe(401);
  });

  it("con sesión: catálogo con JSON Schema + matriz anotada", async () => {
    H.matriz.mockResolvedValue([
      { ...fila(), tenantSlug: "main", tenantNombre: "Bodega" },
      { ...fila({ id: "f2", piezaId: "borrada-del-codigo" }), tenantSlug: "main", tenantNombre: "Bodega" },
      { ...fila({ id: "f3", version: "0.9.0", opciones: { tenantId: "x" } }), tenantSlug: "otro", tenantNombre: "Otro" },
    ]);
    const r = await GET_PIEZAS(superadmin("GET", "/api/superadmin/piezas"));
    expect(r.status).toBe(200);
    const j = await r.json();
    const hoja = j.catalogo.find((c: { id: string }) => c.id === "gtf-hoja-de-control");
    expect(hoja.opcionesSchema).toMatchObject({ type: "object", additionalProperties: false });
    expect(j.matriz.map((m: Record<string, unknown>) => [m.id, m.huerfana, m.desactualizada, m.opcionesValidas])).toEqual([
      ["f1", false, false, true],
      ["f2", true, false, false],
      ["f3", false, true, false],
    ]);
  });
});

describe("PUT /api/superadmin/piezas/asignacion", () => {
  const put = async (body: unknown, sesion = true) =>
    PUT_ASIGNACION(superadmin("PUT", "/x", body, sesion));

  it("sin CSRF → 403 y no escribe", async () => {
    vi.mocked(assertCsrf).mockReturnValueOnce(NextResponse.json({ error: "csrf" }, { status: 403 }));
    const r = await put(cuerpoOk);
    expect(r.status).toBe(403);
    expect(H.guardar).not.toHaveBeenCalled();
  });

  it("sin sesión de plataforma → 401 y no escribe", async () => {
    const r = await put(cuerpoOk, false);
    expect(r.status).toBe(401);
    expect(H.guardar).not.toHaveBeenCalled();
  });

  it("cuerpo con un campo de más → 400 validation_error", async () => {
    const r = await put({ ...cuerpoOk, extra: 1 });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("validation_error");
  });

  it("enchufe inventado → 400", async () => {
    expect((await put({ ...cuerpoOk, enchufe: "panel.cualquiera" })).status).toBe(400);
  });

  it("pieza que no está en el código → 400 pieza_desconocida", async () => {
    const r = await put({ ...cuerpoOk, piezaId: "no-existe" });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("pieza_desconocida");
  });

  it("un tenantId colado en las opciones → 400 opciones_invalidas y no escribe", async () => {
    const r = await put({ ...cuerpoOk, opciones: { tenantId: "otro-negocio" } });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("opciones_invalidas");
    expect(H.guardar).not.toHaveBeenCalled();
  });

  it("APAGAR con opciones viejas inválidas se puede, y no pisa las guardadas", async () => {
    const r = await put({ ...cuerpoOk, prendida: false, opciones: { campoQueYaNoExiste: 1 } });
    expect(r.status).toBe(200);
    const [, input] = H.guardar.mock.calls[0];
    expect(input).toMatchObject({ prendida: false, opciones: null });
  });

  it("PRENDER con opciones inválidas sigue rechazado", async () => {
    const r = await put({ ...cuerpoOk, prendida: true, opciones: { campoQueYaNoExiste: 1 } });
    expect(r.status).toBe(400);
    expect(H.guardar).not.toHaveBeenCalled();
  });

  it("negocio que no existe → 404", async () => {
    const r = await put({ ...cuerpoOk, tenantId: "no-existe" });
    expect(r.status).toBe(404);
    expect(H.guardar).not.toHaveBeenCalled();
  });

  it("ok → guarda con la versión del manifiesto, opciones con defaults, actor de plataforma y ActivityLog", async () => {
    const r = await put(cuerpoOk);
    expect(r.status).toBe(200);
    const [tenantId, input, actor] = H.guardar.mock.calls[0];
    expect(tenantId).toBe("main");
    expect(input).toMatchObject({ piezaId: "gtf-hoja-de-control", enchufe: "forestal.guia-impresa", prendida: true, version: "1.0.0" });
    expect(input.opciones).toMatchObject({ nota: "Avisar antes de salir", mostrarOrigen: true });
    expect(actor).toBe("superadmin:root");
    expect(H.logActivity).toHaveBeenCalledWith(
      "pieza_prendida",
      "TenantPieza",
      expect.stringContaining("slug-main"),
      "f1",
      "superadmin:root",
      undefined,
      "main",
    );
    expect((await r.json()).fila).toMatchObject({ tenantId: "main", prendida: true });
  });
});

describe("GET /api/admin/me/specializations (piezas del negocio)", () => {
  it("sin sesión → 401", async () => {
    expect((await GET_ME(panel("/api/admin/me/specializations", false))).status).toBe(401);
  });

  it("el negocio sale del JWT aunque el header y la query digan otro", async () => {
    await GET_ME(panel("/api/admin/me/specializations?tenantId=t2", true, { "x-tenant-id": "t2" }));
    expect(H.listarPrendidas).toHaveBeenCalledWith("t1");
    expect(H.listEnabled).toHaveBeenCalledWith("t1");
  });

  it("sin piezas: la forma de siempre + piezas [] y negocio null", async () => {
    const j = await (await GET_ME(panel("/api/admin/me/specializations"))).json();
    expect(j).toEqual({ keys: ["spec:forestal:ctp-libro"], moduleIds: ["ctp-libro-operaciones"], piezas: [], negocio: null });
  });

  it("filas rotas no llegan al navegador; las buenas, con defaults; sin pestaña no hay módulo a-medida", async () => {
    H.listarPrendidas.mockResolvedValue([
      fila({ opciones: { nota: "x" } }),
      fila({ id: "f2", piezaId: "borrada-del-codigo" }),
      fila({ id: "f3", piezaId: "gtf-hoja-de-control", enchufe: "tienda.portada" }),
      fila({ id: "f4", piezaId: "pestana-de-prueba", enchufe: "panel.pestana", opciones: { tenantId: "x" } }),
    ]);
    const j = await (await GET_ME(panel("/api/admin/me/specializations"))).json();
    expect(j.piezas).toHaveLength(1);
    expect(j.piezas[0]).toMatchObject({ piezaId: "gtf-hoja-de-control", enchufe: "forestal.guia-impresa", opciones: { nota: "x", mostrarOrigen: true } });
    expect(j.negocio).toEqual({ tenantId: "t1", slug: "slug-t1" });
    expect(j.moduleIds).not.toContain("a-medida");
  });

  it("una pieza de panel prendida suma el módulo a-medida", async () => {
    H.listarPrendidas.mockResolvedValue([fila({ piezaId: "pestana-de-prueba", enchufe: "panel.pestana", version: "2.0.0" })]);
    const j = await (await GET_ME(panel("/api/admin/me/specializations"))).json();
    expect(j.moduleIds).toEqual(["ctp-libro-operaciones", "a-medida"]);
    expect(j.piezas[0]).toMatchObject({ piezaId: "pestana-de-prueba", opciones: { mes: "2026-09" } });
  });

  it("la tabla de piezas caída no esconde los módulos del negocio", async () => {
    H.listarPrendidas.mockRejectedValue(new Error('relation "TenantPieza" does not exist'));
    const r = await GET_ME(panel("/api/admin/me/specializations"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ keys: ["spec:forestal:ctp-libro"], moduleIds: ["ctp-libro-operaciones"], piezas: [], negocio: null });
  });
});
