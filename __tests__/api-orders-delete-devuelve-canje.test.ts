/**
 * DELETE /api/orders/[id] devuelve stock y puntos canjeados antes de borrar
 * (reviewer 2026-10-08). «Rechazar Yape» del panel borra el pedido pendiente:
 * sin esto el cliente perdía los puntos que había canjeado.
 *
 * La regla «una sola vez y nunca de un entregado» vive en
 * `OrdersDB.cancelarConReposicion` (probada en orders-db-canje-puntos.test.ts);
 * acá se prueba que el borrado pasa por ella, con el negocio del JWT.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const { llamadas, mockCancelar, mockDelete, mockRequireAdmin } = vi.hoisted(() => {
  const llamadas: string[] = [];
  return {
    llamadas,
    mockCancelar: vi.fn(async (..._a: unknown[]) => {
      llamadas.push("cancelar");
      return { repuesto: true, items: 1, puntosDevueltos: 300 };
    }),
    mockDelete: vi.fn(async (..._a: unknown[]) => {
      llamadas.push("delete");
    }),
    mockRequireAdmin: vi.fn(),
  };
});

vi.mock("@/lib/jsondb", () => ({
  OrdersDB: { cancelarConReposicion: mockCancelar, delete: mockDelete },
  NotificationLogsDB: {},
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/audit/audit-context", () => ({
  runWithAuditContext: (_r: unknown, _u: unknown, fn: () => unknown) => fn(),
}));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/cache", () => ({ invalidate: vi.fn(), invalidateByPrefix: vi.fn() }));
vi.mock("@/lib/admin-cache", () => ({ invalidateAdminCache: { afterOrder: vi.fn() } }));
vi.mock("@/lib/db/coupons.db", () => ({ CouponsDB: {} }));
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: {} }));
vi.mock("@/lib/whatsapp", () => ({ getWhatsAppLink: vi.fn(), sendWhatsAppNotification: vi.fn() }));
vi.mock("@/lib/push-sender", () => ({ sendPushToPhone: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/loyalty/auto-earn", () => ({ autoEarnLoyaltyPoints: vi.fn() }));

import { DELETE } from "@/app/api/orders/[id]/route";

const borrar = (id: string, headers: Record<string, string> = {}) =>
  DELETE(new NextRequest(`http://localhost/api/orders/${id}`, { method: "DELETE", headers }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  llamadas.length = 0;
  mockCancelar.mockClear();
  mockDelete.mockClear();
  mockRequireAdmin.mockReset();
});

describe("DELETE /api/orders/[id] — devuelve el canje", () => {
  it("cancela con reposición ANTES de borrar, con el negocio del JWT", async () => {
    mockRequireAdmin.mockResolvedValue({ tenantId: "tenant-a", username: "dueno" });
    // El header dice otro negocio: manda el JWT.
    const res = await borrar("ord-1", { "x-tenant-id": "tenant-b" });

    expect(res.status).toBe(204);
    expect(llamadas).toEqual(["cancelar", "delete"]);
    expect(mockCancelar).toHaveBeenCalledWith("tenant-a", "ord-1", "eliminado");
    expect(mockDelete).toHaveBeenCalledWith("tenant-a", "ord-1");
  });

  it("pedido entregado o ya cancelado: no repone nada y se borra igual", async () => {
    mockRequireAdmin.mockResolvedValue({ tenantId: "tenant-a", username: "dueno" });
    mockCancelar.mockResolvedValueOnce({ repuesto: false, items: 0, puntosDevueltos: 0 });
    const res = await borrar("ord-2");
    expect(res.status).toBe(204);
    expect(llamadas).toEqual(["delete"]);
  });

  it("sin sesión de admin: 401 y no toca stock, puntos ni el pedido", async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const res = await borrar("ord-1");
    expect(res.status).toBe(401);
    expect(mockCancelar).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
