/**
 * Quién escribe pedidos (security 17-10). Con el `requireAdmin` REAL (sólo la
 * sesión es de mentira) se prueba la lista de roles de cada ruta contra
 * `lib/auth/role-permissions.ts`:
 *
 * - PATCH /api/orders/[id] y POST /api/orders/bulk-status: `orders: write`
 *   → cajero y tienda_owner (+ admin/dueño/encargado). Almacenero, analista
 *   y repartidor sólo leen: 403. Antes cualquier rol del panel cancelaba
 *   (devolvía stock), tocaba la deuda o borraba.
 * - DELETE /api/orders/[id]: `orders: delete` → sólo admin/dueño/encargado.
 * - GET /api/orders/historial: notas internas del equipo; repartidor y
 *   proveedor fuera.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const { mockSesion, mockGetById, mockLote, mockDeVarios, mockLogActivity } = vi.hoisted(() => ({
  mockSesion: vi.fn(),
  mockGetById: vi.fn(),
  mockLote: vi.fn(),
  mockDeVarios: vi.fn(),
  mockLogActivity: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  SESSION: { COOKIE_NAME: "buleje-admin-sess" },
  getSessionPayload: mockSesion,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/cache", () => ({
  cacheStore: { get: () => undefined },
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));
vi.mock("@/lib/jsondb", () => ({
  OrdersDB: {
    getById: mockGetById,
    cancelarConReposicion: vi.fn(async () => ({ repuesto: false, items: 0, puntosDevueltos: 0 })),
    delete: vi.fn(async () => undefined),
  },
  NotificationLogsDB: {},
}));
vi.mock("@/lib/db/orders.db", () => ({ OrdersDB: { cambiarEstadoEnLote: mockLote } }));
vi.mock("@/lib/db/dropship.db", () => ({ DropshipDB: {} }));
vi.mock("@/lib/db/pedido-historial.db", () => ({
  MAX_PEDIDOS_HISTORIAL: 200,
  PedidoHistorialDB: { deVarios: mockDeVarios, anotar: vi.fn() },
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/audit/audit-context", () => ({
  runWithAuditContext: (_r: unknown, _u: unknown, fn: () => unknown) => fn(),
}));
vi.mock("@/lib/activity-logger", () => ({ logActivity: mockLogActivity }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/admin-cache", () => ({ invalidateAdminCache: { afterOrder: vi.fn() } }));
vi.mock("@/lib/db/coupons.db", () => ({ CouponsDB: {} }));
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: {} }));
vi.mock("@/lib/whatsapp", () => ({ getWhatsAppLink: vi.fn(), sendWhatsAppNotification: vi.fn() }));
vi.mock("@/lib/push-sender", () => ({ sendPushToPhone: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/loyalty/auto-earn", () => ({ autoEarnLoyaltyPoints: vi.fn() }));

import { PATCH, DELETE } from "@/app/api/orders/[id]/route";
import { POST as bulk } from "@/app/api/orders/bulk-status/route";
import { GET as historial } from "@/app/api/orders/historial/route";

const TENANT = "t-bodega";
const ctx = { params: Promise.resolve({ id: "ord-1" }) };
const conSesion = (url: string, init: { method: string; body?: unknown }) =>
  new NextRequest(url, {
    method: init.method,
    headers: { cookie: "buleje-admin-sess=tok", "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const comoRol = (role: string) => mockSesion.mockResolvedValue({ role, username: `qa-${role}`, tenantId: TENANT });

beforeEach(() => {
  vi.clearAllMocks();
  mockLogActivity.mockResolvedValue(undefined);
  // Pasar el portón y no encontrar el pedido = 404: prueba que el rol entró.
  mockGetById.mockResolvedValue(null);
  mockLote.mockResolvedValue({ actualizados: [], rechazados: [], sinCambio: [], noEncontrados: ["ord-1"], stockRepuesto: 0 });
  mockDeVarios.mockResolvedValue({});
});

describe("PATCH /api/orders/[id]", () => {
  const patch = () => PATCH(conSesion("http://localhost/api/orders/ord-1", { method: "PATCH", body: { status: "cancelado" } }), ctx);

  it.each(["almacenero", "analista", "delivery", "proveedor"])("%s → 403 sin leer el pedido", async (rol) => {
    comoRol(rol);
    const res = await patch();
    expect(res.status).toBe(403);
    expect(mockGetById).not.toHaveBeenCalled();
  });

  it.each(["cajero", "tienda_owner", "admin", "owner", "manager"])("%s pasa (404 del pedido inexistente)", async (rol) => {
    comoRol(rol);
    const res = await patch();
    expect(res.status).toBe(404);
    expect(mockGetById).toHaveBeenCalledWith(TENANT, "ord-1");
  });

  it("sin sesión → 401", async () => {
    mockSesion.mockResolvedValue(null);
    expect((await patch()).status).toBe(401);
  });
});

describe("DELETE /api/orders/[id]", () => {
  const borrar = () => DELETE(conSesion("http://localhost/api/orders/ord-1", { method: "DELETE" }), ctx);

  it.each(["cajero", "almacenero", "tienda_owner", "delivery"])("%s → 403", async (rol) => {
    comoRol(rol);
    expect((await borrar()).status).toBe(403);
  });

  it.each(["admin", "owner", "manager"])("%s borra y el log lleva el negocio", async (rol) => {
    comoRol(rol);
    expect((await borrar()).status).toBeLessThan(300);
    // 7.º argumento = tenantId: sin él la fila quedaba en `__unknown__`.
    expect(mockLogActivity.mock.calls[0]?.[6]).toBe(TENANT);
  });
});

describe("POST /api/orders/bulk-status", () => {
  const lote = () => bulk(conSesion("http://localhost/api/orders/bulk-status", { method: "POST", body: { ids: ["ord-1"], status: "cancelado" } }));

  it("almacenero → 403 sin tocar el lote", async () => {
    comoRol("almacenero");
    expect((await lote()).status).toBe(403);
    expect(mockLote).not.toHaveBeenCalled();
  });

  it("cajero pasa", async () => {
    comoRol("cajero");
    expect((await lote()).status).toBe(404);
    expect(mockLote).toHaveBeenCalledWith(TENANT, ["ord-1"], "cancelado");
  });
});

describe("GET /api/orders/historial", () => {
  const leer = () => historial(conSesion("http://localhost/api/orders/historial?ids=ord-1", { method: "GET" }));

  it.each(["delivery", "proveedor"])("%s → 403 (no ve las notas del equipo)", async (rol) => {
    comoRol(rol);
    expect((await leer()).status).toBe(403);
    expect(mockDeVarios).not.toHaveBeenCalled();
  });

  it.each(["cajero", "almacenero", "analista", "tienda_owner", "manager"])("%s lee", async (rol) => {
    comoRol(rol);
    expect((await leer()).status).toBe(200);
    expect(mockDeVarios).toHaveBeenCalledWith(TENANT, ["ord-1"]);
  });
});
