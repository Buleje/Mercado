/**
 * GET /api/cron/notifications — recorre los negocios activos (INTEG-01, 09-10).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/cron-retry", () => ({ withCronRetry: (_n: string, fn: () => unknown) => fn() }));
vi.mock("@/lib/db/tenants.db", () => ({ TenantsDB: { listActive: vi.fn() } }));
vi.mock("@/lib/notification-generators", () => ({ generateNotifications: vi.fn() }));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/notifications/route";
import { TenantsDB } from "@/lib/db/tenants.db";
import { generateNotifications } from "@/lib/notification-generators";

const req = (qs = "", auth = "Bearer test-secret") =>
  new NextRequest(`http://localhost/api/cron/notifications${qs}`, { headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  vi.mocked(TenantsDB.listActive).mockResolvedValue([
    { id: "main", slug: "main", name: "Bodega San Martín" },
    { id: "cmpxiv6p4000bohvzwl6bnfpv", slug: "inversiones-agroforestales-blas-sociedad-anonima", name: "Blas" },
  ]);
  vi.mocked(generateNotifications).mockResolvedValue({ nuevos: 2, porTipo: { FIADO_VENCIDO: 2 }, fallos: [] });
});

describe("GET /api/cron/notifications", () => {
  it("sin el secreto → 401 y no recorre nada", async () => {
    const res = await GET(req("", ""));
    expect(res.status).toBe(401);
    expect(generateNotifications).not.toHaveBeenCalled();
  });

  it("recorre CADA negocio activo con su propio id (no «main» fijo)", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(vi.mocked(generateNotifications).mock.calls.map((c) => c[0])).toEqual(["main", "cmpxiv6p4000bohvzwl6bnfpv"]);
    expect(json).toMatchObject({ ok: true, negocios: 2, nuevos: 4 });
  });

  it("?tenant=main corre sólo ese negocio (el otro no se toca)", async () => {
    const res = await GET(req("?tenant=main"));
    const json = await res.json();
    expect(generateNotifications).toHaveBeenCalledTimes(1);
    expect(generateNotifications).toHaveBeenCalledWith("main", { nombreNegocio: "Bodega San Martín" });
    expect(json.porNegocio.map((p: { tenant: string }) => p.tenant)).toEqual(["main"]);
  });

  it("?tenant de un negocio ajeno o inactivo → 404 sin escribir", async () => {
    const res = await GET(req("?tenant=otro-negocio"));
    expect(res.status).toBe(404);
    expect(generateNotifications).not.toHaveBeenCalled();
  });

  it("si un negocio falla, los demás siguen", async () => {
    vi.mocked(generateNotifications).mockRejectedValueOnce(new Error("boom"));
    const json = await (await GET(req())).json();
    expect(json.porNegocio[0]).toMatchObject({ tenant: "main", fallos: ["todo"] });
    expect(json.porNegocio[1]).toMatchObject({ nuevos: 2 });
    expect(json.nuevos).toBe(2);
  });
});
