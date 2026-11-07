/**
 * La purga de 90 días de ActivityLog no borra las notas internas de pedidos
 * (security 17-10): viven sólo en ActivityLog (`entity="pedido"`,
 * `action=ACCION_NOTA_PEDIDO`) y son datos del pedido, no auditoría.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const { mockBorrarLog, mockBorrarSalud } = vi.hoisted(() => ({
  mockBorrarLog: vi.fn(async (_args: unknown) => ({ count: 3 })),
  mockBorrarSalud: vi.fn(async (_args: unknown) => ({ count: 1 })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { activityLog: { deleteMany: mockBorrarLog }, cronHealthLog: { deleteMany: mockBorrarSalud } },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { GET } from "@/app/api/cron/activity-log-purge/route";
import { ACCION_NOTA_PEDIDO } from "@/lib/db/pedido-historial.db";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "secreto-test";
});

describe("GET /api/cron/activity-log-purge", () => {
  it("borra lo viejo menos las notas internas de pedidos", async () => {
    const res = await GET(new NextRequest("http://localhost/api/cron/activity-log-purge", { headers: { authorization: "Bearer secreto-test" } }));
    expect(res.status).toBe(200);
    const where = (mockBorrarLog.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
    expect(ACCION_NOTA_PEDIDO).toBe("Nota interna");
    expect(where.NOT).toEqual({ entity: "pedido", action: "Nota interna" });
    expect(where.createdAt).toHaveProperty("lt");
  });

  it("sin el secreto del cron → 401 y no borra nada", async () => {
    const res = await GET(new NextRequest("http://localhost/api/cron/activity-log-purge"));
    expect(res.status).toBe(401);
    expect(mockBorrarLog).not.toHaveBeenCalled();
  });
});
