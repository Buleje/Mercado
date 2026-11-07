// @vitest-environment node
/**
 * GET/PUT /api/admin/semaforo (ADR-508): sin sesión 401, roles de RUTAS_PANEL,
 * el negocio sale SIEMPRE de la sesión (un `x-tenant-id` ajeno no cambia nada)
 * y la config se valida con safeParse antes de escribir.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  sesion: null as null | { tenantId: string; role: string; username: string },
  roles: [] as unknown[],
  llamadas: [] as Array<[string, ...unknown[]]>,
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: async () => undefined }));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: async (_req: unknown, roles?: unknown) => {
    H.roles.push(roles);
    return H.sesion ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  },
}));
vi.mock("@/lib/db/semaforo.db", () => ({
  SemaforoDB: {
    olvidar: (t: string) => H.llamadas.push(["olvidar", t]),
    configGuardada: async (t: string) => (H.llamadas.push(["configGuardada", t]), { lanzamiento: "2026-11-09" }),
    semaforo: async (t: string, desde: string, hasta: string) => (H.llamadas.push(["semaforo", t, desde, hasta]), { indicadores: [] }),
    guardarConfig: async (t: string, c: unknown) => (H.llamadas.push(["guardarConfig", t, c]), c),
  },
}));

import { GET, PUT } from "@/app/api/admin/semaforo/route";
import { RUTAS_PANEL, puedePedir } from "@/lib/auth/roles-rutas-panel";

const req = (url: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }) =>
  new NextRequest(`http://localhost${url}`, {
    method: init?.method ?? "GET",
    headers: init?.headers,
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });

beforeEach(() => {
  H.sesion = null;
  H.roles.length = 0;
  H.llamadas.length = 0;
});

describe("/api/admin/semaforo", () => {
  it("sin sesión → 401 en GET y PUT, sin tocar la base", async () => {
    expect((await GET(req("/api/admin/semaforo"))).status).toBe(401);
    expect((await PUT(req("/api/admin/semaforo", { method: "PUT", body: {} }))).status).toBe(401);
    expect(H.llamadas).toEqual([]);
  });

  it("pide los roles de RUTAS_PANEL: cajero, almacenero y analista fuera", () => {
    const roles = RUTAS_PANEL["/api/admin/semaforo"];
    expect([...roles].sort()).toEqual(["admin", "manager", "owner", "tienda_owner"]);
    expect(puedePedir("/api/admin/semaforo", "cajero")).toBe(false);
    expect(puedePedir("/api/admin/semaforo", "almacenero")).toBe(false);
    expect(puedePedir("/api/admin/semaforo", "analista")).toBe(false);
    expect(puedePedir("/api/admin/semaforo", "tienda_owner")).toBe(true);
  });

  it("el negocio es el de la sesión aunque el header traiga otro", async () => {
    H.sesion = { tenantId: "tenant-a", role: "admin", username: "qa" };
    const res = await GET(req("/api/admin/semaforo?periodo=mes&fresco=1", { headers: { "x-tenant-id": "tenant-b" } }));
    expect(res.status).toBe(200);
    expect(H.roles[0]).toEqual([...RUTAS_PANEL["/api/admin/semaforo"]]);
    const tenants = new Set(H.llamadas.map((l) => l[1]));
    expect([...tenants]).toEqual(["tenant-a"]);
    const sem = H.llamadas.find((l) => l[0] === "semaforo");
    expect(sem?.[2]).toBeTypeOf("string");
    expect(H.llamadas[0]).toEqual(["olvidar", "tenant-a"]);
  });

  it("PUT con una fecha inválida → 400 sin escribir; válido → guarda en el negocio de la sesión", async () => {
    H.sesion = { tenantId: "tenant-a", role: "owner", username: "dueno" };
    const malo = await PUT(req("/api/admin/semaforo", { method: "PUT", body: { lanzamiento: "9 de noviembre" } }));
    expect(malo.status).toBe(400);
    expect(H.llamadas.some((l) => l[0] === "guardarConfig")).toBe(false);

    const ok = await PUT(
      req("/api/admin/semaforo", { method: "PUT", body: { indicadores: { ticket_promedio: { verde: 100, amarillo: 80 } } } }),
    );
    expect(ok.status).toBe(200);
    expect(H.llamadas.find((l) => l[0] === "guardarConfig")).toEqual([
      "guardarConfig",
      "tenant-a",
      { indicadores: { ticket_promedio: { verde: 100, amarillo: 80 } } },
    ]);
  });
});
