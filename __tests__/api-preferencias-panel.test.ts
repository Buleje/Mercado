/**
 * `/api/admin/preferences/panel` (noche 17-10): los recientes y las vistas
 * guardadas de cada persona, en el servidor. Lo que se prueba es de quién es
 * cada cosa: el negocio y la persona salen de la sesión (nunca del cuerpo),
 * otro usuario del mismo negocio no ve lo mío, ni yo lo mío en otro negocio,
 * y sin sesión es 401. `AdminPreferencesDB` es un falso en memoria que mezcla
 * por subclave como el real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  auth: null as { tenantId: string; username: string; role: string } | null,
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => {
    const { NextResponse } = await import("next/server");
    return H.auth ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }),
}));
vi.mock("@/lib/db/admin-preferences.db", () => ({
  AdminPreferencesDB: {
    read: vi.fn(async (tenantId: string) => ({ ...(H.store.get(tenantId) ?? {}) })),
    write: vi.fn(async (tenantId: string, patch: Record<string, unknown>) => {
      H.store.set(tenantId, { ...(H.store.get(tenantId) ?? {}), ...patch });
    }),
  },
}));

import { GET, PUT } from "@/app/api/admin/preferences/panel/route";

const URL = "http://localhost/api/admin/preferences/panel";
const como = (username: string, tenantId = "t1") => {
  H.auth = { tenantId, username, role: "admin" };
};
const leer = async () => {
  const res = await GET(new NextRequest(URL));
  return { status: res.status, body: (await res.json()) as { guardado?: Record<string, unknown[]> } };
};
const guardar = (body: unknown) =>
  PUT(new NextRequest(URL, { method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));

const vista = (nombre: string, estado: unknown = { q: nombre }) => ({ id: `v-${nombre}`, nombre, estado, en: 1 });
const reciente = (tab: string) => ({ href: `/admin?tab=${tab}`, titulo: tab, camino: "", tipo: null, en: 2 });

beforeEach(() => {
  H.store.clear();
  H.auth = null;
});

describe("de quién es lo guardado", () => {
  it("sin sesión: 401 al leer y al guardar, y no se escribe nada", async () => {
    expect((await leer()).status).toBe(401);
    expect((await guardar({ clave: "recientes", valor: [reciente("crm")] })).status).toBe(401);
    expect(H.store.size).toBe(0);
  });

  it("lo mío lo veo yo; otro usuario del mismo negocio no, ni yo en otro negocio", async () => {
    como("ana");
    expect((await guardar({ clave: "vistas:crm-clientes", valor: [vista("Con deuda")] })).status).toBe(200);
    expect((await guardar({ clave: "recientes", valor: [reciente("pos")] })).status).toBe(200);
    const mio = await leer();
    expect(mio.body.guardado?.["vistas:crm-clientes"]).toEqual([vista("Con deuda")]);
    expect(mio.body.guardado?.recientes).toEqual([reciente("pos")]);

    como("beto");
    expect((await leer()).body.guardado).toEqual({});
    como("ana", "t2");
    expect((await leer()).body.guardado).toEqual({});
  });

  it("un usuario que empieza igual que otro (`ana:vistas`) no ve lo de `ana` ni al revés", async () => {
    como("ana:vistas");
    await guardar({ clave: "recientes", valor: [reciente("crm")] });
    como("ana");
    expect((await leer()).body.guardado).toEqual({});
  });

  it("el cuerpo no elige de quién es: se guarda a nombre de la sesión", async () => {
    como("ana");
    await guardar({ clave: "recientes", valor: [reciente("crm")], usuario: "beto", tenantId: "t2" });
    como("beto");
    expect((await leer()).body.guardado).toEqual({});
    como("ana", "t2");
    expect((await leer()).body.guardado).toEqual({});
    como("ana");
    expect((await leer()).body.guardado?.recientes).toHaveLength(1);
  });

  it("guardar una pantalla no borra otra (subclaves aparte)", async () => {
    como("ana");
    await guardar({ clave: "vistas:crm-clientes", valor: [vista("A")] });
    await guardar({ clave: "vistas:pedidos-lista", valor: [vista("B")] });
    expect(Object.keys((await leer()).body.guardado ?? {}).sort()).toEqual(["vistas:crm-clientes", "vistas:pedidos-lista"]);
  });
});

describe("qué se acepta", () => {
  beforeEach(() => como("ana"));

  it.each([
    ["clave que no es del panel", { clave: "driveFijados", valor: [] }],
    ["pantalla con caracteres raros", { clave: "vistas:../x", valor: [] }],
    ["un reciente que no es del panel", { clave: "recientes", valor: [{ ...reciente("x"), href: "https://otro.com" }] }],
    ["más de 15 recientes", { clave: "recientes", valor: Array.from({ length: 16 }, (_, i) => reciente(`t${i}`)) }],
    ["más de 20 vistas", { clave: "vistas:crm-clientes", valor: Array.from({ length: 21 }, (_, i) => vista(`v${i}`)) }],
    ["vista sin nombre", { clave: "vistas:crm-clientes", valor: [vista("   ")] }],
    ["demasiado grande", { clave: "vistas:crm-clientes", valor: [vista("Gorda", { q: "x".repeat(33_000) })] }],
  ])("400: %s", async (_caso, body) => {
    expect((await guardar(body)).status).toBe(400);
    expect(H.store.size).toBe(0);
  });

  it("una lista vacía sí vale (borraste todo)", async () => {
    expect((await guardar({ clave: "recientes", valor: [] })).status).toBe(200);
    expect((await leer()).body.guardado?.recientes).toEqual([]);
  });
});
