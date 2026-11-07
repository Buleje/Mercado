// @vitest-environment node
/**
 * /api/settings/margenes-rebajas: el negocio sale SOLO de la sesión. Sin sesión
 * 401; un `tenantId` ajeno en el cuerpo no cambia dónde se escribe; piso mayor
 * que el margen mínimo o fuera de 0-90 % → 400; un rol que no aplica precios en
 * bloque → 403.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  flags: {} as Record<string, unknown>,
  pisar: vi.fn(async (_t: string, _c: Record<string, unknown>) => undefined),
  log: vi.fn(async () => undefined),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: H.log }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/db/settings.db", () => ({
  SettingsDB: { getFeatureFlags: vi.fn(async () => H.flags), pisarClavesFlags: H.pisar },
}));

import { GET, PUT } from "@/app/api/settings/margenes-rebajas/route";

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/settings/margenes-rebajas", {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
  });

beforeEach(() => {
  vi.clearAllMocks();
  H.flags = {};
  H.requireAdmin.mockResolvedValue({ tenantId: "tenant-main", role: "admin", username: "qaadmin" });
});

describe("margen mínimo en rebajas — ruta de Ajustes", () => {
  it("sin sesión: 401 en GET y PUT, y no escribe", async () => {
    H.requireAdmin.mockResolvedValue(NextResponse.json({ error: "No autorizado" }, { status: 401 }));
    expect((await GET(req("GET"))).status).toBe(401);
    expect((await PUT(req("PUT", { pisoSobreCosto: 10, margenMinimoSugerido: 10 }))).status).toBe(401);
    expect(H.pisar).not.toHaveBeenCalled();
  });

  it("GET sin nada guardado = los de fábrica (5 % y 15 %)", async () => {
    const r = await (await GET(req("GET"))).json();
    expect(r).toMatchObject({ pisoSobreCosto: 5, margenMinimoSugerido: 15 });
  });

  it("PUT escribe en el negocio de la sesión aunque el cuerpo traiga otro tenantId", async () => {
    const res = await PUT(req("PUT", { pisoSobreCosto: 10, margenMinimoSugerido: 10, tenantId: "tenant-ajeno" }));
    expect(res.status).toBe(200);
    expect(H.pisar).toHaveBeenCalledWith("tenant-main", { margenesRebajas: { pisoSobreCosto: 10, margenMinimoSugerido: 10 } });
  });

  it("piso mayor que el margen mínimo, negativo o sobre 90 % → 400 sin escribir", async () => {
    for (const b of [
      { pisoSobreCosto: 20, margenMinimoSugerido: 15 },
      { pisoSobreCosto: -1, margenMinimoSugerido: 15 },
      { pisoSobreCosto: 5, margenMinimoSugerido: 91 },
      { pisoSobreCosto: "5", margenMinimoSugerido: 15 },
    ]) {
      expect((await PUT(req("PUT", b))).status).toBe(400);
    }
    expect(H.pisar).not.toHaveBeenCalled();
  });

  it("PUT pisa sólo su clave: una vecina guardada antes (webhooks) queda intacta", async () => {
    H.flags = { webhooks: { url: "https://x.test/hook", activo: true }, margenesRebajas: { pisoSobreCosto: 5, margenMinimoSugerido: 15 } };
    // Como el `||` de jsonb de pisarClavesFlags: une por clave de primer nivel.
    H.pisar.mockImplementation(async (_t: string, cambios: Record<string, unknown>) => {
      H.flags = { ...H.flags, ...cambios };
    });
    expect((await PUT(req("PUT", { pisoSobreCosto: 8, margenMinimoSugerido: 12 }))).status).toBe(200);
    expect(Object.keys(H.pisar.mock.calls[0][1] as Record<string, unknown>)).toEqual(["margenesRebajas"]);
    expect(H.flags.webhooks).toEqual({ url: "https://x.test/hook", activo: true });
    expect(H.flags.margenesRebajas).toEqual({ pisoSobreCosto: 8, margenMinimoSugerido: 12 });
  });

  it("un rol que no aplica precios en bloque → 403 (dueño y encargado sí)", async () => {
    H.requireAdmin.mockResolvedValue({ tenantId: "tenant-main", role: "cajero", username: "c" });
    expect((await PUT(req("PUT", { pisoSobreCosto: 5, margenMinimoSugerido: 15 }))).status).toBe(403);
    for (const role of ["owner", "manager"]) {
      H.requireAdmin.mockResolvedValue({ tenantId: "tenant-main", role, username: "x" });
      expect((await PUT(req("PUT", { pisoSobreCosto: 5, margenMinimoSugerido: 15 }))).status).toBe(200);
    }
  });
});
