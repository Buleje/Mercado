/**
 * GET /api/admin/forestal/trozas/patio con `?contratoId=` (ADR-431): «Solo este
 * permiso» también acota el patio, y el filtro lo hace el SERVIDOR.
 *
 * Lo que se fija acá es el contrato de la ruta (la DB class va simulada; lo que
 * filtra el `where` se prueba en `forestal-wood-entries-patio-where.test.ts`):
 *  · sin parámetro → las dos lecturas sin contrato, como siempre;
 *  · con un id válido → las dos lecturas lo reciben, con el tenant del JWT;
 *  · malformado → 400 ANTES de tocar la base (nunca «todo el patio» en silencio);
 *  · vacío → sin filtro; `loteId` y `contratoId` viajan juntos.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  spec: vi.fn(async () => true),
  trozas: vi.fn<(tenantId: string, opts: unknown) => Promise<unknown[]>>(async () => []),
  contar: vi.fn<(tenantId: string, opts: unknown) => Promise<number>>(async () => 0),
  varadas: vi.fn<(tenantId: string, dias: number) => Promise<{ piezas: number; m3: number }>>(async () => ({
    piezas: 0,
    m3: 0,
  })),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: vi.fn(() => null) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: H.spec }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/db/wood-entries.db", () => ({
  WoodEntriesDB: {
    trozasComoConsumibles: H.trozas,
    contarTrozasDelPatio: H.contar,
    contarTrozasVaradas: H.varadas,
  },
}));

import { GET } from "@/app/api/admin/forestal/trozas/patio/route";

const TENANT_JWT = "tenant-blas";

function sesion(tenantId = TENANT_JWT) {
  H.requireAdmin.mockImplementation(async (_req: NextRequest, roles: readonly string[]) =>
    roles.includes("admin") ? { tenantId, username: "qa-admin", role: "admin" } : NextResponse.json({}, { status: 403 }),
  );
}

const get = (qs = "", headers: Record<string, string> = {}) =>
  GET(new NextRequest(`https://host/api/admin/forestal/trozas/patio${qs}`, { headers }));

beforeEach(() => {
  vi.clearAllMocks();
  sesion();
  H.spec.mockResolvedValue(true);
  H.trozas.mockResolvedValue([]);
  H.contar.mockResolvedValue(0);
});

describe("GET /trozas/patio — «Solo este permiso» por ?contratoId=", () => {
  it("sin contratoId, las dos lecturas van sin contrato y la respuesta lo dice", async () => {
    H.trozas.mockResolvedValue([{ id: "t1" }, { id: "t2" }]);
    H.contar.mockResolvedValue(2);
    const res = await get();
    expect(res.status).toBe(200);
    expect(H.trozas).toHaveBeenCalledWith(TENANT_JWT, { loteId: undefined, contratoId: undefined });
    expect(H.contar).toHaveBeenCalledWith(TENANT_JWT, { loteId: undefined, contratoId: undefined });
    const j = await res.json();
    expect(j).toMatchObject({ total: 2, devueltas: 2, truncado: false, contratoId: null });
  });

  it("con un contratoId válido, las DOS lecturas lo reciben (lista y conteo no pueden discrepar)", async () => {
    H.trozas.mockResolvedValue([{ id: "t1" }]);
    H.contar.mockResolvedValue(1);
    const res = await get("?contratoId=ok_1");
    expect(res.status).toBe(200);
    expect(H.trozas).toHaveBeenCalledWith(TENANT_JWT, { loteId: undefined, contratoId: "ok_1" });
    expect(H.contar).toHaveBeenCalledWith(TENANT_JWT, { loteId: undefined, contratoId: "ok_1" });
    expect((await res.json()).contratoId).toBe("ok_1");
  });

  it.each([
    ["comilla y punto y coma", "?contratoId=%27%3B"],
    ["barra", "?contratoId=a/b"],
    ["65 caracteres", `?contratoId=${"a".repeat(65)}`],
    ["espacio en el medio", "?contratoId=a%20b"],
  ])("malformado (%s) → 400 invalid_contratoId y la base NO se toca", async (_caso, qs) => {
    const res = await get(qs);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_contratoId" });
    expect(H.trozas).not.toHaveBeenCalled();
    expect(H.contar).not.toHaveBeenCalled();
  });

  it("malformado también con loteId: el lote no rescata un filtro roto", async () => {
    const res = await get("?loteId=LA-1&contratoId=%27%3B");
    expect(res.status).toBe(400);
    expect(H.trozas).not.toHaveBeenCalled();
  });

  it("contratoId vacío = sin filtro (no es un error)", async () => {
    const res = await get("?contratoId=");
    expect(res.status).toBe(200);
    expect(H.trozas).toHaveBeenCalledWith(TENANT_JWT, { loteId: undefined, contratoId: undefined });
    expect((await res.json()).contratoId).toBeNull();
  });

  it("el tenant sale del JWT: un x-tenant-id ajeno en el header no cambia el 1er argumento", async () => {
    await get("?contratoId=ok_1", { "x-tenant-id": "tenant-ajeno" });
    expect(H.trozas.mock.calls[0][0]).toBe(TENANT_JWT);
    expect(H.contar.mock.calls[0][0]).toBe(TENANT_JWT);
  });

  it("loteId y contratoId llegan juntos (AND)", async () => {
    await get("?loteId=LA-7&contratoId=ctr_1");
    expect(H.trozas).toHaveBeenCalledWith(TENANT_JWT, { loteId: "LA-7", contratoId: "ctr_1" });
    expect(H.contar).toHaveBeenCalledWith(TENANT_JWT, { loteId: "LA-7", contratoId: "ctr_1" });
  });

  it("?varadas sigue siendo sólo el conteo y no lee el patio", async () => {
    const res = await get("?varadas=60");
    expect(res.status).toBe(200);
    expect(H.varadas).toHaveBeenCalledWith(TENANT_JWT, 60);
    expect(H.trozas).not.toHaveBeenCalled();
  });

  it("sin la especialización → 403 y sin lecturas", async () => {
    H.spec.mockResolvedValue(false);
    const res = await get("?contratoId=ok_1");
    expect(res.status).toBe(403);
    expect(H.trozas).not.toHaveBeenCalled();
  });

  it("sin sesión → 401 (nunca 404: un 404 saca del panel)", async () => {
    H.requireAdmin.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const res = await get("?contratoId=ok_1");
    expect(res.status).toBe(401);
    expect(H.trozas).not.toHaveBeenCalled();
  });
});
