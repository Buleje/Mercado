/**
 * /api/admin/avisos-correo (24-10): el dueño prende y apaga sus avisos por correo.
 *
 * Corre el `requireAdmin` REAL (sólo se simula el JWT) y la lógica real de
 * lib/avisos-correo.ts sobre un PlatformSetting en memoria:
 *   - sin sesión 401; cajero y almacenero 403; el encargado lee (correo enmascarado) y no escribe;
 *   - sin fila = todo encendido;
 *   - el PATCH escribe SÓLO la fila del negocio de la sesión aunque la query, el
 *     header o el body nombren otro.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Fila = { value: unknown; updatedBy: string | null; updatedAt: Date };

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  kv: new Map<string, Fila>(),
  forestal: new Set<string>(),
  logActivity: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: vi.fn(() => null) }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: H.logActivity }));
vi.mock("@/lib/db/notifications.db", () => ({ NotificationLogsDB: { add: vi.fn() } }));

const TIENDAS: Record<string, { id: string; slug: string; name: string; ownerEmail: string | null }> = {
  main: { id: "main", slug: "main", name: "Buleje", ownerEmail: "dueno@gmail.com" },
  "c-otro": { id: "c-otro", slug: "otro", name: "Otro", ownerEmail: "otra@gmail.com" },
};

vi.mock("@/lib/db/avisos-correo.db", () => ({
  AvisosCorreoDB: {
    tienda: async (x: string) => TIENDAS[x] ?? Object.values(TIENDAS).find((t) => t.slug === x) ?? null,
    // El panel del dueño busca sólo por id exacto (un slug igual al id de otro negocio no cuela).
    tiendaPorId: async (x: string) => TIENDAS[x] ?? null,
    filas: async (keys: string[]) =>
      keys.filter((k) => H.kv.has(k)).map((k) => ({ key: k, ...(H.kv.get(k) as Fila) })),
    conForestal: async (ids: string[]) => new Set(ids.filter((id) => H.forestal.has(id))),
    ultimosEnvios: async () => new Map([["correo_stock", new Date("2026-10-20T12:00:00Z")]]),
  },
}));

vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    getCacheandoAusencia: async (k: string) => H.kv.get(k)?.value ?? null,
    actualizar: async (
      key: string,
      cambio: (actual: unknown) => { valor?: unknown; resultado: unknown },
      updatedBy?: string,
    ) => {
      const { valor, resultado } = cambio(H.kv.get(key)?.value ?? null);
      if (valor !== undefined) H.kv.set(key, { value: valor, updatedBy: updatedBy ?? null, updatedAt: new Date("2026-10-24T15:00:00Z") });
      return resultado;
    },
  },
}));

import { GET, PATCH } from "@/app/api/admin/avisos-correo/route";
import { enmascararCorreo } from "@/lib/avisos-correo-tipos";

const sesion = (role: string, tenantId = "main", username = "qaadmin") => {
  H.payload = { username, role, tenantId };
};

function pedido(
  method: "GET" | "PATCH",
  opts: { body?: unknown; conSesion?: boolean; query?: string; headers?: Record<string, string> } = {},
) {
  const { body, conSesion = true, query = "", headers = {} } = opts;
  return new NextRequest(`http://localhost/api/admin/avisos-correo${query}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(conSesion ? { cookie: "buleje-admin-sess=token-falso" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  H.payload = null;
  H.kv.clear();
  H.forestal.clear();
  H.logActivity.mockReset();
});

describe("GET /api/admin/avisos-correo", () => {
  it("401 sin sesión", async () => {
    const res = await GET(pedido("GET", { conSesion: false }));
    expect(res.status).toBe(401);
  });

  it.each(["cajero", "almacenero", "analista"])("403 para %s", async (rol) => {
    sesion(rol);
    const res = await GET(pedido("GET"));
    expect(res.status).toBe(403);
  });

  it("sin fila = todo encendido; la bodega no ve el tipo forestal", async () => {
    sesion("owner");
    const res = await GET(pedido("GET"));
    expect(res.status).toBe(200);
    const { avisos } = await res.json();
    expect(avisos).toMatchObject({ correo: "dueno@gmail.com", pausado: false, activos: 4, total: 4, puedeCambiar: true, cambio: null });
    expect(avisos.tipos.map((t: { tipo: string }) => t.tipo)).toEqual(["pedidos", "stock", "reportes", "cuenta"]);
    expect(avisos.tipos.every((t: { activo: boolean }) => t.activo)).toBe(true);
    expect(avisos.tipos.find((t: { tipo: string }) => t.tipo === "stock").ultimoEnvio).toBe("2026-10-20T12:00:00.000Z");
  });

  it("negocio forestal: aparece «Plazos forestales»", async () => {
    sesion("admin");
    H.forestal.add("main");
    const { avisos } = await (await GET(pedido("GET"))).json();
    expect(avisos.total).toBe(5);
    expect(avisos.tipos.map((t: { tipo: string }) => t.tipo)).toContain("forestal");
  });

  it("el encargado lee con el correo enmascarado y sin poder cambiar", async () => {
    sesion("manager");
    const res = await GET(pedido("GET"));
    expect(res.status).toBe(200);
    const { avisos } = await res.json();
    expect(avisos.correo).toBe("d•••@gmail.com");
    expect(avisos.puedeCambiar).toBe(false);
  });

  it("lee SU negocio aunque la query y el header nombren otro", async () => {
    sesion("owner");
    H.kv.set("avisos-correo:c-otro", { value: { pausado: true, apagados: [] }, updatedBy: "x", updatedAt: new Date() });
    const res = await GET(pedido("GET", { query: "?tenantId=c-otro", headers: { "x-tenant-id": "c-otro" } }));
    const { avisos } = await res.json();
    expect(avisos.correo).toBe("dueno@gmail.com");
    expect(avisos.pausado).toBe(false);
  });
});

describe("PATCH /api/admin/avisos-correo", () => {
  it("401 sin sesión: no escribe", async () => {
    const res = await PATCH(pedido("PATCH", { conSesion: false, body: { tipo: "stock", activo: false } }));
    expect(res.status).toBe(401);
    expect(H.kv.size).toBe(0);
  });

  it.each(["cajero", "almacenero", "manager"])("403 para %s: no escribe", async (rol) => {
    sesion(rol);
    const res = await PATCH(pedido("PATCH", { body: { tipo: "stock", activo: false } }));
    expect(res.status).toBe(403);
    expect(H.kv.size).toBe(0);
  });

  it("apaga «Stock bajo» SÓLO en la fila del negocio de la sesión, aunque la query y el header digan otro", async () => {
    sesion("owner");
    const res = await PATCH(
      pedido("PATCH", { body: { tipo: "stock", activo: false }, query: "?tenantId=c-otro", headers: { "x-tenant-id": "c-otro" } }),
    );
    expect(res.status).toBe(200);
    expect([...H.kv.keys()]).toEqual(["avisos-correo:main"]);
    expect(H.kv.get("avisos-correo:main")).toMatchObject({ value: { pausado: false, apagados: ["stock"] }, updatedBy: "qaadmin (tienda)" });
    const { avisos } = await res.json();
    expect(avisos.tipos.find((t: { tipo: string }) => t.tipo === "stock").activo).toBe(false);
    expect(avisos.activos).toBe(3);
    expect(avisos.cambio).toEqual({ en: "2026-10-24T15:00:00.000Z", por: "qaadmin" });
    expect(H.logActivity).toHaveBeenCalledWith(
      "avisos_correo_cambio", "avisos-correo", expect.stringContaining("Stock bajo"), "main", "qaadmin", undefined, "main",
    );
  });

  it("400 si el body trae otro tenantId (o cualquier clave de más): no escribe", async () => {
    sesion("owner");
    const res = await PATCH(pedido("PATCH", { body: { tipo: "stock", activo: false, tenantId: "c-otro" } }));
    expect(res.status).toBe(400);
    expect(H.kv.size).toBe(0);
  });

  it("400 con un tipo que no existe", async () => {
    sesion("admin");
    const res = await PATCH(pedido("PATCH", { body: { tipo: "spam", activo: false } }));
    expect(res.status).toBe(400);
  });

  it("pausar todos conserva los tipos apagados uno por uno", async () => {
    sesion("admin");
    H.kv.set("avisos-correo:main", { value: { pausado: false, apagados: ["reportes"] }, updatedBy: "brandon", updatedAt: new Date() });
    const res = await PATCH(pedido("PATCH", { body: { pausado: true } }));
    expect(res.status).toBe(200);
    expect(H.kv.get("avisos-correo:main")?.value).toEqual({ pausado: true, apagados: ["reportes"] });
    const { avisos } = await res.json();
    expect(avisos.activos).toBe(0);
  });

  it("un cambio del superadmin se muestra como «la plataforma» (por: null)", async () => {
    sesion("owner");
    H.kv.set("avisos-correo:main", { value: { pausado: true, apagados: [] }, updatedBy: "brandon", updatedAt: new Date("2026-10-21T10:00:00Z") });
    const { avisos } = await (await GET(pedido("GET"))).json();
    expect(avisos.cambio).toEqual({ en: "2026-10-21T10:00:00.000Z", por: null });
  });
});

describe("enmascararCorreo", () => {
  it("deja la primera letra y el dominio", () => {
    expect(enmascararCorreo("brandon@gmail.com")).toBe("b•••@gmail.com");
    expect(enmascararCorreo("  ")).toBeNull();
    expect(enmascararCorreo(null)).toBeNull();
    expect(enmascararCorreo("sinarroba")).toBe("•••");
  });
});
