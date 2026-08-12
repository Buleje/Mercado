/**
 * API /api/supplier-returns — aislamiento multi-tenant.
 *
 * Regresión del reporte QA Compras 2026-08-12. El route tenía
 * `const TENANT = "main"` y GET/POST lo usaban en lugar del tenant de la
 * sesión, con dos consecuencias medidas en la DB:
 *
 *   1. La devolución creada desde el tenant forestal quedó guardada con
 *      `tenantId: "main"` — datos de una empresa dentro de otra.
 *   2. `PATCH /api/supplier-returns/[id]` sí filtra por `auth.tenantId`, así que
 *      no encontraba esa fila y devolvía 404: el botón "Marcar enviada" no hacía
 *      nada y el cliente se lo tragaba en silencio.
 *
 * Estos tests fallan si alguien vuelve a colgar el tenant de una constante.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));

const { mockRequireAdmin } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn() }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

// El gate de plan consulta la DB; acá se mockea para aislar el aislamiento
// multi-tenant. `null` = tenant habilitado para escribir.
const { mockPlan } = vi.hoisted(() => ({ mockPlan: vi.fn() }));
vi.mock("@/lib/billing/require-active-subscription", () => ({
  requireActiveSubscription: mockPlan,
}));

const { mockList, mockCreate } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockCreate: vi.fn(),
}));
vi.mock("@/lib/db/supplier-returns.db", () => ({
  SupplierReturnsDB: { listWithItems: mockList, createWithItems: mockCreate },
}));

import { GET, POST } from "@/app/api/supplier-returns/route";

/** tenantId real del tenant forestal — un CUID, NO el slug "main". */
const TENANT_FORESTAL = "cmpxiv6p4000bohvzwl6bnfpv";
const AUTH = { tenantId: TENANT_FORESTAL, role: "admin", username: "qaadmin" };

const BODY_VALIDO = {
  proveedorNombre: "Proveedor QA Test",
  motivo: "Producto vencido",
  items: [{ nombre: "Aserrado de madera", cantidad: 1, unidad: "und" }],
};

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/supplier-returns", {
    method,
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(AUTH);
  mockPlan.mockResolvedValue(null);
  mockList.mockResolvedValue([]);
  mockCreate.mockImplementation((tenantId: string) => ({ id: "r1", tenantId, items: [] }));
});

describe("GET /api/supplier-returns", () => {
  it("lista con el tenant de la sesión, no con 'main'", async () => {
    await GET(req("GET"));
    expect(mockList).toHaveBeenCalledWith(TENANT_FORESTAL);
    expect(mockList).not.toHaveBeenCalledWith("main");
  });

  it("no consulta nada si la sesión no está autorizada", async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    );
    const res = await GET(req("GET"));
    expect(res.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe("POST /api/supplier-returns", () => {
  it("guarda la devolución bajo el tenant de la sesión", async () => {
    const res = await POST(req("POST", BODY_VALIDO));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(TENANT_FORESTAL, expect.objectContaining({
      proveedorNombre: "Proveedor QA Test",
    }));
    await expect(res.json()).resolves.toMatchObject({ tenantId: TENANT_FORESTAL });
  });

  it("rechaza un cuerpo inválido sin escribir", async () => {
    const res = await POST(req("POST", { proveedorNombre: "", motivo: "", items: [] }));
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // Reporte QA Compras: crear una OC daba 402 por plan vencido pero registrar
  // una devolución pasaba igual. Las escrituras del módulo se bloquean parejo.
  it("respeta el bloqueo por plan, igual que crear una orden de compra", async () => {
    mockPlan.mockResolvedValue(
      NextResponse.json({ error: "Trial expirado" }, { status: 402 }),
    );
    const res = await POST(req("POST", BODY_VALIDO));
    expect(res.status).toBe(402);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
