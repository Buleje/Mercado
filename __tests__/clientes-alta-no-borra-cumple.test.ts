/**
 * POST /api/customers es un upsert por teléfono y el formulario de la ficha
 * manda `fechaNacimiento: null` cuando el campo queda vacío. «Nuevo cliente»
 * desde POS o Fiados con un teléfono que ya existe NO puede borrar el
 * cumpleaños que el cliente dio en la tienda (revisión 09-10).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: vi.fn(),
  invalidate: vi.fn(),
  getOrSet: vi.fn(async (_k: string, _t: number, fn: () => Promise<unknown>) => fn()),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null), getClientIp: vi.fn(() => "127.0.0.1") }));
vi.mock("@/lib/billing/require-active-subscription", () => ({ requireActiveSubscription: vi.fn(async () => null) }));
vi.mock("@/lib/create-notification", () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock("@/lib/admin-cache", () => ({ invalidateAdminCache: { afterCustomer: vi.fn() } }));

const { mockRequireAdmin, mockUpsert, mockUpdate } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockUpsert: vi.fn(),
  mockUpdate: vi.fn(async () => ({})),
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/jsondb", () => ({
  CustomersDB: { upsert: mockUpsert, getAll: vi.fn(), getAllConDeuda: vi.fn() },
  normalizePhone: (p: string) => p,
}));
vi.mock("@/lib/prisma", () => ({ prisma: { activityLog: { create: vi.fn(async () => ({})) } } }));
vi.mock("@/lib/tenant", () => ({
  prismaForTenant: () => ({
    customer: { update: mockUpdate },
    activityLog: { create: vi.fn(async () => ({})) },
  }),
}));

import { POST } from "@/app/api/customers/route";

function alta(body: Record<string, unknown>): NextRequest {
  return new NextRequest("https://host/api/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "987654321", name: "María García", ...body }),
  });
}

/** Lo que el POST le escribió a la ficha (o undefined si no tocó nada). */
function fichaEscrita(): Record<string, unknown> | undefined {
  const llamada = mockUpdate.mock.calls[0] as unknown as [{ data: Record<string, unknown> }] | undefined;
  return llamada?.[0].data;
}

describe("alta de cliente con un teléfono que ya existe", () => {
  beforeEach(() => {
    mockUpdate.mockClear();
    mockRequireAdmin.mockResolvedValue({ tenantId: "main", role: "cajero", username: "caja1" });
    mockUpsert.mockResolvedValue({ phone: "987654321", name: "María García" });
  });

  it("fechaNacimiento vacía (null) no toca birthday ni fechaNacimiento", async () => {
    const res = await POST(alta({ fechaNacimiento: null, genero: "F" }));
    expect(res.status).toBe(200);
    const data = fichaEscrita();
    expect(data).toBeDefined();
    expect(data).not.toHaveProperty("birthday");
    expect(data).not.toHaveProperty("fechaNacimiento");
    expect(data).toMatchObject({ genero: "F" });
  });

  it("fechaNacimiento con texto vacío tampoco borra", async () => {
    await POST(alta({ fechaNacimiento: "", genero: "F" }));
    expect(fichaEscrita()).not.toHaveProperty("birthday");
  });

  it("con fecha, escribe las dos columnas (un solo cumpleaños)", async () => {
    await POST(alta({ fechaNacimiento: "1990-05-12" }));
    const data = fichaEscrita();
    expect((data?.birthday as Date).toISOString()).toBe("1990-05-12T12:00:00.000Z");
    expect(data?.fechaNacimiento).toEqual(data?.birthday);
  });
});
