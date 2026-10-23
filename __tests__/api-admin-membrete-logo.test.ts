/**
 * __tests__/api-admin-membrete-logo.test.ts — ADR-514 (23-10).
 *
 * GET /api/admin/membrete y /api/admin/membrete/logo: sin sesión 401, el
 * negocio sale SÓLO del JWT (un `?tenantId=` de otro se ignora), el logo va en
 * PNG con ETag y caché privada, 304 con el mismo ETag, 404 sin logo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { sesion, roles, membreteDB, logger } = vi.hoisted(() => ({
  sesion: { valor: { tenantId: "t-negocio-a", role: "cajero" } as { tenantId: string; role: string } | null },
  roles: { pedidos: [] as unknown[] },
  membreteDB: {
    del: vi.fn(async (_t: string): Promise<Record<string, unknown>> => ({})),
    logoPng: vi.fn(async (_t: string): Promise<{ bytes: Buffer; ancho: number; alto: number; etag: string } | null> => null),
  },
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: async (_req: unknown, allowed?: unknown) => {
    roles.pedidos.push(allowed);
    return sesion.valor ?? NextResponse.json({ error: "unauthorized" }, { status: 401 });
  },
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/db/membrete.db", () => ({ MembreteDB: membreteDB }));

import { GET as getLogo } from "@/app/api/admin/membrete/logo/route";
import { GET as getMembrete } from "@/app/api/admin/membrete/route";
import { ROLES_MEMBRETE } from "@/lib/admin/membrete";

const PNG = { bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]), ancho: 600, alto: 150, etag: '"abc123"' };
const pedir = (ruta: string, headers: Record<string, string> = {}) => new NextRequest(`http://localhost:3000${ruta}`, { headers });

beforeEach(() => {
  vi.clearAllMocks();
  roles.pedidos = [];
  sesion.valor = { tenantId: "t-negocio-a", role: "cajero" };
});

describe("GET /api/admin/membrete/logo", () => {
  it("sin sesión: 401 y no lee nada", async () => {
    sesion.valor = null;
    const res = await getLogo(pedir("/api/admin/membrete/logo"));
    expect(res.status).toBe(401);
    expect(membreteDB.logoPng).not.toHaveBeenCalled();
  });

  it("el negocio sale del JWT: un ?tenantId= de otro negocio se ignora", async () => {
    membreteDB.logoPng.mockResolvedValue(PNG);
    const res = await getLogo(pedir("/api/admin/membrete/logo?v=1&tenantId=t-negocio-b"));
    expect(res.status).toBe(200);
    expect(membreteDB.logoPng).toHaveBeenCalledWith("t-negocio-a");
    expect(membreteDB.logoPng).not.toHaveBeenCalledWith("t-negocio-b");
  });

  it("devuelve el PNG con caché privada y ETag; con el mismo ETag, 304 sin cuerpo", async () => {
    membreteDB.logoPng.mockResolvedValue(PNG);
    const res = await getLogo(pedir("/api/admin/membrete/logo"));
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toMatch(/^private/);
    expect(res.headers.get("etag")).toBe('"abc123"');
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG.bytes)).toBe(true);

    const otra = await getLogo(pedir("/api/admin/membrete/logo", { "if-none-match": '"abc123"' }));
    expect(otra.status).toBe(304);
    expect((await otra.arrayBuffer()).byteLength).toBe(0);
  });

  it("sin logo: 404 (el papel sale sin logo); si la base falla: 503", async () => {
    membreteDB.logoPng.mockResolvedValue(null);
    expect((await getLogo(pedir("/api/admin/membrete/logo"))).status).toBe(404);
    membreteDB.logoPng.mockRejectedValue(new Error("db caída"));
    expect((await getLogo(pedir("/api/admin/membrete/logo"))).status).toBe(503);
  });

  it("pide roles explícitos (los mismos que el membrete)", async () => {
    await getLogo(pedir("/api/admin/membrete/logo"));
    await getMembrete(pedir("/api/admin/membrete"));
    expect(roles.pedidos).toEqual([ROLES_MEMBRETE, ROLES_MEMBRETE]);
    expect(ROLES_MEMBRETE).toEqual(expect.arrayContaining(["admin", "cajero", "almacenero"]));
  });
});

describe("GET /api/admin/membrete", () => {
  it("sin sesión 401; con sesión, el membrete del negocio del JWT con logoPngUrl", async () => {
    sesion.valor = null;
    expect((await getMembrete(pedir("/api/admin/membrete"))).status).toBe(401);

    sesion.valor = { tenantId: "t-negocio-a", role: "admin" };
    membreteDB.del.mockResolvedValue({ nombre: "Aserradero Blas", logoPngUrl: "/api/admin/membrete/logo?v=x" });
    const res = await getMembrete(pedir("/api/admin/membrete?tenantId=t-negocio-b"));
    expect(membreteDB.del).toHaveBeenCalledWith("t-negocio-a");
    expect(await res.json()).toMatchObject({ nombre: "Aserradero Blas", logoPngUrl: "/api/admin/membrete/logo?v=x" });
  });
});
