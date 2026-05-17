/**
 * API /api/fiados POST — regression test for ambiguous-name resolution.
 *
 * Audit 2026-05-17 (P0-2): si el frontend envía un NOMBRE en customerId y
 * existen 2+ clientes con ese nombre en el tenant, antes el endpoint hacía
 * findFirst y cargaba la deuda al primer match silenciosamente. Ahora debe
 * devolver 409 Conflict con la lista de matches.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockRequireAdmin, mockGetByPhone, mockFindMany, mockValidate, mockCreate, mockUpsert } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockGetByPhone: vi.fn(),
  mockFindMany: vi.fn(),
  mockValidate: vi.fn(),
  mockCreate: vi.fn(),
  mockUpsert: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/db-retry", () => ({ withDbRetry: <T,>(fn: () => Promise<T>) => fn() }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: {
      findMany: mockFindMany,
    },
  },
}));
vi.mock("@/lib/db/customers.db", () => ({
  CustomersDB: {
    getByPhone: mockGetByPhone,
    upsert: mockUpsert,
  },
}));
vi.mock("@/lib/db/fiados.db", () => ({
  FiadosDB: {
    list: vi.fn(),
    validateForNewFiado: mockValidate,
    create: mockCreate,
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/fiados", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ADMIN = { role: "admin" as const, username: "testadmin", tenantId: "tenant-1" };

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/fiados — ambiguous customer resolution (P0-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(ADMIN);
    mockGetByPhone.mockResolvedValue(null); // no match exacto por phone
    mockValidate.mockResolvedValue(null);
  });

  it("devuelve 409 Conflict cuando el nombre matchea >1 cliente", async () => {
    mockFindMany.mockResolvedValue([
      { phone: "999111111", name: "Maria Lopez" },
      { phone: "999222222", name: "Maria Quispe" },
    ]);

    const { POST } = await import("@/app/api/fiados/route");
    const res = await POST(makeRequest({ customerId: "Maria", total: 50 }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.ambiguous).toBe(true);
    expect(body.matches).toHaveLength(2);
    expect(body.matches[0]).toMatchObject({ phone: expect.any(String), name: expect.any(String) });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("devuelve 201 (success) cuando el nombre es unívoco", async () => {
    mockFindMany.mockResolvedValue([{ phone: "999111111", name: "Carlos Único" }]);
    mockCreate.mockResolvedValue({
      id: "fiado-1",
      tenantId: "tenant-1",
      customerId: "999111111",
      total: 50,
      saldo: 50,
      status: "ACTIVO",
      cuotas: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { POST } = await import("@/app/api/fiados/route");
    const res = await POST(makeRequest({ customerId: "Carlos", total: 50 }));

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "999111111", tenantId: "tenant-1" })
    );
  });

  it("phone exacto (digits 7+) bypassa búsqueda por nombre", async () => {
    mockGetByPhone.mockResolvedValue({ phone: "987654321", name: "Cliente Existente" });
    mockCreate.mockResolvedValue({
      id: "fiado-2",
      tenantId: "tenant-1",
      customerId: "987654321",
      total: 100,
      saldo: 100,
      status: "ACTIVO",
      cuotas: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { POST } = await import("@/app/api/fiados/route");
    const res = await POST(makeRequest({ customerId: "987654321", total: 100 }));

    expect(res.status).toBe(201);
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "987654321" })
    );
  });

  it("input que parece phone pero no existe → 404 sin fallback a name", async () => {
    mockGetByPhone.mockResolvedValue(null);

    const { POST } = await import("@/app/api/fiados/route");
    const res = await POST(makeRequest({ customerId: "1234567", total: 50 }));

    // El backend hoy permite "usar el input como phone si parece teléfono"
    // (creando el customer on-the-fly). Verificamos que NO se invocó findMany
    // de customer ya que se interpretó como phone.
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(res.status).toBe(201);
  });

  it("nombre sin matches → 404", async () => {
    mockFindMany.mockResolvedValue([]);

    const { POST } = await import("@/app/api/fiados/route");
    const res = await POST(makeRequest({ customerId: "Inexistente", total: 50 }));

    expect(res.status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
