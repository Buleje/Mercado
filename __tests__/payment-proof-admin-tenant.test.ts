/**
 * GET /api/admin/orders/[id]/payment-proof — sólo el admin del MISMO negocio.
 *
 * Hasta el 01-10-2026 un owner/admin/manager de `main` contaba como superadmin
 * y leía el comprobante Yape (imagen, montos, operación) de un pedido de
 * CUALQUIER negocio con sólo saber su id. Este test es el que lo hubiera
 * cazado: la sesión es de `main` y el pedido es de otro negocio.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const H = vi.hoisted(() => ({
  sesion: { tenantId: "main", role: "admin", username: "qa" } as Record<string, string>,
  pedido: null as null | { id: string; tenantId: string; paymentApprovalId: string | null },
  aprobacionWhere: null as unknown,
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => H.sesion),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findUnique: vi.fn(async () => H.pedido) },
    paymentApproval: {
      findFirst: vi.fn(async (args: { where: unknown }) => {
        H.aprobacionWhere = args.where;
        return { id: "ap1", imageUrl: "https://x/comprobante.jpg", status: "approved", createdAt: new Date() };
      }),
    },
  },
}));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const pedir = async () => {
  const { GET } = await import("@/app/api/admin/orders/[id]/payment-proof/route");
  const req = new NextRequest("http://localhost/api/admin/orders/o1/payment-proof");
  return GET(req, { params: Promise.resolve({ id: "o1" }) }) as Promise<NextResponse>;
};

describe("payment-proof — aislamiento entre negocios", () => {
  beforeEach(() => {
    H.sesion = { tenantId: "main", role: "admin", username: "qa" };
    H.aprobacionWhere = null;
  });

  it("un admin de `main` NO ve el comprobante de un pedido de otro negocio", async () => {
    H.pedido = { id: "o1", tenantId: "negocio-ajeno", paymentApprovalId: "ap1" };
    const res = await pedir();
    expect(res.status).toBe(403);
    expect(H.aprobacionWhere).toBeNull();
  });

  it("el admin del mismo negocio sí lo ve, y la lectura va filtrada por su negocio", async () => {
    H.sesion = { tenantId: "negocio-a", role: "owner", username: "dueno" };
    H.pedido = { id: "o1", tenantId: "negocio-a", paymentApprovalId: "ap1" };
    const res = await pedir();
    expect(res.status).toBe(200);
    expect(H.aprobacionWhere).toEqual({ id: "ap1", tenantId: "negocio-a" });
  });
});
