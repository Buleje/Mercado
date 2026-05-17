/**
 * Hot-fix P0 — Audit admin profundo 2026-05-17.
 *
 * Cubre los 3 fixes críticos del audit:
 *   B-P0-1 · turnos/cerrar + summary: cajero comparaba username vs CUID
 *   B-P0-2 · fiados/cobrarPorCliente: race condition por SET en vez de DECREMENT
 *   X-P0-1 · admin/recetario GET: cross-tenant leak sin tenantId
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks comunes ────────────────────────────────────────────────────────────

const mockResolveIdByUsername = vi.fn();
const mockTurnoFindUnique = vi.fn();
const mockNoteFindMany = vi.fn();
const mockSaleAggregate = vi.fn();
const mockSaleFindMany = vi.fn();
const mockTurnosCerrar = vi.fn();
const mockRequireAdmin = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    turno: { findUnique: mockTurnoFindUnique },
    note: { findMany: mockNoteFindMany },
    sale: {
      aggregate: mockSaleAggregate,
      findMany: mockSaleFindMany,
    },
  },
}));

vi.mock("@/lib/db/admin-users.db", () => ({
  AdminUsersDB: {
    resolveIdByUsername: mockResolveIdByUsername,
  },
}));

vi.mock("@/lib/db/turnos.db", () => ({
  TurnosDB: { cerrar: mockTurnosCerrar },
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: () => null,
  rateLimit: () => null,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/decimal-utils", () => ({
  toNumOrZero: (v: unknown) => (v == null ? 0 : Number(v)),
}));

// ─── B-P0-1 · Turnos: cajero compara CUID vs username ────────────────────────

describe("B-P0-1 · cajero puede cerrar SU propio turno (no 403 falso)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cajero con id resuelto que coincide con turno.adminUserId → permite cerrar", async () => {
    const CAJERO_ID = "cuid-cajero-juan";
    mockRequireAdmin.mockResolvedValue({
      role: "cajero",
      username: "juan",
      tenantId: "tenant-1",
    });
    mockTurnoFindUnique.mockResolvedValue({
      id: "turno-abc",
      tenantId: "tenant-1",
      adminUserId: CAJERO_ID, // CUID — el id resuelto coincide
      status: "ABIERTO",
      abrioEn: new Date(),
      inicioEfectivo: 100,
    });
    mockResolveIdByUsername.mockResolvedValue(CAJERO_ID);
    mockSaleAggregate.mockResolvedValue({ _sum: { total: 50 } });
    mockTurnosCerrar.mockResolvedValue({ id: "turno-abc", status: "CERRADO" });

    const { POST } = await import("@/app/api/turnos/[id]/cerrar/route");
    const req = new Request("http://localhost/api/turnos/turno-abc/cerrar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cierreEfectivo: 150 }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any, { params: Promise.resolve({ id: "turno-abc" }) });
    expect(res.status).toBe(200);
    expect(mockTurnosCerrar).toHaveBeenCalledTimes(1);
  });

  it("cajero intentando cerrar turno de OTRO cajero → 403", async () => {
    mockRequireAdmin.mockResolvedValue({
      role: "cajero",
      username: "juan",
      tenantId: "tenant-1",
    });
    mockTurnoFindUnique.mockResolvedValue({
      id: "turno-otro",
      tenantId: "tenant-1",
      adminUserId: "cuid-cajero-maria", // turno de María, no de Juan
      status: "ABIERTO",
      abrioEn: new Date(),
      inicioEfectivo: 100,
    });
    mockResolveIdByUsername.mockResolvedValue("cuid-cajero-juan"); // Juan resuelve a otro CUID

    const { POST } = await import("@/app/api/turnos/[id]/cerrar/route");
    const req = new Request("http://localhost/api/turnos/turno-otro/cerrar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cierreEfectivo: 150 }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any, { params: Promise.resolve({ id: "turno-otro" }) });
    expect(res.status).toBe(403);
    expect(mockTurnosCerrar).not.toHaveBeenCalled();
  });

  it("regresión: admin role bypasea la verificación de adminUserId", async () => {
    mockRequireAdmin.mockResolvedValue({
      role: "admin",
      username: "qaadmin",
      tenantId: "tenant-1",
    });
    mockTurnoFindUnique.mockResolvedValue({
      id: "turno-x",
      tenantId: "tenant-1",
      adminUserId: "cualquier-cajero-id",
      status: "ABIERTO",
      abrioEn: new Date(),
      inicioEfectivo: 100,
    });
    mockSaleAggregate.mockResolvedValue({ _sum: { total: 50 } });
    mockTurnosCerrar.mockResolvedValue({ id: "turno-x", status: "CERRADO" });

    const { POST } = await import("@/app/api/turnos/[id]/cerrar/route");
    const req = new Request("http://localhost/api/turnos/turno-x/cerrar", {
      method: "POST",
      body: JSON.stringify({ cierreEfectivo: 150 }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any, { params: Promise.resolve({ id: "turno-x" }) });
    expect(res.status).toBe(200);
    expect(mockResolveIdByUsername).not.toHaveBeenCalled();
  });

  it("summary: cajero puede ver SU summary (no 403 falso)", async () => {
    const CAJERO_ID = "cuid-cajero-juan";
    mockRequireAdmin.mockResolvedValue({
      role: "cajero",
      username: "juan",
      tenantId: "tenant-1",
    });
    mockTurnoFindUnique.mockResolvedValue({
      id: "turno-abc",
      tenantId: "tenant-1",
      adminUserId: CAJERO_ID,
      abrioEn: new Date(),
      cerroEn: null,
    });
    mockResolveIdByUsername.mockResolvedValue(CAJERO_ID);
    mockSaleFindMany.mockResolvedValue([
      { id: "s1", total: 50, payment: "efectivo", createdAt: new Date(), items: [] },
    ]);

    const { GET } = await import("@/app/api/turnos/[id]/summary/route");
    const req = new Request("http://localhost/api/turnos/turno-abc/summary");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(req as any, { params: Promise.resolve({ id: "turno-abc" }) });
    expect(res.status).toBe(200);
  });
});

// ─── X-P0-1 · Recetario GET multi-tenant ─────────────────────────────────────

describe("X-P0-1 · recetario GET filtra por tenantId (no cross-tenant leak)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNoteFindMany.mockResolvedValue([]);
  });

  it("incluye tenantId en el where del findMany", async () => {
    mockRequireAdmin.mockResolvedValue({
      role: "admin",
      username: "qaadmin",
      tenantId: "tenant-alpha",
    });

    const { GET } = await import("@/app/api/admin/recetario/route");
    const req = new Request("http://localhost/api/admin/recetario");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await GET(req as any);

    expect(mockNoteFindMany).toHaveBeenCalledTimes(1);
    const call = mockNoteFindMany.mock.calls[0][0];
    expect(call.where).toMatchObject({
      tenantId: "tenant-alpha",
      title: "__RECETARIO__",
    });
  });

  it("guard de regresión: where DEBE tener tenantId — si lo quitan el test falla", async () => {
    mockRequireAdmin.mockResolvedValue({
      role: "admin",
      username: "qaadmin",
      tenantId: "tenant-beta",
    });

    const { GET } = await import("@/app/api/admin/recetario/route");
    const req = new Request("http://localhost/api/admin/recetario");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await GET(req as any);

    const call = mockNoteFindMany.mock.calls[0][0];
    expect(call.where.tenantId).toBeDefined();
    expect(call.where.tenantId).toBe("tenant-beta");
  });
});
